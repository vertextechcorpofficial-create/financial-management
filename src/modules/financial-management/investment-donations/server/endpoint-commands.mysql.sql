-- MySQL 8.0.21+. Apply once, after normalized-storage.mysql.sql, with writers paused.
-- Directus database connection: SELECT settings; SELECT/INSERT/UPDATE commands.
-- Neither table should expose ordinary user access through /items, including
-- READ: command inputs can contain financial and personal information. Use the
-- authenticated, actor-scoped endpoint for status instead.
CREATE TABLE cgl_endpoint_settings (
  id TINYINT UNSIGNED PRIMARY KEY CHECK (id = 1),
  service_user CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  auth_me_url VARCHAR(2048) NOT NULL,
  workspace_roles JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (JSON_TYPE(workspace_roles) = 'OBJECT')
) ENGINE=InnoDB;

-- Fill these values using your EXISTING Directus service user and Spring /auth/me
-- URL. These are database settings, not new Next.js environment variables.
-- INSERT INTO cgl_endpoint_settings(id,service_user,auth_me_url,workspace_roles,enabled)
-- VALUES (1,'DIRECTUS-SERVICE-USER-UUID','https://YOUR-EXISTING-AUTH-SERVER/auth/me',
--   JSON_OBJECT('101',JSON_OBJECT('transactions','approve','inflows-investing','prepare')),TRUE); -- template only

CREATE TABLE cgl_ledger_commands (
  actor BIGINT UNSIGNED NOT NULL,
  command_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_data JSON NOT NULL,
  state VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  PRIMARY KEY(actor,command_id), INDEX cgl_command_created(created_at),
  CHECK (actor > 0), CHECK (state IN ('processing','completed','failed')),
  CHECK ((state='processing' AND result IS NULL AND completed_at IS NULL) OR
    (state IN ('completed','failed') AND result IS NOT NULL AND completed_at IS NOT NULL))
) ENGINE=InnoDB;

DELIMITER //
CREATE TRIGGER cgl_commands_no_delete BEFORE DELETE ON cgl_ledger_commands
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Command receipts cannot be deleted.'//
CREATE TRIGGER cgl_commands_finish_only BEFORE UPDATE ON cgl_ledger_commands
FOR EACH ROW
BEGIN
  IF OLD.state <> 'processing' OR NEW.state NOT IN ('completed','failed') OR
     NEW.actor <> OLD.actor OR NEW.command_id <> OLD.command_id OR
     NEW.payload_hash <> OLD.payload_hash OR NEW.operation <> OLD.operation OR
     NOT (NEW.request_data <=> OLD.request_data) OR NOT (NEW.created_at <=> OLD.created_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Command receipts are immutable after completion.';
  END IF;
END//
DELIMITER ;
                