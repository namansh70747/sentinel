# Implementation status

Date: 2026-11-16. Branch `sentinel/read-evidence`.

`npm run typecheck` passed. `npm test` with `TEST_DATABASE_URL` on local Postgres `sentinel_test` and `TEST_TEMPORAL=true` passed 73 tests. One suite stayed skipped because `TEST_CONSOLE_URL` was unset.

A live proof against Prometheus on `127.0.0.1:9090` stored an incident whose state was `advised`, severity `sev1`, Prometheus `window_covered` false, and ECS provenance `simulated`. The hypothesis status was `unknown`. Loki and Tempo were `unavailable` when queried and `not-configured` when their URLs were unset.

`SENTINEL_ECS_MODE=live` was not run. No AWS credentials were used. The console HTTP suite and a browser pass of the incident page were not run in this session. Grafana 13 was up, but this proof called the worker directly rather than a new webhook delivery.
