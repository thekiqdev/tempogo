CREATE TABLE app.platform_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  logo_data_url text,
  mfa_required boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 0
);
INSERT INTO app.platform_settings(singleton) VALUES(true);
GRANT SELECT, UPDATE ON app.platform_settings TO cronocheckpoint_platform;
ALTER TABLE app.platform_sessions ADD COLUMN mfa_authenticated boolean NOT NULL DEFAULT true;
