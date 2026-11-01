# Sentinel

Agentic SRE control plane. It watches a service's user-facing SLO, ranks what broke, and will only roll back a deploy it observed itself. Everything else is advice. Alarm titles are stored and never used as severity.

The loop runs with no cloud account. Fixtures are the evidence. Live Grafana, AWS, Slack, and Bedrock attach later through env vars, and they do not change the decision rules.

## Run it

With Docker, one command:

```bash
cd ~/Projects/sentinel
docker compose up --build
```

Postgres 17 and the Temporal dev server are behind a profile, for when the durable worker lands:

```bash
docker compose --profile durable up --build
```

Without Docker:

```bash
npm install
npm test
npm run demo
SENTINEL_WEBHOOK_SECRET=local-dev npm run dev:api
npm run dev:console
```

- Tests and `npm run demo` need nothing else.
- API: http://localhost:8787 (`/v1/stream` is the live SSE feed)
- Console: http://localhost:3010

## The console

- **Fleet** streams the SLI every second from the API. Press **Fire bad deploy** and the availability drops, the agent trace streams triage, rank, and decide, and a toast lands with the policy result.
- **War room** replays an incident step by step. Scrub the timeline, watch hypotheses get kept or killed, and see the rollback dry-run diff appear only once policy decides.
- **Policy lab** runs the same `decide()` the API runs, in the browser. Flip mode, strikes, verbs, signatures, and evidence and watch the decision change. A never-list verb never turns into allow.
- **Topology** is a draggable dependency graph with the burning node and the throttled edge.
- **⌘K** opens a command palette to jump anywhere or fire any replay scenario.

The background is a WebGL mesh gradient from Paper Shaders, plus drifting aurora blobs. It shifts from amber to red when availability burns, and it goes still if the OS asks for reduced motion. Panels are glass, so the shader shows through the chart.

The webhook at `/v1/signals/grafana` refuses everything until `SENTINEL_WEBHOOK_SECRET` is set. The console's fire buttons use `/v1/replay`, which only replays fixtures in the repo.

`npm run validate` lists every connector and the env vars it would need.

## What you do by hand

Copy the template and fill only the block you are ready to use.

```bash
cp .env.example .env
```

Leave `SENTINEL_MODE=advise`. Do not set it to `act` until a rollback has looked right in the lab for a week.

| You want | Where it comes from | Vars |
| --- | --- | --- |
| Nothing. Replay only. | Already in the repo. | none |
| Grafana alerts and SLIs | Grafana → Service accounts → token with read access to Prometheus, Loki, Tempo. Alert contact point POSTs to `http://<host>:8787/v1/signals/grafana` with header `x-sentinel-secret`. | `GRAFANA_URL`, `GRAFANA_TOKEN`, `SENTINEL_WEBHOOK_SECRET` |
| AWS reads (deploys, health, quotas) | IAM role from `deploy/iam/read.json`, trusted by the host that runs the API. | `AWS_REGION`, `AWS_PROFILE` or `SENTINEL_READ_ROLE_ARN` |
| A real rollback | Separate role from `deploy/iam/act.json`, scoped to one service. Then set the mode. The code path that calls `UpdateService` is not turned on in this build. | `SENTINEL_ACT_ROLE_ARN`, `SENTINEL_MODE=act` |
| A model ranking on top of the rules | Amazon Bedrock, Claude with structured output. The deterministic ranker stays the floor. | `BEDROCK_REGION`, `BEDROCK_RANK_MODEL_ID` |
| Durable workflows | `docker compose up` starts Postgres 17 and Temporal dev. The in-process machine is what tests run. | `DATABASE_URL`, `TEMPORAL_ADDRESS` |
| Slack or PagerDuty | Bot token and a signing secret. Chat can post a ledger. It cannot approve a write. | `SLACK_BOT_TOKEN`, `PAGERDUTY_API_TOKEN` |

Never put a write token in a connector that the catalog marks read-only. The never-list (IAM, security groups, data deletes, quota increases, spend) is refused even if a token could do it.

## Layout

- `packages/policy` — burn-rate severity and `decide()`. This is the authority.
- `packages/engine` — signal, triage, rank, decide, verify, two strikes.
- `packages/fixtures` — the replay set, including a healthy service with an alarm titled CRITICAL.
- `packages/connectors` — the tool catalog and the env each tool needs.
- `apps/api` — incidents, connectors, Grafana webhook.
- `apps/cli` — `replay` and `catalog`.
- `apps/console` — Next.js 16, React 19.2, Tailwind v4, Motion, cmdk, Sonner, React Flow. Fleet, war room, topology, catalog, changes, connectors, policy lab, audit.
- `deploy/iam` — read role and act role to create in AWS when you are ready.

## Rules that are already enforced

- Severity is the multi-window burn on the availability SLI, or a latency breach when availability is fine.
- A plan's revision comes from the evidence packet. The model is not in that path.
- Advise mode never records an execute step.
- Two missed verifies escalate and a third execute does not happen.
- `iam:AttachRolePolicy` and the rest of the never-list return refuse.
- Scale and other unsigned playbooks return refuse.

## Not in this tree yet

Live clients for every connector, the Bedrock call, the Temporal worker, passkey approval, and the ECS `UpdateService` call. Those wait on the credentials above and on a second pass that should not start until `npm test` is the check you trust. The catalog, the env names, and the IAM documents are the contract for that pass.
