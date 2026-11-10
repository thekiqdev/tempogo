CREATE TABLE app.wiclax_port_leases (
  port integer PRIMARY KEY CHECK (port >= 1024 AND port <= 65535),
  kind text NOT NULL CHECK (kind IN ('lease', 'blocked')),
  organization_id uuid,
  event_id uuid,
  checkpoint_id uuid,
  checkpoint_name text,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wiclax_port_leases_lease_fields CHECK (
    (kind = 'lease' AND organization_id IS NOT NULL AND event_id IS NOT NULL AND checkpoint_id IS NOT NULL AND checkpoint_name IS NOT NULL)
    OR (kind = 'blocked' AND organization_id IS NULL AND event_id IS NULL AND checkpoint_id IS NULL)
  )
);

CREATE UNIQUE INDEX wiclax_port_leases_checkpoint_uidx
  ON app.wiclax_port_leases (checkpoint_id)
  WHERE checkpoint_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.wiclax_port_leases TO cronocheckpoint_app;
GRANT SELECT, DELETE ON app.wiclax_port_leases TO cronocheckpoint_platform;
