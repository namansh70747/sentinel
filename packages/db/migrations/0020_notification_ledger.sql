CREATE TABLE notification_subscriptions (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 service_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 destination_label text NOT NULL CHECK(length(destination_label) BETWEEN 1 AND 160),
 enabled boolean NOT NULL DEFAULT true,
 approved_by text NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,service_id,connector_id,config_version),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,config_version) REFERENCES connector_versions(workspace_id,connector_id,version)
);
CREATE TABLE notification_deliveries (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 subscription_id uuid NOT NULL,
 event_key text NOT NULL,
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 10000),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','confirmed','unknown','failed')),
 attempt_id uuid,
 error_code text,
 provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 finished_at timestamptz,
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,subscription_id,event_key),
 FOREIGN KEY(workspace_id,subscription_id) REFERENCES notification_subscriptions(workspace_id,id)
);
CREATE TABLE notification_attempts (
 workspace_id uuid NOT NULL,
 delivery_id uuid NOT NULL,
 id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('started','sent','confirmed','unknown','failed')),
 error_code text,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(workspace_id,delivery_id,id),
 FOREIGN KEY(workspace_id,delivery_id) REFERENCES notification_deliveries(workspace_id,id)
);
CREATE INDEX notification_queue ON notification_deliveries(workspace_id,created_at) WHERE status IN ('queued','sending');
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['notification_subscriptions','notification_deliveries','notification_attempts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text = current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text = current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
