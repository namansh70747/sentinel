# Implementation status

## Current execution — 2026-11-16

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
