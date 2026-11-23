CREATE TABLE mcp_access_tokens (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 id uuid NOT NULL,
 identity_id uuid NOT NULL REFERENCES identities(id),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
 token_hash text NOT NULL CHECK(length(token_hash)=64),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,token_hash),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days')
);
ALTER TABLE mcp_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_access_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON mcp_access_tokens
 USING(workspace_id::text=current_setting('sentinel.workspace_id',true))
 WITH CHECK(workspace_id::text=current_setting('sentinel.workspace_id',true));
