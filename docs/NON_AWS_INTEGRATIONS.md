# Non-AWS integration bundle

This is the execution ledger for the approved Docker integration bundle. A
capability is complete only after its real operation passes. Historical test
reports in other documents are not evidence of the current stack's readiness.

## Operator commands

```sh
npm run dev:prepare
npm run dev:doctor
npm run dev:up
npm run dev:import-local
npm run dev:status
npm run dev:stop
npm run test:integrations
npm run test:ntfy
```

The combined entry point uses `compose.durable.yml`, `compose.observe.yml`, then
`compose.local.yml`, always with project name `sentinel`. Stop preserves volumes.
The doctor refuses occupied ports outside this Compose project. No command
removes unrelated projects or volumes. Core needs at least 6 GiB Docker memory;
optional infrastructure profiles are not yet delivered or included in that budget.

Product: http://localhost:3010; showcase: http://localhost:3011 (separate existing
showcase command); Grafana: http://localhost:3012; identity: http://localhost:8088.

`dev:prepare` generates private files under ignored `.local/`. Owner login is
`namsh70747@gmail.com`; password is `.local/keycloak/owner-password`. The previous
operator account is preserved. `bootstrap-owner.ts` preserves existing users,
workspaces and membership roles. Keycloak realm import initializes new realms;
it does not reconcile an already imported realm. Do not delete Keycloak data to
add an account to an existing realm: use its admin interface instead.

## Secret recovery

Back up `.local/connector-key` together with a PostgreSQL backup using an encrypted
backup location. Connector credentials use AES-256-GCM, authenticated with both
workspace and connector identity. Losing the key makes those credentials
unrecoverable. Preparation refuses an invalid existing key rather than replacing
it. Restore database and its matching key together, retain mode 0600, then test
connections again. Backup/restore acceptance is still outstanding.

The key is a Docker secret, excluded from the image build context. APIs return
credential-presence metadata only. Do not copy `.local/`, provider tokens, Slack
webhooks or Compose secrets into Git, browser configuration or reports.

## Current implementation and verified boundaries

Implemented foundation:

- Forward migrations 0015–0018: workspace connector instances, immutable configuration
  snapshots, service/provider bindings and durable connection test jobs; tenant
  RLS and composite relationships; least-privilege runtime grants.
- Queue admission caps: 100 connections and 20 pending tests per workspace,
  1,000 pending tests globally. Global admission has a fixed-schema definer
  function whose owner must explicitly have BYPASSRLS or superuser authority;
  it fails closed otherwise. Runtime credentials never receive that authority.
- Encrypted credential repository, optimistic configuration versions, bounded
  test attempts, audit records, disabled connector handling.
- Shared bounded HTTP transport: pinned DNS resolution, exact private-origin
  approval, redirect rejection, deadlines, 2 MiB default response bound, at most
  three transient read attempts, no automatic write retry.
- Authenticated list/create/edit/test and service binding APIs; admin mutation
  permissions, tenant membership checks and origin validation.
- Connectors UI with configured/available/planned sections. Reachability, empty
  reads and verified reads have distinct outcomes. No Slack messages are sent
  by its capability test; ntfy health does not certify receipt.
- Local OIDC transport rewrite only from the dedicated public Sentinel realm
  to `http://keycloak:8080`. Token issuer validation and public metadata remain
  unchanged. Persistent Keycloak data volume added.

Fresh verification during implementation:

- Real local integration command: 9 passed across four suites, including tenant
  boundaries, concurrent queue limits, service-specific log collection and
  provider-response credential redaction.
- Full suite with the least-privilege local test database: 109 passed, 9 skipped.
  Skips are not acceptance. Root and console TypeScript checks passed.
- Actual failing-request ingestion test passed through metrics, logs, trace
  search and trace-detail retrieval.
- Docker core pulled, built, started and passed all nine readiness endpoints;
  worker reports RUNNING. Docker allocation is 7.7 GiB. An idle snapshot measured
  approximately 1.8 GiB total container memory; this is not a peak-load budget.
- Browser Keycloak login reached the dashboard, configured connections loaded,
  and a fixture connection was created, edited and tested through the UI. Its
  queued real Loki capability returned verified-read; it was disabled afterward.
- Real queued provider tests: Prometheus metrics.query returned 2 records,
  Loki logs.labels returned 3, Tempo traces.search returned 5. Grafana health was
  reachable only, not a verified alert delivery capability test.
- The provisioned Grafana evaluator subsequently delivered a real failure alert,
  creating a persisted investigation with live Prometheus/Loki/Tempo evidence.
  Prometheus correctly remained uncovered during warm-up. Replaying that same
  firing signal returned 202 with zero new jobs and unchanged incident count.
- Next.js updated to patched 16.4.5 after a real advisory interrupted the test
  server; install audit reported zero vulnerabilities.
