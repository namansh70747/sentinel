CREATE INDEX connector_global_pending ON connector_tests(status) WHERE status IN ('queued','running');
-- The runtime role cannot inspect another tenant's queue. This narrowly scoped
-- definer function reveals only admission availability, never rows or counts.
-- Its transaction lock is held through enqueue, preventing admission races.
CREATE FUNCTION connector_test_admission() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(75489324);
 RETURN (SELECT count(*) < 1000 FROM public.connector_tests WHERE status IN ('queued','running'));
END $$;
REVOKE ALL ON FUNCTION connector_test_admission() FROM PUBLIC;
