CREATE TABLE github_sync_resources (
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 resource_key text NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 500),
 spec jsonb NOT NULL,
 cursor jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','ok','partial','failed','disabled')),
 lease_id uuid,
 lease_at timestamptz,
 next_due_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 last_failure_at timestamptz,
 record_count integer NOT NULL DEFAULT 0,
 error_code text,
 PRIMARY KEY(workspace_id,service_id,connector_id,config_version,resource_key),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,config_version) REFERENCES connector_versions(workspace_id,connector_id,version)
);
CREATE INDEX github_resources_due ON github_sync_resources(workspace_id,next_due_at) WHERE status<>'disabled';
CREATE TABLE github_changes (
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 resource_key text NOT NULL,
 external_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('commits','deployments','actions','checks','deployment-statuses')),
 provider_id text NOT NULL,
 revision text,
 status text,
 occurred_at timestamptz NOT NULL,
 time_basis text NOT NULL CHECK(time_basis IN ('provider','collected')),
 title text NOT NULL,
 url text,
 collected_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,service_id,connector_id,resource_key,external_id),
 FOREIGN KEY(workspace_id,service_id,connector_id,config_version,resource_key) REFERENCES github_sync_resources(workspace_id,service_id,connector_id,config_version,resource_key)
);
CREATE TABLE connector_sync_requests (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 requested_by text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 record_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,config_version) REFERENCES connector_versions(workspace_id,connector_id,version)
);
CREATE UNIQUE INDEX one_connector_sync_request ON connector_sync_requests(workspace_id,connector_id) WHERE status IN ('queued','running');
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['github_sync_resources','github_changes','connector_sync_requests'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text = current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text = current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
