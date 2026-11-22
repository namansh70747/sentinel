# Implementation status

## Active integration bundle — 2026-11-22

The current non-AWS implementation ledger and outstanding acceptance gates are
in [NON_AWS_INTEGRATIONS.md](./NON_AWS_INTEGRATIONS.md). Historical entries below
describe earlier checkpoints; they do not certify the current bundle complete.

Checkpoint `422e0a6` adds Docker startup, encrypted workspace connectors, capability
jobs, service mappings and production telemetry migration. The next checkpoint
adds version-frozen refresh runs, immutable evidence, terminal failure handling,
Temporal reconciliation and refresh UI. Actual local Grafana delivery and duplicate
suppression passed; a browser-requested refresh persisted all eight source outcomes.
AWS remains simulated. A subsequent communication checkpoint adds the separate
worker, approved subscription APIs/UI, outgoing ledger and authenticated local
ntfy with confirmed receipt. Full runtime-database suite: 119 passed/12 skipped;
local integration command: 17 passed. GitHub reconciliation/Issues and the
optional infrastructure bundle remain unfinished. Slack is implemented but awaits
an explicitly approved hosted test destination.

## Current execution — 2026-11-16

GitHub `main` is `b61c859`. `npm test` with local Postgres and Temporal passed 93 tests and skipped 3. Typecheck passed. `TEST_LIVE_TELEMETRY=true npx vitest run tests/live/telemetry.live.test.ts` passed: one real `GET /fail` was visible in Prometheus, a Loki line with the same request and trace ids, and a Tempo trace retrieval. Severity is stored only when the matching scrape windows are covered. The rest of the master plan, including a fresh Grafana-evaluated alert in this commit and live AWS, is not finished.

## Earlier same-day execution

## Latest monitoring milestone / usage-window handoff

The repository-managed observability stack is running on its documented local ports. Older manually started monitoring containers were stopped and preserved with their data. The live telemetry test passed: an actual failed HTTP request appeared in Prometheus, a Loki log with matching request/trace IDs, Tempo search and trace retrieval. Actual Grafana evaluation delivered an authenticated webhook, created an incident and Temporal investigation, and persisted eight source outcomes. The live Grafana replay test passed after timestamp canonicalization was fixed; duplicate replay queued zero new incidents. Source health in these investigations includes real Prometheus/Loki/Tempo reads and explicitly simulated AWS observations.

Browser checks passed actual Keycloak login/callback, workspace/service creation, virtual-authenticator passkey enrollment, logout, signed-out API 401 and protected-page redirect. Physical hardware passkeys remain unverified. Default suite: 74 passed / 22 optional tests skipped; focused policy/database suite: 6 passed. Coverage-qualified severity prevents incomplete burn windows from being presented as measured severity. Remaining per-SLI coverage and full master-plan tasks are still open.

Running entry points: connected console `http://localhost:3010/dashboard`; standalone demo `http://localhost:3011`; Grafana `http://localhost:3012`. Active dedicated local Keycloak is on port 18088. Sign in as `operator`; its generated password is in ignored `.local/keycloak/operator-password`. Runtime logs and generated local secrets remain under ignored `.local/`. The read worker was restarted from this primary checkout with simulated AWS mode. GitHub publishing status is determined by the actual current Git SHA; do not assume local follow-up changes are published until pushed.

Frontend direction updated by the user: reuse the localhost:3011 showcase visual system for the real product. Shared showcase tokens/shell styling now drive real console navigation and forms, with dedicated authenticated incidents, services and audit screens. The overview shows actual service count and membership role. Browser verification completed actual Keycloak login/callback and local workspace creation. Desktop and 390px mobile layouts inspected; mobile document width was 390px. Console production build, standalone showcase build, console typecheck and 70 default tests passed (20 integration tests skipped). UI review findings for misleading connected-state copy and narrow link navigation were addressed. Full redesign, charts, connector management and remaining product modules are still pending.

