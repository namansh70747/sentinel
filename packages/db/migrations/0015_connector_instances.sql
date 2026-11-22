CREATE TABLE connector_instances (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('prometheus','loki','tempo','grafana','github','ntfy','slack')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 mode text NOT NULL CHECK(mode IN ('live','off')),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
 secret_envelope jsonb,
 config_version integer NOT NULL DEFAULT 1 CHECK(config_version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,id,provider)
);
CREATE TABLE connector_versions (
 workspace_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 version integer NOT NULL,
 name text NOT NULL,
 mode text NOT NULL,
 config jsonb NOT NULL,
 secret_envelope jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,connector_id,version),
 FOREIGN KEY(workspace_id,connector_id) REFERENCES connector_instances(workspace_id,id)
);
CREATE TRIGGER connector_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON connector_versions FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TABLE service_connector_bindings (
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 provider text NOT NULL,
 connector_id uuid NOT NULL,
 mapping jsonb NOT NULL CHECK(jsonb_typeof(mapping)='object'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,service_id,provider),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,provider) REFERENCES connector_instances(workspace_id,id,provider)
);
CREATE TABLE connector_tests (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 attempts integer NOT NULL DEFAULT 0,
 result jsonb,
 requested_by text NOT NULL,
 started_at timestamptz,
 finished_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,config_version) REFERENCES connector_versions(workspace_id,connector_id,version)
);
CREATE INDEX connector_test_pending ON connector_tests(workspace_id,created_at) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX connector_one_pending_test ON connector_tests(workspace_id,connector_id) WHERE status IN ('queued','running');
CREATE INDEX connector_test_history ON connector_tests(workspace_id,connector_id,created_at DESC);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['connector_instances','connector_versions','service_connector_bindings','connector_tests'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text = current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text = current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
