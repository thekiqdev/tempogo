-- Shared identity password recovery must be audited in the same transaction.
-- Tenant runtime may append sanitized identity events, never read or change global history.
GRANT INSERT ON app.platform_audit TO cronocheckpoint_app;
