-- A API dos checkpoints (cronocheckpoint_app) precisa ler o pool cadastrado.
-- SELECT só em wiclax_ports falha no WHERE singleton sem privilégio nessa coluna,
-- e o manager caía no default 3097-3116.
GRANT SELECT (singleton, wiclax_ports) ON app.platform_settings TO cronocheckpoint_app;