Additional browser acceptance: registered fictional checkout service, declared an investigation, dispatched it through real Temporal and persisted all eight source outcomes in local product Postgres. Incident `9700cfd5-5600-4a7c-b53d-caab3333b54b` escalated correctly: Prometheus SLO mapping not configured, GitHub not configured, Loki/Tempo unavailable, four AWS-related observations explicitly simulated. An obsolete worker from `/tmp/sentinel-zip-publish` was found consuming the shared queue and stopped; current read worker runs from the primary checkout. This proves the missing-data path, not the complete monitored-failure acceptance scenario. Workspace selection now persists between real screens, validated against the user's authorized workspace list.

Follow-up local OIDC slice: 70 default tests passed / 20 skipped; root and console typechecks passed. HTTP is allowed only with an explicit flag and exact loopback issuer. Generated ignored Keycloak realm imported successfully into an isolated Keycloak 26.4.2 instance on port 18088. Actual discovery and `begin()` verified authorization endpoint, S256 PKCE, state and nonce. Browser callback/login/logout/passkeys remain unverified. Shared committed operator/client secrets were removed from the reference realm. Generated secrets are kept under ignored `.local/keycloak/`.

Baseline main is `3ebe3b6`; the following execution changes are local and not yet published.

Latest additional evidence: root suite 69 passed / 20 skipped; root and console TypeScript checks passed; console production build and showcase build passed. The authenticated console HTTP suite passed against local `sentinel_test`, including cross-tenant detail denial and access beyond the list's first 100 incidents. Real failed-request OTLP export to isolated Tempo returned a retrievable trace (HTTP 200, 1921 bytes). Temporary validation container was removed. Source ID: `85e8f82f809998f2d161b5a88bf605b4`.

Workload now uses the OpenTelemetry SDK and exporter. Traffic scenarios and their target restrictions passed six tests. Coverage assessment passed two tests for warm-up, duplicate timestamps, gaps and healthy windows; the worker now records four-window scrape coverage instead of process uptime. Coverage of each actual SLI series and severity qualification remain incomplete. Loki/Tempo configuration validation passed with 24-hour retention and ingestion limits; elapsed-time retention deletion is not yet measured. A bounded readiness entry point was added; full stack readiness remains pending.

| Plan task | Measured status |
| --- | --- |
| M0.1 | Approved plan saved; previous plan archived. Requirements/design documents remain pending. |
| M0.2 | Default suite: 60 passed, 20 skipped. Root typecheck passed. Showcase build added to CI; new CI run pending. |
| M1.1 | Combined local override validates. Added app/provider network wiring, persistent telemetry volumes and intended Loki config mount. Actual combined startup/restart acceptance pending. |
| M1.2 | Typed workload measures counters and latency histogram, excludes readiness/scrapes, emits correlated structured logs and disables fault endpoints outside explicit local mode. Three HTTP tests pass. OTLP export remains pending. |
| M1.4 | Corrected Alloy workload labels and Tempo OTLP receiver bindings. Actual ingestion acceptance pending. |
| M2.4 | Bounded optional collection, exhausted-source persistence, notification failure isolation and Temporal patch branches added. Four Temporal integration tests passed before workload changes. Historical replay fixture and separate communication worker remain pending. |

No complete product milestone is claimed by these checks. AWS remains simulated. No AWS credentials were used. Skipped default integration suites require explicit local database/Temporal/console configuration.

## Historical read-evidence verification

Date: 2026-11-16. Branch `sentinel/read-evidence`.

`npm run typecheck` passed. `npm test` with `TEST_DATABASE_URL` on local Postgres `sentinel_test` and `TEST_TEMPORAL=true` passed 73 tests. One suite stayed skipped because `TEST_CONSOLE_URL` was unset.

A live proof against Prometheus on `127.0.0.1:9090` stored an incident whose state was `advised`, severity `sev1`, Prometheus `window_covered` false, and ECS provenance `simulated`. The hypothesis status was `unknown`. Loki and Tempo were `unavailable` when queried and `not-configured` when their URLs were unset.

`SENTINEL_ECS_MODE=live` was not run. No AWS credentials were used. The console HTTP suite and a browser pass of the incident page were not run in this session. Grafana 13 was up, but this proof called the worker directly rather than a new webhook delivery.
