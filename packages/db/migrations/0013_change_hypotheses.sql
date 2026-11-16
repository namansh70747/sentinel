ALTER TABLE ecs_evidence ADD CONSTRAINT ecs_evidence_exact_service UNIQUE(workspace_id,incident_id,service_id);
CREATE TABLE change_hypotheses (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 hypothesis jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,incident_id),
 FOREIGN KEY(workspace_id,incident_id,service_id) REFERENCES ecs_evidence(workspace_id,incident_id,service_id)
);
ALTER TABLE change_hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_hypotheses FORCE ROW LEVEL SECURITY;
CREATE POLICY hypothesis_workspace ON change_hypotheses USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER hypotheses_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON change_hypotheses FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
