CREATE TABLE workspace_events (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 seq bigint NOT NULL,
 type text NOT NULL CHECK(length(type) BETWEEN 1 AND 80),
 subject_id uuid,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,seq)
);
ALTER TABLE workspace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON workspace_events USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER workspace_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON workspace_events FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
