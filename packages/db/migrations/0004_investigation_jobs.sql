CREATE TABLE investigation_jobs (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 dispatched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,incident_id),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
CREATE INDEX pending_investigations ON investigation_jobs(created_at) WHERE dispatched_at IS NULL;
