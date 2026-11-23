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
