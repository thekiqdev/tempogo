ALTER TABLE app.events ADD COLUMN laps integer NOT NULL DEFAULT 1 CHECK (laps BETWEEN 1 AND 999);
ALTER TABLE app.events ADD COLUMN min_lap_seconds integer NOT NULL DEFAULT 60 CHECK (min_lap_seconds BETWEEN 11 AND 86400);
CREATE TABLE app.event_chips (
 organization_id uuid NOT NULL,
 event_id uuid NOT NULL,
 bib text NOT NULL CHECK (bib ~ '^[0-9]{1,8}$'),
 chip text NOT NULL CHECK (chip ~ '^[A-Za-z0-9_-]{1,128}$'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (organization_id,event_id,bib),
 UNIQUE (organization_id,event_id,chip),
 FOREIGN KEY (organization_id,event_id) REFERENCES app.events(organization_id,id)
);
ALTER TABLE app.event_chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.event_chips FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.event_chips USING (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid) WITH CHECK (organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON app.event_chips TO cronocheckpoint_app;
