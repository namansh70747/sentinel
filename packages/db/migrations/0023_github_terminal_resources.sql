ALTER TABLE github_sync_resources DROP CONSTRAINT github_sync_resources_status_check;
ALTER TABLE github_sync_resources ADD CONSTRAINT github_sync_resources_status_check CHECK(status IN ('pending','running','ok','partial','complete','failed','disabled'));
