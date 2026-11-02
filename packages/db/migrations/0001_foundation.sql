CREATE TABLE workspaces (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE services (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 id uuid NOT NULL,
 name text NOT NULL,
 owner text NOT NULL,
 account_id text NOT NULL,
 region text NOT NULL,
 resource_arn text NOT NULL,
 act boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id, id)
);
CREATE TABLE incidents (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 id uuid NOT NULL,
 service_id uuid NOT NULL,
 title text NOT NULL,
 state text NOT NULL CHECK(state IN ('investigating','advised','awaiting_approval','executing','verifying','recovered','escalated','closed')),
 severity text NOT NULL CHECK(severity IN ('sev1','sev2','sev3','sev4')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id, id),
 FOREIGN KEY(workspace_id, service_id) REFERENCES services(workspace_id, id)
);
CREATE TABLE audit_events (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 sequence bigint GENERATED ALWAYS AS IDENTITY,
 id uuid NOT NULL,
 actor text NOT NULL,
 action text NOT NULL,
 payload jsonb NOT NULL,
 previous_hash text NOT NULL,
 hash text NOT NULL CHECK(length(hash) = 64),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id, id),
 UNIQUE(workspace_id, sequence)
);
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit events are append-only'; END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
CREATE POLICY service_workspace ON services USING(workspace_id::text = current_setting('sentinel.workspace_id', true)) WITH CHECK(workspace_id::text = current_setting('sentinel.workspace_id', true));
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY incident_workspace ON incidents USING(workspace_id::text = current_setting('sentinel.workspace_id', true)) WITH CHECK(workspace_id::text = current_setting('sentinel.workspace_id', true));
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_workspace ON audit_events USING(workspace_id::text = current_setting('sentinel.workspace_id', true)) WITH CHECK(workspace_id::text = current_setting('sentinel.workspace_id', true));
