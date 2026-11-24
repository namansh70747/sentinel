ALTER TABLE incidents ADD COLUMN state_version bigint NOT NULL DEFAULT 1;
CREATE TABLE incident_notes (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 incident_id uuid NOT NULL,
 author_identity_id uuid NOT NULL REFERENCES identities(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id)
);
CREATE TABLE incident_assignments (
 workspace_id uuid NOT NULL,
 incident_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('commander','responder','comms','scribe')),
 identity_id uuid NOT NULL REFERENCES identities(id),
 PRIMARY KEY(workspace_id,incident_id,role),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id)
);
CREATE TABLE incident_transitions (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 incident_id uuid NOT NULL,
 from_state text NOT NULL,
 to_state text NOT NULL,
 actor text NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id)
);
CREATE TABLE incident_signals (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 service_id uuid NOT NULL,
 incident_id uuid,
 fingerprint text NOT NULL CHECK(length(fingerprint) BETWEEN 1 AND 512),
 status text NOT NULL CHECK(status IN ('firing','resolved')),
 dedupe_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id)
);
CREATE INDEX incident_signals_open ON incident_signals(workspace_id,service_id,fingerprint,created_at DESC);
CREATE TRIGGER incident_notes_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON incident_notes FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER incident_transitions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON incident_transitions FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER incident_signals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON incident_signals FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['incident_notes','incident_assignments','incident_transitions','incident_signals'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_scope ON %I USING(workspace_id::text=current_setting(''sentinel.workspace_id'',true)) WITH CHECK(workspace_id::text=current_setting(''sentinel.workspace_id'',true))',tab);
 END LOOP;
END $$;
