ALTER TABLE app.events ADD COLUMN paused_for_edit boolean NOT NULL DEFAULT false CHECK (NOT paused_for_edit OR state='closed');
