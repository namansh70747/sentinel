ALTER TABLE incidents ADD CONSTRAINT incidents_exact_service UNIQUE(workspace_id,id,service_id);
ALTER TABLE incident_evidence ADD CONSTRAINT sli_exact_incident_service FOREIGN KEY(workspace_id,incident_id,service_id) REFERENCES incidents(workspace_id,id,service_id);
ALTER TABLE ecs_evidence ADD CONSTRAINT ecs_exact_incident_service FOREIGN KEY(workspace_id,incident_id,service_id) REFERENCES incidents(workspace_id,id,service_id);
ALTER TABLE execution_plans ADD CONSTRAINT plan_exact_incident_service FOREIGN KEY(workspace_id,incident_id,service_id) REFERENCES incidents(workspace_id,id,service_id);
ALTER TABLE investigation_jobs ADD CONSTRAINT job_exact_incident_service FOREIGN KEY(workspace_id,incident_id,service_id) REFERENCES incidents(workspace_id,id,service_id);
