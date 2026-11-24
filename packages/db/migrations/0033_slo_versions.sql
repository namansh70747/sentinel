CREATE TABLE slo_versions (
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 availability_target double precision NOT NULL,
 latency_target_ms double precision NOT NULL,
 good_query text NOT NULL,
 total_query text NOT NULL,
 latency_query text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,service_id,version),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
CREATE TRIGGER slo_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON slo_versions FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
ALTER TABLE slo_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slo_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON slo_versions USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
