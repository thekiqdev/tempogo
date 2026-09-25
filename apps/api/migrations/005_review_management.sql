CREATE TABLE app.observation_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 observation_id uuid NOT NULL, request_id uuid NOT NULL, version int NOT NULL CHECK(version>0),
 actor_id uuid NOT NULL REFERENCES app.users(id), reason text NOT NULL CHECK(length(reason)>=3),
 bib text NOT NULL CHECK(bib ~ '^[0-9]{1,8}$'), captured_at timestamptz NOT NULL,
 disposition text NOT NULL CHECK(disposition IN ('accepted','invalidated')),
 before_value jsonb NOT NULL, canonical_payload jsonb NOT NULL,
 reviewed_flags text[] NOT NULL, reviewed_requests uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,observation_id,version), UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,observation_id) REFERENCES app.observations(organization_id,id)
);
CREATE TABLE app.review_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 observation_id uuid NOT NULL, session_id uuid NOT NULL REFERENCES app.checkpoint_sessions(id),
 request_id uuid NOT NULL, reason text NOT NULL CHECK(length(reason)>=3),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,request_id),
 FOREIGN KEY(organization_id,observation_id) REFERENCES app.observations(organization_id,id)
);
CREATE TABLE app.device_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 event_id uuid NOT NULL, credential_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES app.users(id), reason text NOT NULL CHECK(length(reason)>=3),
 event_version int NOT NULL, evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,event_id) REFERENCES app.events(organization_id,id),
 FOREIGN KEY(organization_id,credential_id) REFERENCES app.checkpoint_credentials(organization_id,id)
);
CREATE INDEX ON app.observation_revisions(organization_id,observation_id,version DESC);
CREATE INDEX ON app.review_requests(organization_id,observation_id);
CREATE INDEX ON app.device_reconciliations(organization_id,event_id,credential_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['observation_revisions','review_requests','device_reconciliations'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_scope ON app.%I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON app.observation_revisions,app.review_requests,app.device_reconciliations TO cronocheckpoint_app;
