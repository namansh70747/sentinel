ALTER TABLE audit_events ADD COLUMN hash_version smallint NOT NULL DEFAULT 1 CHECK(hash_version IN (1,2));
