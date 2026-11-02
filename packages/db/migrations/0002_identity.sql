CREATE TABLE identities (
 id uuid PRIMARY KEY,
 issuer text NOT NULL,
 subject text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(issuer,subject)
);
CREATE TABLE workspace_memberships (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 identity_id uuid NOT NULL REFERENCES identities(id),
 role text NOT NULL CHECK(role IN ('viewer','responder','admin')),
 PRIMARY KEY(workspace_id,identity_id)
);
CREATE TABLE login_transactions (
 token_hash text PRIMARY KEY,
 verifier text NOT NULL,
 nonce text NOT NULL,
 state text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY,
 identity_id uuid NOT NULL REFERENCES identities(id),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
