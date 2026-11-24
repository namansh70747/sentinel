CREATE TABLE postmortems (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,incident_id,version),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id)
);
CREATE TABLE postmortem_sections (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 version integer NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 kind text NOT NULL CHECK(kind IN ('fact','gap','hypothesis','action')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 evidence_id uuid,
 PRIMARY KEY(workspace_id,incident_id,version,position),
 FOREIGN KEY(workspace_id,incident_id,version) REFERENCES postmortems(workspace_id,incident_id,version)
);
CREATE TRIGGER postmortem_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON postmortems FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER postmortem_section_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON postmortem_sections FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['postmortems','postmortem_sections'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text=current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text=current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
