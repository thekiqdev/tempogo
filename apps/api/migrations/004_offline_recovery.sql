ALTER TABLE app.observations ADD COLUMN estimated_captured_at timestamptz;
ALTER TABLE app.observations ADD COLUMN timing jsonb;
ALTER TABLE app.observation_flags DROP CONSTRAINT observation_flags_reason_check;
ALTER TABLE app.observation_flags ADD CHECK(reason IN ('possible_duplicate','time_uncertain','late_upload','recovery','outside_grant'));
CREATE TABLE app.capture_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 session_id uuid NOT NULL, event_id uuid NOT NULL, checkpoint_id uuid NOT NULL,
 window_id uuid NOT NULL REFERENCES app.capture_windows(id),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 FOREIGN KEY(organization_id,event_id,checkpoint_id,session_id) REFERENCES app.checkpoint_sessions(organization_id,event_id,checkpoint_id,id)
);
CREATE INDEX ON app.capture_grants(organization_id,session_id,issued_at);
CREATE TABLE app.device_status (
 organization_id uuid NOT NULL, credential_id uuid NOT NULL, session_id uuid NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), pending int NOT NULL CHECK(pending>=0),
 sending int NOT NULL CHECK(sending>=0), synced int NOT NULL CHECK(synced>=0), blocked int NOT NULL CHECK(blocked>=0),
 PRIMARY KEY(organization_id,credential_id),
 FOREIGN KEY(organization_id,credential_id) REFERENCES app.checkpoint_credentials(organization_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['capture_grants','device_status'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON app.%I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON app.capture_grants TO cronocheckpoint_app;
GRANT SELECT,INSERT,UPDATE ON app.device_status TO cronocheckpoint_app;
