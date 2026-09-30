ALTER TABLE app.checkpoint_credentials ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE app.checkpoint_sessions ALTER COLUMN expires_at DROP NOT NULL;
UPDATE app.checkpoint_credentials SET expires_at=NULL;
UPDATE app.checkpoint_sessions SET expires_at=NULL WHERE revoked_at IS NULL;
