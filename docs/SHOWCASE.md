# Sentinel: today's credential-free demo

## Start in two commands

Requires Node 22+ and npm. From the repository root:

```sh
npm ci
npm run demo:showcase
```

Open http://localhost:3011. No `.env`, AWS credentials, database, Docker,
Temporal, monitoring stack, or identity provider is required.

Alternatively, build once with `npm run build:showcase`, then open
`apps/showcase/dist/index.html` in a browser. That file contains all JavaScript
and CSS; it needs no CDN. Browser storage can be restricted for `file://` URLs;
use the local server for reliable history persistence. The UI remains usable
without storage and report export still works.

The same component is available inside the original console:
`npm run dev:console`, then http://localhost:3010/demo/showcase.
The original `/demo` and real workspace flows remain available.

## Three-minute presentation

1. Start at Overview. Explain the persistent DEMO MODE banner.
2. Select Deployment degradation and Run investigation. The five browser-local
   stages demonstrate alert intake, incident creation, metrics, ECS read, and
   evidence recording. Availability falls to 97.82%; 1 of 3 tasks is running.
3. Show the investigation brief, source-labelled evidence, and Timeline.
   Deployment 42 is only a possible lead, never a proven root cause.
4. Select AWS read failure and run again. ECS evidence is unavailable; the
   investigation is partial and `ecs.read_failed` appears in the audit record.
5. Select Stale observations. Data is 25 minutes old and exceeds the
   five-minute freshness limit. Current health is explicitly unknown.
6. Show Healthy service, the connectors page, and Demo readiness.
7. Export the Markdown report or JSON evidence. Reset demo before a fresh demo.

## Implemented in this change

- Credential-free `MockEcsReadClient`, with the same observation shape as the
  live reader plus explicit `source: mock` and `simulated: true` provenance.
- A fictional account (`000000000000`), cluster, service, and task definition.
  The mock reader rejects all other service identifiers.
- Four deterministic scenarios: healthy, deployment degradation, ECS read
  failure, and stale observations. Timestamps are generated for each run.
- Browser-local scenario orchestration, investigation history, incident search,
  service and SLO defaults, connector states, audit events, and report exports.
- Bounded history of 12 runs in this browser's local storage, validated on load.
- Responsive layout, keyboard controls, modal focus containment, reduced motion.
- A standalone build and the `/demo/showcase` console route.

## What is simulated / still pending

This prototype does NOT call AWS, Prometheus, or Grafana. It does NOT run the
Temporal worker, persist to PostgreSQL, authenticate the displayed operator,
verify workspace isolation, enroll passkeys, invoke an AI model, or execute
remediation. Charts are scenario illustrations, not queried monitoring data.
The brief is deterministic and rule-based. The Grafana-format alert is a demo
concept initiated by the button, not a received HTTP webhook.

The production ECS reader was not changed. There is no automatic live-to-mock
fallback, no fake access key, and no company credential use. The mock adapter
is deliberately reached only from the showcase model, not the live worker.

Live end-to-end verification requires an authorized dedicated AWS sandbox,
read-only role, Prometheus/Grafana setup, running Temporal/database services,
and a test identity provider. Harshit's previously reported live read remains
separate from these mock tests; it was not independently repeated here.

Naman's uncommitted laptop changes were not present in the cloned GitHub main.
They were not modified or integrated. Review and merge them separately before
changing the actual worker or investigation persistence pipeline.

## Verification

See `docs/SHOWCASE-VALIDATION.md` for measured commands and limitations.

## Architecture

```text
Scenario selector
       |
Browser-local investigation runner
       |                      |
Synthetic metric fixtures    MockEcsReadClient (no SDK/network)
       |                      |
       +--- source-labelled evidence ---+
                                        |
                         Browser state + localStorage (12 runs)
                                        |
                     Overview / evidence / timeline / audit
                                        |
                              Markdown + JSON export
```

## Handoff / proposed PR

Branch: `demo/credential-free-showcase`.

Suggested title: `Add credential-free Sentinel investigation showcase`.

Describe this as a prototype, not completion of the broader development
backlog. The read-only live MVP, authentication verification, deployment
packaging, safe remediation, and remaining connectors are separate work.
