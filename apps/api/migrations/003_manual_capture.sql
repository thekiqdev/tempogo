-- Credentials and sessions are identity records: global lookup, tenant bound by composite FKs.
CREATE TABLE app.checkpoint_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 event_id uuid NOT NULL, checkpoint_id uuid NOT NULL, device_id uuid NOT NULL DEFAULT gen_random_uuid(),
 code text UNIQUE NOT NULL CHECK(code ~ '^[A-F0-9]{8}$'), password_hash text NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 2 AND 80),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,event_id,checkpoint_id,id), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,event_id,checkpoint_id) REFERENCES app.checkpoints(organization_id,event_id,id)
);
CREATE TABLE app.checkpoint_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL,
 organization_id uuid NOT NULL, event_id uuid NOT NULL, checkpoint_id uuid NOT NULL, credential_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 UNIQUE(organization_id,event_id,checkpoint_id,id),
 FOREIGN KEY(organization_id,event_id,checkpoint_id,credential_id)
 REFERENCES app.checkpoint_credentials(organization_id,event_id,checkpoint_id,id)
);
CREATE TABLE app.observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 event_id uuid NOT NULL, checkpoint_id uuid NOT NULL, session_id uuid NOT NULL, device_id uuid NOT NULL,
 client_event_id uuid NOT NULL, bib text NOT NULL CHECK(bib ~ '^[0-9]{1,8}$'),
 raw_captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source text NOT NULL DEFAULT 'manual' CHECK(source='manual'), canonical_payload jsonb NOT NULL,
 UNIQUE(organization_id,event_id,client_event_id), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,event_id,checkpoint_id,session_id)
 REFERENCES app.checkpoint_sessions(organization_id,event_id,checkpoint_id,id)
);
CREATE INDEX observation_history ON app.observations(organization_id,event_id,received_at DESC,id);
CREATE INDEX observation_duplicate ON app.observations(organization_id,event_id,checkpoint_id,bib,raw_captured_at);
CREATE TABLE app.observation_flags (
 organization_id uuid NOT NULL, observation_id uuid NOT NULL, reason text NOT NULL CHECK(reason='possible_duplicate'),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,observation_id,reason),
 FOREIGN KEY(organization_id,observation_id) REFERENCES app.observations(organization_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['observations','observation_flags'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON app.%I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
-- Runtime has no mutation privileges on raw observations, flags or audit.
GRANT SELECT,INSERT ON app.observations,app.observation_flags TO cronocheckpoint_app;
GRANT SELECT,INSERT,UPDATE ON app.checkpoint_credentials,app.checkpoint_sessions TO cronocheckpoint_app;
