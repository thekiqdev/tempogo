ALTER TABLE app.users ADD COLUMN version integer NOT NULL DEFAULT 0;
ALTER TABLE app.organization_invitations ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE app.organization_invitations ADD COLUMN kind text NOT NULL DEFAULT 'organization_admin' CHECK(kind IN ('organization_admin','platform_admin'));
ALTER TABLE app.organization_invitations ADD CONSTRAINT invitation_scope CHECK((kind='organization_admin' AND organization_id IS NOT NULL) OR (kind='platform_admin' AND organization_id IS NULL AND NOT initial_responsible));
CREATE UNIQUE INDEX pending_platform_invitation ON app.organization_invitations(email) WHERE kind='platform_admin' AND status='pending';
CREATE TABLE app.email_changes(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES app.users(id),new_email text NOT NULL,old_email text NOT NULL,auth_version integer NOT NULL,user_version integer NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE app.account_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app.users(id),recipient text NOT NULL,kind text NOT NULL CHECK(kind IN ('user-password','mfa','email','email-notice')),token_cipher text,token_hash text,delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sending','sent','failed','cancelled')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT INSERT ON app.platform_privileges TO cronocheckpoint_platform;
GRANT SELECT,INSERT,UPDATE ON app.email_changes,app.account_outbox TO cronocheckpoint_platform;
