CREATE TABLE investigation_runs (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','advised','escalated','failed')),
 requested_by text NOT NULL,
 summary text,
 observed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,id,incident_id,service_id),
 FOREIGN KEY(workspace_id,incident_id,service_id) REFERENCES incidents(workspace_id,id,service_id)
);
CREATE INDEX investigation_run_queue ON investigation_runs(workspace_id,created_at) WHERE status='queued';
CREATE TABLE investigation_source_attempts (
 workspace_id uuid NOT NULL,
 run_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('prometheus','ecs','loki','tempo','github','cloudwatch','cost','dr')),
 id uuid NOT NULL,
 connector_id uuid,
 config_version integer,
 mapping jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,run_id,source),
 UNIQUE(workspace_id,run_id,source,id),
 FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,config_version) REFERENCES connector_versions(workspace_id,connector_id,version),
 CHECK((connector_id IS NULL)=(config_version IS NULL))
);
CREATE TABLE investigation_evidence (
 workspace_id uuid NOT NULL,
 run_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 source text NOT NULL,
 attempt_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('ok','unavailable','stale','not-configured','uncovered','empty','denied')),
 provenance text CHECK(provenance IN ('live','simulated')),
 severity text NOT NULL CHECK(severity IN ('sev1','sev2','sev3','sev4')),
 detail jsonb NOT NULL,
 observed_at timestamptz,
 collected_at timestamptz NOT NULL DEFAULT now(),
 window_covered boolean,
 PRIMARY KEY(workspace_id,run_id,source),
 FOREIGN KEY(workspace_id,run_id,incident_id,service_id) REFERENCES investigation_runs(workspace_id,id,incident_id,service_id),
 FOREIGN KEY(workspace_id,run_id,source,attempt_id) REFERENCES investigation_source_attempts(workspace_id,run_id,source,id)
);
CREATE TRIGGER investigation_attempt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON investigation_source_attempts FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER investigation_envelope_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON investigation_evidence FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['investigation_runs','investigation_source_attempts','investigation_evidence'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text = current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text = current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
