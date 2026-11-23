-- Match the latest-per-object frozen-cutoff access path without sorting history.
CREATE INDEX github_observations_latest ON github_observation_history
 (workspace_id,service_id,connector_id,config_version,object_type,object_key,recorded_at DESC,sequence DESC);
