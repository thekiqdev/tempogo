ALTER TABLE app.checkpoint_sessions ADD COLUMN revoked_reason text;
WITH ranked AS (
 SELECT id,row_number() OVER (PARTITION BY credential_id ORDER BY created_at DESC,id DESC) position
 FROM app.checkpoint_sessions WHERE revoked_at IS NULL
)
UPDATE app.checkpoint_sessions s SET revoked_at=clock_timestamp(),revoked_reason='replaced'
FROM ranked r WHERE r.id=s.id AND r.position>1;
CREATE UNIQUE INDEX checkpoint_one_live_session ON app.checkpoint_sessions(credential_id) WHERE revoked_at IS NULL;
