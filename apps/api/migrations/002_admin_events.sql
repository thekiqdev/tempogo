DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_app') THEN CREATE ROLE cronocheckpoint_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
CREATE TABLE app.organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL CHECK(email=lower(email)),
 password_hash text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.memberships (
 organization_id uuid NOT NULL REFERENCES app.organizations(id), user_id uuid NOT NULL REFERENCES app.users(id),
 role text NOT NULL DEFAULT 'admin' CHECK(role='admin'), PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE app.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL, organization_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(organization_id,user_id) REFERENCES app.memberships(organization_id,user_id)
);
CREATE INDEX ON app.sessions(user_id);
CREATE TABLE app.password_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app.users(id),
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app.password_tokens(user_id);
CREATE TABLE app.auth_limits (key text PRIMARY KEY, attempts int NOT NULL, window_start timestamptz NOT NULL);
CREATE TABLE app.events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES app.organizations(id),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120), local_date date NOT NULL,
 timezone text NOT NULL, location text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','ready','running','closed','finalized','archived')),
 version int NOT NULL DEFAULT 0, created_by uuid NOT NULL REFERENCES app.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE TABLE app.race_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL,
 name text NOT NULL, distance_m int CHECK(distance_m>0), gun_start_at timestamptz,
 UNIQUE(organization_id,event_id), UNIQUE(organization_id,event_id,id),
 FOREIGN KEY(organization_id,event_id) REFERENCES app.events(organization_id,id)
);
CREATE TABLE app.checkpoints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL,
 race_category_id uuid NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
 kind text NOT NULL CHECK(kind IN ('start','intermediate','finish')), sequence int NOT NULL CHECK(sequence>0),
 distance_m int CHECK(distance_m>=0), active boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 0,
 UNIQUE(organization_id,id), UNIQUE(organization_id,event_id,id), UNIQUE(organization_id,event_id,sequence),
 FOREIGN KEY(organization_id,event_id,race_category_id) REFERENCES app.race_categories(organization_id,event_id,id)
);
CREATE TABLE app.capture_windows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, event_id uuid NOT NULL,
 opened_at timestamptz NOT NULL, closed_at timestamptz, reason text NOT NULL,
 CHECK(closed_at IS NULL OR closed_at>=opened_at),
 FOREIGN KEY(organization_id,event_id) REFERENCES app.events(organization_id,id)
);
CREATE UNIQUE INDEX capture_window_open ON app.capture_windows(organization_id,event_id) WHERE closed_at IS NULL;
CREATE TABLE app.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES app.organizations(id),
 actor_id uuid REFERENCES app.users(id), action text NOT NULL, resource_id uuid,
 details jsonb NOT NULL DEFAULT '{}', request_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app.events(organization_id,created_at DESC,id);
CREATE INDEX ON app.audit_events(organization_id,created_at DESC,id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['events','race_categories','checkpoints','capture_windows','audit_events'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_scope ON app.%I USING (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA app TO cronocheckpoint_app;
GRANT SELECT ON app.organizations, app.memberships TO cronocheckpoint_app;
GRANT SELECT,UPDATE ON app.users TO cronocheckpoint_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.sessions,app.password_tokens,app.auth_limits TO cronocheckpoint_app;
GRANT SELECT,INSERT,UPDATE ON app.events,app.race_categories,app.checkpoints,app.capture_windows TO cronocheckpoint_app;
GRANT SELECT,INSERT ON app.audit_events TO cronocheckpoint_app;
