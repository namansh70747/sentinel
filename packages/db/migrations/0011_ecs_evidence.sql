CREATE TABLE ecs_evidence (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 observation jsonb NOT NULL,
 collected_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,incident_id),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
ALTER TABLE ecs_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecs_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY ecs_evidence_workspace ON ecs_evidence USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER ecs_evidence_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ecs_evidence FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
