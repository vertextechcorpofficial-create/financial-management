-- MySQL 8.0.16+. Apply after directus-ledger.mysql.sql.
-- Select the database backing Directus before running this file.
-- Run once with a migration account; existing tables are not replaced.
-- Application privileges:
--   cgl_reconciliations: SELECT, INSERT, UPDATE
--   cgl_reconciliation_events: SELECT, INSERT
-- Do not grant DELETE or DDL to the application account.

CREATE TABLE cgl_reconciliations (
    month_start DATE PRIMARY KEY,
    revision BIGINT UNSIGNED NOT NULL,
    prepared_by BIGINT UNSIGNED NOT NULL,
    approved_by BIGINT UNSIGNED NULL,
    signed_at DATETIME(3) NULL,
    payload JSON NOT NULL,
    CONSTRAINT cgl_recon_first_day CHECK (DAYOFMONTH(month_start) = 1),
    CONSTRAINT cgl_recon_revision_positive CHECK (revision > 0),
    CONSTRAINT cgl_recon_preparer CHECK (prepared_by > 0),
    CONSTRAINT cgl_recon_signoff CHECK (
        (signed_at IS NULL AND approved_by IS NULL)
        OR (signed_at IS NOT NULL AND approved_by IS NOT NULL
            AND approved_by > 0 AND approved_by <> prepared_by)
    ),
    CONSTRAINT cgl_recon_payload_object CHECK (JSON_TYPE(payload) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cgl_reconciliation_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    month_start DATE NOT NULL,
    actor BIGINT UNSIGNED NOT NULL,
    revision BIGINT UNSIGNED NOT NULL,
    action VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    before_state JSON NULL,
    after_state JSON NOT NULL,
    occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY cgl_recon_event_revision (month_start, revision),
    CONSTRAINT cgl_recon_events_month_fk FOREIGN KEY (month_start)
        REFERENCES cgl_reconciliations(month_start),
    CONSTRAINT cgl_recon_events_actor CHECK (actor > 0),
    CONSTRAINT cgl_recon_events_revision_positive CHECK (revision > 0),
    CONSTRAINT cgl_recon_events_action CHECK (action IN ('draft', 'sign', 'reopen'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No foreign key from reconciliation month to cgl_periods: reconciliation
-- drafts may be saved before a journal entry creates the period row.

DELIMITER //
CREATE TRIGGER cgl_recon_events_no_update BEFORE UPDATE ON cgl_reconciliation_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reconciliation events are append-only.';
END//
CREATE TRIGGER cgl_recon_events_no_delete BEFORE DELETE ON cgl_reconciliation_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reconciliation events are append-only.';
END//
DELIMITER ;

-- Verify after applying:
-- SHOW CREATE TABLE cgl_reconciliations;
-- SHOW CREATE TABLE cgl_reconciliation_events;
