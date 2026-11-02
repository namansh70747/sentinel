CREATE TABLE service_slos (
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 availability_target double precision NOT NULL CHECK(availability_target>0 AND availability_target<1),
 latency_target_ms double precision NOT NULL CHECK(latency_target_ms>0),
 good_query text NOT NULL CHECK(length(good_query) BETWEEN 1 AND 16384),
 total_query text NOT NULL CHECK(length(total_query) BETWEEN 1 AND 16384),
 latency_query text NOT NULL CHECK(length(latency_query) BETWEEN 1 AND 16384),
 PRIMARY KEY(workspace_id,service_id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
CREATE TABLE incident_evidence (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 source text NOT NULL,
 sample jsonb NOT NULL,
 severity text NOT NULL CHECK(severity IN ('sev1','sev2','sev3','sev4')),
 collected_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,incident_id),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
ALTER TABLE service_slos ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_slos FORCE ROW LEVEL SECURITY;
CREATE POLICY slo_workspace ON service_slos USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
ALTER TABLE incident_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_workspace ON incident_evidence USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON incident_evidence FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
