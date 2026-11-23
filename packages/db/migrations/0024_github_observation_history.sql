-- Operational backoff survives manual requests, new resources and worker restarts.
ALTER TABLE connector_instances ADD COLUMN sync_backoff_until timestamptz;

-- Preserve the state actually known at an investigation's frozen cutoff.
-- Existing rows start their history at migration time; no historical verification is inferred.
CREATE TABLE github_observation_history (
 workspace_id uuid NOT NULL,
 service_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 config_version integer NOT NULL,
 resource_key text NOT NULL,
 object_type text NOT NULL CHECK(object_type IN ('resource','change')),
 object_key text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sequence bigint GENERATED ALWAYS AS IDENTITY,
 observation jsonb NOT NULL,
 PRIMARY KEY(workspace_id,sequence),
 FOREIGN KEY(workspace_id,service_id,connector_id,config_version,resource_key)
  REFERENCES github_sync_resources(workspace_id,service_id,connector_id,config_version,resource_key)
);
CREATE INDEX github_observations_cutoff ON github_observation_history
 (workspace_id,service_id,connector_id,config_version,recorded_at DESC);
INSERT INTO github_observation_history(workspace_id,service_id,connector_id,config_version,resource_key,object_type,object_key,observation)
 SELECT workspace_id,service_id,connector_id,config_version,resource_key,'resource',resource_key,to_jsonb(r) FROM github_sync_resources r;
INSERT INTO github_observation_history(workspace_id,service_id,connector_id,config_version,resource_key,object_type,object_key,observation)
 SELECT workspace_id,service_id,connector_id,config_version,resource_key,'change',external_id,to_jsonb(c) FROM github_changes c;
CREATE FUNCTION record_github_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO github_observation_history(workspace_id,service_id,connector_id,config_version,resource_key,object_type,object_key,observation)
 VALUES(NEW.workspace_id,NEW.service_id,NEW.connector_id,NEW.config_version,NEW.resource_key,
  CASE WHEN TG_TABLE_NAME='github_changes' THEN 'change' ELSE 'resource' END,
  CASE WHEN TG_TABLE_NAME='github_changes' THEN to_jsonb(NEW)->>'external_id' ELSE NEW.resource_key END,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER github_resource_observation AFTER INSERT OR UPDATE ON github_sync_resources FOR EACH ROW EXECUTE FUNCTION record_github_observation();
CREATE TRIGGER github_change_observation AFTER INSERT OR UPDATE ON github_changes FOR EACH ROW EXECUTE FUNCTION record_github_observation();
ALTER TABLE github_observation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_observation_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON github_observation_history
 USING(workspace_id::text=current_setting('sentinel.workspace_id',true))
 WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER github_observation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON github_observation_history FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
