-- A provider object may be read through both a list and its tracked detail
-- resource. Its identity belongs to the repository, not the pagination path.
UPDATE github_changes c SET external_id=lower(r.spec->>'owner')||'/'||lower(r.spec->>'repo')||':'||c.external_id
 FROM github_sync_resources r WHERE r.workspace_id=c.workspace_id AND r.service_id=c.service_id AND r.connector_id=c.connector_id AND r.config_version=c.config_version AND r.resource_key=c.resource_key
 AND c.external_id NOT LIKE lower(r.spec->>'owner')||'/'||lower(r.spec->>'repo')||':%';
DELETE FROM github_changes a USING github_changes b WHERE a.workspace_id=b.workspace_id AND a.service_id=b.service_id AND a.connector_id=b.connector_id AND a.external_id=b.external_id
 AND (a.collected_at,a.config_version,a.resource_key)<(b.collected_at,b.config_version,b.resource_key);
ALTER TABLE github_changes DROP CONSTRAINT github_changes_pkey;
ALTER TABLE github_changes ADD PRIMARY KEY(workspace_id,service_id,connector_id,external_id);
