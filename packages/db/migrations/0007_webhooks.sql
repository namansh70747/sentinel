CREATE TABLE webhook_endpoints (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 secret_hash text NOT NULL,
 disabled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
CREATE TABLE webhook_deliveries (
 endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id),
 dedupe_key text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(endpoint_id,dedupe_key)
);
