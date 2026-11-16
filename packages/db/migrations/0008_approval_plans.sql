CREATE TABLE execution_plans (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 incident_id uuid NOT NULL,
 service_id uuid NOT NULL,
 plan_hash text NOT NULL CHECK(length(plan_hash)=64),
 plan jsonb NOT NULL,
 signed_playbook jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,plan_hash),
 FOREIGN KEY(workspace_id,incident_id) REFERENCES incidents(workspace_id,id),
 FOREIGN KEY(workspace_id,service_id) REFERENCES services(workspace_id,id)
);
CREATE TABLE approval_proofs (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 plan_hash text NOT NULL,
 identity_id uuid NOT NULL REFERENCES identities(id),
 credential_id text NOT NULL REFERENCES passkeys(id),
 session_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,plan_hash) REFERENCES execution_plans(workspace_id,plan_hash)
);
ALTER TABLE passkey_challenges ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE execution_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_workspace ON execution_plans USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
ALTER TABLE approval_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_proofs FORCE ROW LEVEL SECURITY;
CREATE POLICY proof_workspace ON approval_proofs USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER plans_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON execution_plans FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER proofs_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON approval_proofs FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