- Connector checkpoint peer review reported no remaining Critical/Important
  defects in this scope. Admission-owner guard and endpoint-change credential
  clearing were fixed during review. Repository scan found no generated private
  credentials in tracked or pending source files.

## Remaining delivery gates, in dependency order

1. Complete fresh/restart Docker acceptance, local login/logout, worker readiness,
   credential consistency checks, profile memory measurements and reproducible
   integration-test command. Both read and communication workers now run in Docker;
   actual read and send operations have passed, beyond container state checks.
2. Production worker now uses repository-backed service bindings and no global
   fallback; legacy activity construction remains only for existing compatibility
   tests. Explicit `dev:import-local` imports the local workload mappings and
   registered Grafana intake without overwriting existing connector bindings.
3. Raw per-SLI coverage, bounded logs, trace details and extracted log trace IDs
   are implemented. Two-service log isolation passed using an HTTP fixture;
   two independently instrumented real Docker workloads are still outstanding.
4. Investigation runs, frozen configuration/mapping snapshots, persisted retry
   attempts and immutable evidence envelopes are implemented in migration 0019.
   Refresh/list/detail APIs and incident refresh UI are implemented. Retries reuse
   persisted observations; terminalization fills missing attempts with explicit
   failure envelopes and blocks late changes. Failed Temporal executions are
   reconciled; new runs have a ten-minute execution timeout. Database/HTTP tests,
   completed-history replay and a real browser refresh passed. Legacy rows remain
   separately labelled. Cross-release archived-history fixtures remain to add.
5. GitHub commits, deployments/statuses, Actions and checks now have durable
   service/repository reconciliation, conditional requests, five-minute polling
   and authorized manual sync. Connection-wide rate backoff survives manual sync
   and restart. Immutable observation history fences evidence to each frozen run
   cutoff; bounded results explicitly report truncation. Real HTTP fixture tests
   cover pagination, restart, separate repositories and CI status transitions.
   A hosted read token has not been supplied; live GitHub acceptance remains pending.
6. Approved version-bound subscriptions, outgoing deliveries/attempts ledger,
   separate communication worker, notification APIs/UI, ntfy ACL/token and actual
   receipt confirmation are implemented in migration 0020 and related modules.
   Anonymous ntfy publish/subscribe are denied. Product browser test approved only
   the dedicated local topic, queued a message and observed `confirmed` history.
   A canonical-origin allowlist defect was found by that real operation, fixed
   with a regression test, and the failed attempt was preserved. Slack adapter is
   implemented, but no hosted destination was provided or tested. Separate GitHub
   Issues credentials/workflow remain unfinished. Unknown sends never retry.
7. Optional k3d, namespace-scoped Kubernetes reads, read-only Argo/Gitea fixtures,
   isolated OpenTofu plan imports, Backstage, estimated OpenCost, Trivy, versioned
   runbooks/FTS and authenticated workspace-scoped STDIO MCP.
8. Browser acceptance, hostile provider tests, restart persistence, memory
   measurements, key/database recovery and final provider-version report.

AWS remains simulated. Teams, Jira, Linear, PagerDuty and other commercial catalog
items remain planned. Missing hosted credentials never count as successful
integration and do not block testing local providers.

## Runbooks implementation slice

Approved scope: import local Markdown as data, preserve versions, link services
and search current versions using PostgreSQL full-text search. No file supplied
by a browser is opened on the server filesystem and no runbook commands execute.

- [x] `0025_runbooks.sql`: workspace-owned documents, immutable versions, composite
  service links, generated search vectors, GIN index and tenant RLS.
- [x] `repositories/runbooks.ts`: bounded validation, optimistic/idempotent imports,
  service isolation, search with explicit result truncation and historical reads.
- [x] Workspace runbook APIs: membership reads, admin-only imports, origin/size checks.
- [x] Authenticated runbooks page: local Markdown upload, service selection, search,
  version browsing, escaped content, loading/empty/error/mobile states.
- [x] Database/HTTP/browser acceptance and operator documentation for this slice.

## Communication checkpoint verification

- Full suite with local least-privilege database: 119 passed, 12 skipped.
- `test:integrations`: 17 passed across eight suites, including explicit approval,
  role/tenant boundaries, intent-before-send and unknown-response duplicate safety.
- `test:ntfy`: real authenticated publishing and exact subscription receipt passed.
- Root and console TypeScript checks passed; peer review found no remaining
  Critical/Important defects in the communication scope before final live testing.
- Private ntfy password/token locations: `.local/ntfy/password`, `.local/ntfy/token`.
  Re-running `dev:prepare-ntfy` preserves the generated credentials.
- No Slack, GitHub Issues, AWS or company-account writes were performed.

## GitHub synchronization checkpoint

- Forward migrations 0021–0024 persist resource cursors, stable repository-prefixed
  changes, manual requests, terminal child states and immutable observation history.
- Least-privilege database full suite: 126 passed, 13 skipped. Integration command:
  22 passed across ten suites. Skipped tests are not acceptance.
