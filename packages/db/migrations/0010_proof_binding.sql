ALTER TABLE approval_proofs ADD CONSTRAINT proof_exact_plan_unique UNIQUE(workspace_id,id,plan_hash);
ALTER TABLE proof_reservations DROP CONSTRAINT proof_reservations_workspace_id_proof_id_fkey;
ALTER TABLE proof_reservations ADD CONSTRAINT reservation_exact_proof_plan FOREIGN KEY(workspace_id,proof_id,plan_hash) REFERENCES approval_proofs(workspace_id,id,plan_hash);
