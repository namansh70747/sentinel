ALTER TABLE incident_evidence DROP CONSTRAINT incident_evidence_outcome_check;
ALTER TABLE incident_evidence ADD CONSTRAINT incident_evidence_outcome_check
 CHECK(outcome IN ('ok','unavailable','stale','not-configured','uncovered','empty','denied'));
