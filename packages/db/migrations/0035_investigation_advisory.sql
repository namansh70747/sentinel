ALTER TABLE investigation_runs ADD COLUMN advisory jsonb
 CHECK (advisory IS NULL OR jsonb_typeof(advisory) = 'object');

ALTER TABLE investigation_runs ADD COLUMN advisory_model_result jsonb
 CHECK (advisory_model_result IS NULL OR jsonb_typeof(advisory_model_result) = 'object');

CREATE INDEX investigation_advisory_model_pending ON investigation_runs(workspace_id, finished_at)
 WHERE advisory IS NOT NULL AND advisory_model_result IS NULL;
