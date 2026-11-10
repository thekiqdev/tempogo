ALTER TABLE app.platform_settings
  ADD COLUMN IF NOT EXISTS wiclax_ports integer[];

UPDATE app.platform_settings
SET wiclax_ports = ARRAY(SELECT generate_series(3097, 3116))
WHERE singleton AND (wiclax_ports IS NULL OR cardinality(wiclax_ports) = 0);

ALTER TABLE app.platform_settings
  ALTER COLUMN wiclax_ports SET DEFAULT '{}',
  ALTER COLUMN wiclax_ports SET NOT NULL;

GRANT SELECT (wiclax_ports) ON app.platform_settings TO cronocheckpoint_app;
