ALTER TABLE connector_instances DROP CONSTRAINT connector_instances_provider_check;
ALTER TABLE connector_instances ADD CONSTRAINT connector_instances_provider_check CHECK(provider IN ('prometheus','loki','tempo','grafana','github','ntfy','slack','kubernetes'));
CREATE TABLE operational_findings (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 service_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 provider text NOT NULL CHECK(provider='kubernetes'),
 outcome text NOT NULL CHECK(outcome IN ('ok','empty','partial','unavailable','denied')),
 provenance text NOT NULL CHECK(provenance IN ('live','simulated')),
 observed_at timestamptz,
 collected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 mapping jsonb NOT NULL,
 detail jsonb NOT NULL,
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id),
 FOREIGN KEY(workspace_id,connector_id,provider) REFERENCES connector_instances(workspace_id,id,provider),
 FOREIGN KEY(workspace_id,connector_id,config_version) REFERENCES connector_versions(workspace_id,connector_id,version)
);
CREATE INDEX operational_findings_service_history ON operational_findings(workspace_id,service_id,collected_at DESC);
ALTER TABLE operational_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_findings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_findings USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER operational_finding_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON operational_findings FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
