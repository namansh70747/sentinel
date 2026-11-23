CREATE TABLE runbooks (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 id uuid NOT NULL,
 slug text NOT NULL CHECK(slug ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
 current_version integer NOT NULL CHECK(current_version>0),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,slug)
);
CREATE TABLE runbook_versions (
 workspace_id uuid NOT NULL,
 runbook_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 markdown text NOT NULL CHECK(octet_length(markdown) BETWEEN 1 AND 262144),
 source_path text NOT NULL,
 content_hash text NOT NULL CHECK(length(content_hash)=64),
 imported_by text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 search_vector tsvector GENERATED ALWAYS AS
  (to_tsvector('simple',title||' '||markdown)) STORED,
 PRIMARY KEY(workspace_id,runbook_id,version),
 FOREIGN KEY(workspace_id,runbook_id) REFERENCES runbooks(workspace_id,id)
);
ALTER TABLE runbooks ADD CONSTRAINT current_runbook_version
 FOREIGN KEY(workspace_id,id,current_version) REFERENCES runbook_versions(workspace_id,runbook_id,version)
 DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX runbook_text_search ON runbook_versions USING gin(search_vector);
CREATE TABLE runbook_service_links (
 workspace_id uuid NOT NULL,
 runbook_id uuid NOT NULL,
 version integer NOT NULL,
 service_id uuid NOT NULL,
 PRIMARY KEY(workspace_id,runbook_id,version,service_id),
 FOREIGN KEY(workspace_id,runbook_id,version) REFERENCES runbook_versions(workspace_id,runbook_id,version),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
CREATE TRIGGER runbook_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runbook_versions FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER runbook_links_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON runbook_service_links FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['runbooks','runbook_versions','runbook_service_links'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text=current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text=current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
