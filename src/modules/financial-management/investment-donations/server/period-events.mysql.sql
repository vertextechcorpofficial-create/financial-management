-- MySQL 8.0.16+. Apply after directus-ledger.mysql.sql.
-- Select the database backing Directus before running this file.
-- Run once with a migration account; existing tables are not replaced.
-- The application needs SELECT and INSERT, but not UPDATE or DELETE.

CREATE TABLE cgl_period_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    month_start DATE NOT NULL,
    actor BIGINT UNSIGNED NOT NULL,
    action VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    entry_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    reason VARCHAR(500) NULL,
    occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX cgl_period_events_month_idx (month_start, id),
    CONSTRAINT cgl_period_events_first_day CHECK (DAYOFMONTH(month_start) = 1),
    CONSTRAINT cgl_period_events_actor CHECK (actor > 0),
    CONSTRAINT cgl_period_events_action CHECK (action IN ('accrue', 'close', 'reopen')),
    CONSTRAINT cgl_period_events_reason CHECK (
        action <> 'reopen' OR (reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)
    ),
    CONSTRAINT cgl_period_events_entry_fk FOREIGN KEY (entry_id)
        REFERENCES cgl_journal_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No month_start foreign key: a no-op accrual may record an event before
-- cgl_periods contains that month.

DELIMITER //
CREATE TRIGGER cgl_period_events_no_update BEFORE UPDATE ON cgl_period_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Period events are append-only.';
END//
CREATE TRIGGER cgl_period_events_no_delete BEFORE DELETE ON cgl_period_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Period events are append-only.';
END//
DELIMITER ;

-- Verify after applying:
-- SHOW CREATE TABLE cgl_period_events;
