-- Apply to the MySQL 8.0.16+ database backing Directus, using a SQL client
-- that understands DELIMITER. Run once, after confirming the engine/version.
-- This creates new module tables only. It does not migrate records or register navigation.
-- Amounts are integer PHP centavos.

CREATE TABLE cgl_registers (
    name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    payload JSON NOT NULL
) ENGINE=InnoDB;

CREATE TABLE cgl_periods (
    month_start DATE PRIMARY KEY,
    closed_at DATETIME(3) NULL,
    CONSTRAINT cgl_period_first_day CHECK (DAYOFMONTH(month_start) = 1)
) ENGINE=InnoDB;

CREATE TABLE cgl_journal_entries (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    entry_number BIGINT UNSIGNED NOT NULL UNIQUE,
    entry_date DATE NOT NULL,
    entry_type VARCHAR(40) NOT NULL,
    memo VARCHAR(512) NOT NULL,
    entry_data JSON NOT NULL,
    actor BIGINT UNSIGNED NOT NULL COMMENT 'Application user ID; 0 denotes seed/import system actor',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    reverses_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
    sealed TINYINT UNSIGNED NOT NULL DEFAULT 0,
    INDEX cgl_entries_date_idx (entry_date, entry_number),
    CONSTRAINT cgl_entries_sealed_check CHECK (sealed IN (0, 1)),
    CONSTRAINT cgl_entries_reversal_type CHECK ((entry_type = 'reversal') = (reverses_id IS NOT NULL)),
    CONSTRAINT cgl_entries_reversal_fk FOREIGN KEY (reverses_id) REFERENCES cgl_journal_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cgl_journal_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entry_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    line_no INT UNSIGNED NOT NULL,
    account CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    debit BIGINT UNSIGNED NOT NULL,
    credit BIGINT UNSIGNED NOT NULL,
    tag VARCHAR(255) NOT NULL DEFAULT '',
    UNIQUE KEY cgl_lines_position (entry_id, line_no),
    CONSTRAINT cgl_lines_entry_fk FOREIGN KEY (entry_id) REFERENCES cgl_journal_entries(id),
    CONSTRAINT cgl_lines_one_side CHECK (
        (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cgl_audit_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entry_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor BIGINT UNSIGNED NOT NULL,
    occurred_at DATETIME(3) NOT NULL,
    action VARCHAR(40) NOT NULL,
    after_state JSON NOT NULL,
    INDEX cgl_audit_entry_idx (entry_id),
    CONSTRAINT cgl_audit_entry_fk FOREIGN KEY (entry_id) REFERENCES cgl_journal_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER //

CREATE TRIGGER cgl_entry_before_insert BEFORE INSERT ON cgl_journal_entries
FOR EACH ROW
BEGIN
    DECLARE period_month DATE;
    DECLARE period_closed DATETIME(3);
    IF NEW.sealed <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insert the journal header before sealing.';
    END IF;
    SET period_month = DATE_SUB(NEW.entry_date, INTERVAL (DAYOFMONTH(NEW.entry_date) - 1) DAY);
    INSERT INTO cgl_periods (month_start) VALUES (period_month)
        ON DUPLICATE KEY UPDATE month_start = period_month;
    SELECT closed_at INTO period_closed FROM cgl_periods WHERE month_start = period_month FOR UPDATE;
    IF period_closed IS NOT NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot post into a closed period.';
    END IF;
END//

CREATE TRIGGER cgl_line_before_insert BEFORE INSERT ON cgl_journal_lines
FOR EACH ROW
BEGIN
    DECLARE header_sealed TINYINT DEFAULT NULL;
    SELECT sealed INTO header_sealed FROM cgl_journal_entries WHERE id = NEW.entry_id FOR UPDATE;
    IF header_sealed IS NULL OR header_sealed <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lines require an unsealed journal header.';
    END IF;
END//

CREATE TRIGGER cgl_entry_before_update BEFORE UPDATE ON cgl_journal_entries
FOR EACH ROW
BEGIN
    DECLARE period_closed DATETIME(3);
    DECLARE line_count BIGINT;
    DECLARE debit_total DECIMAL(65,0);
    DECLARE credit_total DECIMAL(65,0);
    IF OLD.sealed <> 0 OR NEW.sealed <> 1 OR NEW.id <> OLD.id
        OR NEW.entry_number <> OLD.entry_number OR NEW.entry_date <> OLD.entry_date
        OR NOT (BINARY NEW.entry_type <=> BINARY OLD.entry_type)
        OR NOT (BINARY NEW.memo <=> BINARY OLD.memo)
        OR NOT (NEW.entry_data <=> OLD.entry_data)
        OR NEW.actor <> OLD.actor OR NEW.created_at <> OLD.created_at
        OR NOT (NEW.reverses_id <=> OLD.reverses_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the initial journal seal is allowed.';
    END IF;
    SELECT closed_at INTO period_closed
        FROM cgl_periods
        WHERE month_start = DATE_SUB(OLD.entry_date, INTERVAL (DAYOFMONTH(OLD.entry_date) - 1) DAY)
        FOR UPDATE;
    IF period_closed IS NOT NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot post into a closed period.';
    END IF;
    SELECT COUNT(*), SUM(debit), SUM(credit) INTO line_count, debit_total, credit_total
        FROM cgl_journal_lines WHERE entry_id = OLD.id FOR UPDATE;
    IF line_count < 2 OR debit_total <> credit_total THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Journal debits and credits must balance.';
    END IF;
END//

CREATE TRIGGER cgl_entry_no_delete BEFORE DELETE ON cgl_journal_entries
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Journal entries cannot be deleted.'//

CREATE TRIGGER cgl_line_no_update BEFORE UPDATE ON cgl_journal_lines
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Journal lines cannot be updated.'//

CREATE TRIGGER cgl_line_no_delete BEFORE DELETE ON cgl_journal_lines
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Journal lines cannot be deleted.'//

CREATE TRIGGER cgl_audit_no_update BEFORE UPDATE ON cgl_audit_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events cannot be updated.'//

CREATE TRIGGER cgl_audit_no_delete BEFORE DELETE ON cgl_audit_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events cannot be deleted.'//

DELIMITER ;
