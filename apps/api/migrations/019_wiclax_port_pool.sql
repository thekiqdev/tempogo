ALTER TABLE app.platform_settings
  ADD COLUMN wiclax_ports integer[] NOT NULL DEFAULT (ARRAY(SELECT generate_series(3097, 3116)));

UPDATE app.platform_settings
SET wiclax_ports = ARRAY(SELECT generate_series(3097, 3116))
WHERE singleton AND (wiclax_ports IS NULL OR cardinality(wiclax_ports) = 0);

GRANT SELECT (wiclax_ports) ON app.platform_settings TO cronocheckpoint_app;
