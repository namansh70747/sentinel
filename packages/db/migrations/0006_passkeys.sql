CREATE TABLE passkeys (
 id text PRIMARY KEY,
 identity_id uuid NOT NULL REFERENCES identities(id),
 public_key bytea NOT NULL,
 counter bigint NOT NULL CHECK(counter>=0),
 transports jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE passkey_challenges (
 id uuid PRIMARY KEY,
 identity_id uuid NOT NULL REFERENCES identities(id),
 session_hash text NOT NULL,
 challenge text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('registration','approval')),
 plan_hash text,
 expires_at timestamptz NOT NULL
);
CREATE INDEX passkey_identity ON passkeys(identity_id);
