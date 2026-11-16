-- This ledger reserves a proof once. It does not authorize or execute an action.
CREATE TABLE proof_reservations (
 workspace_id uuid NOT NULL,
 id uuid NOT NULL,
 proof_id uuid NOT NULL,
 plan_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,proof_id),
 FOREIGN KEY(workspace_id,proof_id) REFERENCES approval_proofs(workspace_id,id),
 FOREIGN KEY(workspace_id,plan_hash) REFERENCES execution_plans(workspace_id,plan_hash)
);
ALTER TABLE proof_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY reservation_workspace ON proof_reservations USING(workspace_id::text=current_setting('sentinel.workspace_id',true)) WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
CREATE TRIGGER reservations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON proof_reservations FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
