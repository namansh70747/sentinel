-- Admission intentionally counts all tenants. A restricted migration owner
-- must fail closed instead of silently counting only its visible RLS rows.
CREATE OR REPLACE FUNCTION connector_test_admission() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Connector admission owner requires explicitly audited BYPASSRLS authority';
 END IF;
 PERFORM pg_advisory_xact_lock(75489324);
 RETURN (SELECT count(*) < 1000 FROM public.connector_tests WHERE status IN ('queued','running'));
END $$;
REVOKE ALL ON FUNCTION connector_test_admission() FROM PUBLIC;