- Root and console TypeScript checks passed. Updated Docker services built and started.
- GitHub API version: `2026-03-10`. Read credentials are separate from future issue
  publishing credentials. Missing tokens report not configured; no mock success.
- Historical evidence uses observations recorded before the run cutoff. Earlier
  rows begin history at migration time and are not backdated as verified data.
- Remaining hosted gate: configure a read-only token in the workspace connection UI,
  bind an approved repository and verify all required capabilities against GitHub.
- Earlier peer reviews identified defects fixed with regression coverage. The final
  follow-up reviewer was unavailable due to its usage limit; the latest history and
  connection-backoff changes have automated verification, not a completed final peer review.

## Runbooks checkpoint verification

- PostgreSQL current-version search follows the [official stored-vector/GIN
  guidance](https://www.postgresql.org/docs/18/textsearch-tables.html), with an explicit
  `simple` configuration so search is independent of connection defaults.
- Database suite with runtime credentials: 127 passed, 14 skipped. Integration
  command: 24 passed, eleven suites. Root and console TypeScript checks passed.
- Actual browser import of `docs/runbooks/local-telemetry.md` created version 1
  linked to checkout. The authenticated content view showed source, hash and links.
- Peer review found an identical-request retry conflict; fixed and tested using
  the original expected version. Different stale content still conflicts.
- Forward migration 0026 adds the ordered historical GitHub lookup index. EXPLAIN
  confirms an ordered index path without a Sort under explicit index preferences;
  the tiny fixture's default planner prefers a smaller selective scan and sort.
  This is not a long-history load benchmark; that scale gate remains outstanding.

Runbook import: open `/runbooks`, select a workspace, choose Import Markdown and
link the appropriate services. Open an existing document before importing a new
version. Identical content, title, source path and links reuse the current version.
Historical service links are preserved with their version. Search returns current
versions only; more than 50 results is explicitly marked truncated. Raw Markdown
is escaped as text and is never executed or interpreted as trusted agent instructions.

Mobile browser acceptance at 390 px passed without page overflow. A browser-discovered HTML pattern incompatibility was fixed before the checkpoint. Long-history scale acceptance and broader platform restart/recovery gates remain separate.

## MCP implementation slice

- [x] Forward migration and token repository: hashed, expiring local credentials
  bound to an existing identity and workspace; recheck membership/revocation per call.
- [x] Official SDK STDIO server: bounded incident/evidence/audit/runbook reads,
  strict tool inputs, no write tools and no arbitrary workspace selection.
- [x] Private local prepare/start commands; preserve valid existing credentials,
  never emit tokens on stdout (reserved for protocol messages).
- [x] Real SDK subprocess client verifies initialization, discovery, permitted reads,
  foreign-workspace denial and denial after token revocation.

## MCP operator handoff

```sh
npm run dev:prepare-mcp
# Run the protocol server directly; stdout must contain JSON-RPC only:
node scripts/dev/mcp.mjs
# Explicitly revoke/replace a credential after expiry or a partial-file recovery:
npm run dev:prepare-mcp -- --rotate
```

For an MCP desktop client use command `node`, args `["scripts/dev/mcp.mjs"]` and
working directory equal to the Sentinel repository. Use `npm run --silent dev:mcp`
if the client requires npm. Normal npm banners must not enter the protocol stream.
No HTTP endpoint or automatic public tunnel is enabled.

The token lives in `.local/mcp/token` (0600); metadata lives in
`.local/mcp/config.json`. Tokens last seven days and are stored only as SHA-256
hashes in PostgreSQL. Every call rechecks workspace binding, current membership,
expiry and revocation. Missing-token/config recovery fails closed unless explicit
rotation revokes prior credentials. Preparation preserves existing valid pairs.
Do not commit, paste or share the token or local database credentials.

Tools: `list_incidents`, `get_incident`, `read_audit`, `search_runbooks`,
`get_runbook`. Writes/approvals are absent. Reads are bounded and paginate incident
and audit lists. Oversized source detail is explicitly omitted, rather than silently
truncated. Runbook content remains untrusted reference data.

Implementation uses the [official TypeScript SDK STDIO transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.32.2/docs/server.md).
SDK version 1.32.2 and patched Zod 4.6.7 passed npm audit with zero vulnerabilities.
Actual SDK subprocess acceptance passed authorization, all five read tools, audit
pagination, unknown-write/oversized-limit rejection, membership removal, expiry,
revocation and missing-file rotation. Local product acceptance returned five real
incidents and the imported runbook. Peer review has no remaining Critical/Important
findings in this slice.

MCP checkpoint validation: full least-privilege database suite 127 passed / 14
skipped; integration suite 25 passed across twelve suites. Skips are not acceptance.
Root/console TypeScript and dependency audit passed. Local doctor verified Docker,
private files, memory allocation and both saved database credentials.
