-- MySQL 8.0.16+. Apply after directus-ledger.mysql.sql.
-- Select the database backing Directus before running this file.
-- Run once with a migration account; existing tables are not replaced.
-- The application needs SELECT and INSERT, but not UPDATE or DELETE.

CREATE TABLE cgl_annual_review_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    fiscal_start DATE NOT NULL,
    revision BIGINT UNSIGNED NOT NULL,
    actor BIGINT UNSIGNED NOT NULL,
    prepared_by BIGINT UNSIGNED NOT NULL,
    action VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    checks JSON NOT NULL,
    reason VARCHAR(500) NULL,
    occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY cgl_annual_review_revision (fiscal_start, revision),
    CONSTRAINT cgl_annual_review_first_day CHECK (DAYOFMONTH(fiscal_start) = 1),
    CONSTRAINT cgl_annual_review_revision_positive CHECK (revision > 0),
    CONSTRAINT cgl_annual_review_actors CHECK (actor > 0 AND prepared_by > 0),
    CONSTRAINT cgl_annual_review_action CHECK (action IN ('draft', 'sign', 'reopen')),
    CONSTRAINT cgl_annual_review_independent CHECK (action <> 'sign' OR actor <> prepared_by),
    CONSTRAINT cgl_annual_review_checks CHECK (
        JSON_TYPE(checks) = 'ARRAY' AND JSON_LENGTH(checks) = 5
    ),
    CONSTRAINT cgl_annual_review_reason CHECK (
        action <> 'reopen' OR (reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Checklist boolean values, fiscal-year configuration and state transitions
-- are validated by updateAnnualReview in transactions.mjs.

DELIMITER //
CREATE TRIGGER cgl_annual_review_no_update BEFORE UPDATE ON cgl_annual_review_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Annual review events are append-only.';
END//
CREATE TRIGGER cgl_annual_review_no_delete BEFORE DELETE ON cgl_annual_review_events
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Annual review events are append-only.';
END//
DELIMITER ;

-- Verify after applying:
-- SHOW CREATE TABLE cgl_annual_review_events;
