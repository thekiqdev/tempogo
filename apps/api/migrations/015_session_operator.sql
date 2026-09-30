ALTER TABLE app.checkpoint_sessions ADD COLUMN operator_name text;
UPDATE app.checkpoint_sessions s SET operator_name=c.operator_name FROM app.checkpoint_credentials c WHERE c.organization_id=s.organization_id AND c.id=s.credential_id;
ALTER TABLE app.checkpoint_sessions ADD CONSTRAINT checkpoint_session_operator_length CHECK (length(operator_name)<=120);
