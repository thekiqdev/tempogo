DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_platform') THEN CREATE ROLE cronocheckpoint_platform NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
ALTER TABLE app.users ADD COLUMN auth_version integer NOT NULL DEFAULT 0;
CREATE FUNCTION app.bump_auth_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.active IS DISTINCT FROM OLD.active THEN NEW.auth_version := OLD.auth_version+1; ELSE NEW.auth_version := OLD.auth_version; END IF; RETURN NEW; END $$;
CREATE TRIGGER user_auth_changed BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.bump_auth_version();
CREATE TABLE app.platform_bootstrap (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), user_id uuid NOT NULL REFERENCES app.users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app.platform_privileges (user_id uuid PRIMARY KEY REFERENCES app.users(id), state text NOT NULL CHECK(state IN ('invited','active','revoked')), version integer NOT NULL DEFAULT 0, recovery_pending boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app.platform_mfa (user_id uuid PRIMARY KEY REFERENCES app.users(id), secret_cipher text NOT NULL, last_step bigint NOT NULL DEFAULT -1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app.platform_recovery_codes (user_id uuid NOT NULL REFERENCES app.users(id), code_hash text NOT NULL, used_at timestamptz, PRIMARY KEY(user_id,code_hash));
CREATE TABLE app.platform_sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app.users(id), auth_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz, reauthenticated_until timestamptz);
CREATE TABLE app.platform_challenges (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app.users(id), auth_version integer NOT NULL, purpose text NOT NULL CHECK(purpose IN ('verify','enroll')), secret_cipher text, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE app.platform_mfa_resets (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app.users(id), auth_version integer NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE app.platform_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES app.users(id), target_id uuid REFERENCES app.users(id), action text NOT NULL, reason text, request_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON app.platform_sessions(user_id);
CREATE INDEX ON app.platform_challenges(user_id);
CREATE INDEX ON app.platform_audit(created_at DESC,id);
GRANT USAGE ON SCHEMA app TO cronocheckpoint_platform;
GRANT SELECT,UPDATE ON app.users TO cronocheckpoint_platform;
GRANT SELECT,UPDATE ON app.platform_privileges TO cronocheckpoint_platform;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.platform_mfa,app.platform_recovery_codes,app.platform_sessions,app.platform_challenges,app.platform_mfa_resets,app.password_tokens,app.auth_limits TO cronocheckpoint_platform;
GRANT SELECT,INSERT ON app.platform_audit TO cronocheckpoint_platform;
-- No privilege provisioning, tenant writes or bootstrap grants to either runtime.
GRANT SELECT,UPDATE ON app.sessions TO cronocheckpoint_platform;
