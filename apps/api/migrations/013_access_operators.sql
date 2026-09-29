ALTER TABLE app.checkpoint_credentials ADD COLUMN operator_name text NOT NULL DEFAULT '' CHECK(length(operator_name)<=120);
