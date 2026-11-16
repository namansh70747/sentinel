# Sentinel research

Date: 2026-11-16. No application code was changed for this note. Tests were not re-run in this session. `docs/PRD.md` does not exist. The source of intent is the 2026-11-16 ownership brief in chat, checked against the repository.

Current recommendation is section I. Sections A–H are the earlier AWS-sandbox analysis and stay here so that record is not rewritten. `docs/PLAN.md` still follows the older AWS-first order. It was not revised in this pass and should not be executed as written. The source-backed supplement is [RESEARCH-FREE-INTEGRATIONS.md](RESEARCH-FREE-INTEGRATIONS.md).

## A. Task and constraints

The product outcome is one read-only investigation a person can trust: an alert or a manual request becomes an incident, the worker reads the service SLO and optional ECS state, evidence is stored, and the dashboard shows what was measured, what is missing, and what is only a lead.

Constraints that are already decided:

- Read-only first. No production write, no rollback, until a later reviewed sandbox path exists.
- Do not use company AWS profiles or a company identity provider.
- Harshit’s merged PR #2 stays. It is not thrown away and it is not treated as a finished live workflow.
- Uncommitted work on this laptop is not discarded and is not assumed to be on GitHub.
- Demo fixtures and live data stay visibly separate.
- Secrets and account-specific values stay out of git.

Assumptions used below:

- The first live slice is one workspace, one ECS service, one Prometheus, one Grafana contact point.
- A dedicated sandbox AWS account can be created or reused. The account id already typed into `scripts/verify-ecs.ts` on `origin/main` is not copied into this document.
- Node 22+ and npm workspaces remain the runtime. CI already uses Node 24 and Postgres 18 (`.github/workflows/verify.yml`).

What this is not: a claim that the full backlog in the brief (actuation, Bedrock, every connector, comms, capacity, chaos) is designed in detail here. Those stay later milestones. They are not deleted from the product.

## B. Verified findings

### Git is three layers, not one

| Layer | Where | What it contains |
| --- | --- | --- |
| GitHub `main` | `origin/main` at `6bd66c0` | PR #1 foundation plus PR #2 (`ae4241a`), merged 2026-11-12 |
| This checkout’s commit | branch `codex/plan-bound-approvals` at `87d98e7` | Two commits behind `origin/main`. Those two are only PR #2 |
| Uncommitted work | this working tree | Approvals, ECS worker wiring, migrations `0008`–`0013`, investigation UI, showcase. Not on GitHub |

`git rev-list --count HEAD..origin/main` printed `2`. PR #2’s file diff against `87d98e7` is three files: `package.json` (`test:aws`), `packages/fixtures/src/index.ts` (real-looking identifiers swapped toward the live service), and `scripts/verify-ecs.ts`.

`scripts/verify-ecs.ts` on `origin/main` hardcodes region `ap-southeast-2`, one account, role name `SentinelReadRole`, and one ECS service ARN. It calls `EcsReadClient.observe` and prints JSON. It does not create an incident, write `incident_evidence`, or start Temporal. Harshit’s report of a live read is a script result, not a product-flow result.

Local uncommitted `packages/connectors/src/ecs-read.ts` and `apps/worker-read/src/activities.ts` are the product path: account/region/ARN checks, `DescribeServices`, optional session policy, then Prometheus evidence plus optional `ecs_evidence` and a `change_hypotheses` row. `docs/IMPLEMENTATION_STATUS.md` in the working tree describes that path and says it is mocked, not live-verified. That status file is itself uncommitted, so GitHub `main` does not say this.

### What the running design already is

```text
Grafana webhook or manual request
        |  apps/console webhook route, hashed secret, dedupe
        v
Postgres incident + outbox job          packages/db, RLS by workspace
        |
        v
Temporal workflow investigateIncident   packages/workflows/src/index.ts
        |
        v
read-worker activities                  apps/worker-read/src/activities.ts
        |-- Prometheus collectSlo (only if PROMETHEUS_URL and SENTINEL_CONFIG_WORKSPACE_ID match)
        |-- ECS DescribeServices (only if SENTINEL_READ_ROLE_ARN is set)
        v
incident_evidence, ecs_evidence, change_hypotheses, audit_events
        |
        v
console investigation UI
```

The workflow is intentionally small. If evidence is missing or the activity throws, the result is `escalated` and a human owns it. There is no act client in this worker.

`correlateEcsChange` (`packages/engine/src/change-correlation.ts`) returns `candidate` or `unknown`. The comment in that file says correlation is not proof and does not authorize rollback. The worker stores that object. It does not call `UpdateService`.

Auth already present, not live-verified: OIDC authorization-code + PKCE (`packages/auth`), hashed sessions, passkey challenges (`0006_passkeys.sql`). CI sets a fake issuer `https://identity.example`. No real IdP is configured (`docs/IMPLEMENTATION_STATUS.md`).

Tenant isolation is in Postgres: workspace-scoped primary keys from `0001_foundation.sql`, plus later RLS and a runtime DB role. CI migrates as an admin URL and then runs the app as `sentinel_app`. That split should stay.

Demo versus real is already a process split: `dev:api` versus `dev:demo-api` (port 8790 in the status note) and `/demo/...` routes. The risk is copy and identifiers, not a missing flag. PR #2 edited fixtures toward a real service shape. The brief asks for fictional fixture values.

### What is not proven

This session did not run `npm test`, a console build, Prometheus, Grafana, OIDC, passkeys, or AWS. The status note’s “48 passed / 19 skipped” and “62 passed earlier” are prior claims, not a result from 2026-11-16.

`SENTINEL_CONFIG_WORKSPACE_ID` plus one `PROMETHEUS_URL` is process-global. A second workspace on the same worker would be refused telemetry. That matches “server-scoped credentials until per-workspace secret references” in the status note. It blocks multi-workspace live reads. It does not block the first sandbox workspace.

Approval code under `packages/approvals` and migrations `0008`–`0010` reserve a proof and bind it to a plan. The status note says reservation does not authorize execution. Trusted plan generation, Cedar/OpenFGA, and an act worker are still absent. Enabling `act` now would skip the safety path the brief forbids.

## C. Recommended architecture

Stay on this codebase. Do not add a second investigation engine, a second database, or a queue besides the existing outbox + Temporal.

| Piece | Owns | Does not own |
| --- | --- | --- |
| Console + route handlers | Login, workspace membership, webhook intake, dashboard | Cloud API calls |
| Postgres | Tenants, incidents, evidence, jobs, audit | Decisions about cause |
| Temporal `investigateIncident` | Order of read, retry, escalate on failure | AWS credentials, SQL |
| `worker-read` activities | Prometheus and ECS reads, writing evidence | Any AWS write |
| `correlateEcsChange` | A labeled lead | A verdict or a rollback |
| Later act worker | One signed, re-checked sandbox action | Reads, chat, the model |

Failure path that must stay visible: Prometheus down, stale sample, ECS `DescribeServices` error, or wrong account/region/ARN. The incident still closes the read as `escalated` or records `evidence.unavailable`. The UI says the source failed. It does not invent a healthy sample.

Why Temporal stays: the workflow file is already the durable boundary, and `apps/worker-read/src/durable.test.ts` exists for crash/retry. Replacing it with `setInterval` in the API would duplicate a path that already dedupes. The cost is running Temporal in Compose for any test that claims durability. Unit tests can keep mocking activities.

Why not Bedrock, OpenFGA, or Cedar in the first slice: none of them are on the read path that is unfinished. A model narrative before a real Prometheus row exists would label guesses as investigation. Policy engines matter when something can call `UpdateService`. That call does not exist.

## D. Key decisions

### 1. One read path, rebase local work onto `origin/main`

- Requirement: do not drop Harshit’s merge or Naman’s uncommitted ECS/approval work.
- Recommendation: branch from `origin/main`, bring the uncommitted tree in as reviewed commits, resolve the fixture and `verify-ecs.ts` overlap in that branch.
- Evidence: `HEAD..origin/main` is only PR #2. Local diff is the worker, migrations `0008`–`0013`, and UI. Both touch fixtures and ECS.
- Alternative: keep developing on `87d98e7` and merge `main` later. That hides a conflict until the PR.
- Tradeoff: the first PR is integration, not new features. Some showcase files may split out so the read-path PR stays reviewable.
- Assumption: the uncommitted tree is the intended product path, not an abandoned experiment.
- Verify: `git diff origin/main` after the rebase shows PR #2’s script no longer hardcoded, and `ecs_evidence` writes still present.
- Revisit if the uncommitted worker fails typecheck against PR #2’s `EcsReadClient` and the fix is a rewrite rather than a merge.

### 2. Configurable ECS read, fictional fixtures

- Requirement: sandbox read inside an incident, wrong account/region/role/ARN rejected, no company profile.
- Recommendation: `verify-ecs.ts` reads region, account, role ARN, and service ARN from the environment and refuses to start if any are missing. Fixture ARNs use account `000000000000` and names like `demo-cluster`. The worker keeps using `EcsReadClient.observe` already in `activities.ts`.
- Evidence: origin script literals; `parseEcsServiceArn` and the account check in `packages/connectors/src/ecs-read.ts`; session policy limited to `ecs:DescribeServices` on that ARN.
- Alternative: leave the script hardcoded and only document the account. That fails the brief and will rot when the sandbox changes.
- Tradeoff: a live read needs a role that can be assumed and a session policy. If the sandbox role denies `sts:AssumeRole` with a session policy, the client must be adjusted. That is a check, not a reason to grant `ecs:*`.
- Assumption: one read role per process is enough until per-workspace secrets exist.
- Verify: mocked tests for mismatch already sketched in `ecs-read.test.ts`. Live check is a separate sandbox run, recorded as live-verified only after this team repeats it.
- Revisit if the sandbox is EKS-only and ECS is the wrong first adapter.

### 3. Prometheus and Grafana stay the first telemetry pair

- Requirement: alert to evidence on a real test stack, not only `/demo`.
- Recommendation: one Prometheus the worker can query, SLOs stored on `service_slos`, Grafana webhook to the existing route. Duplicate delivery and bad secret tests already exist and should be re-run against that instance.
- Evidence: `collectSlo` usage in `activities.ts`; status note lists stale, missing, and invalid rejection; webhook tests cover wrong secret, duplicates, resolve, revoke.
- Alternative: CloudWatch-only, skipping Prometheus. More account coupling before the webhook path is proven. CloudWatch can be a later read adapter.
- Tradeoff: `PROMETHEUS_URL` is global to the process. First milestone is one workspace. Multi-workspace secrets are a later change, not a blocker for one sandbox.
- Verify: a query returns a sample, a stopped Prometheus becomes a visible error, a second webhook delivery does not create a second incident.
- Revisit if the team’s real metrics never go through Prometheus or Grafana.

### 4. OIDC and passkeys stay, with a test issuer

- Requirement: a test user logs in, sees only their workspace, and a passkey can be enrolled on a real browser.
- Recommendation: keep `packages/auth`. Add a local issuer (Authentik or Keycloak in Compose) with its own client id. Do not point tests at a company IdP. Passkey success is a manual browser check, not a CI claim, until an automated virtual authenticator exists.
- Evidence: OIDC and passkey code exist; CI uses `https://identity.example`; status note says no provider has been verified.
- Alternative: dashboard auth disabled until SSO is perfect. That hides workspace isolation bugs.
- Tradeoff: local IdP is another container. It is still simpler than debugging a hosted provider during the first week.
- Verify: login, logout, wrong workspace `403`, passkey ceremony once in a browser.
- Revisit if the team must use a specific hosted test IdP. The code path stays OIDC either way.

### 5. Actuation, models, and extra connectors stay behind the read-only slice

- Requirement: the long-term platform includes safe rollback, ranking, comms, and many connectors. None of that may pretend to be done.
- Recommendation: ship read-only evidence first. Next milestone is policy plus a sandbox-only rollback in a separate worker. Bedrock only narrates evidence that is already stored, and it cannot satisfy `decide()`. Connectors other than Prometheus, Grafana, and ECS read are catalog rows marked planned until a workspace can store a credential reference.
- Evidence: workflow has no write activity; approval reservation does not execute; status note lists OpenFGA/Cedar, act worker, and Bedrock as remaining.
- Alternative: build the act worker in parallel on week 1. A write path without a repeated live read and without a signed plan is the failure mode the brief names.
- Tradeoff: the catalog will look unfinished. That is the honest UI.
- Verify: grep/CI check that `worker-read` does not import an ECS update client.
- Revisit when a sandbox incident shows a fresh ECS observation and a human asks for one reversible action.

## E. Main risks and validation

| Risk | Smallest check | If it fails |
| --- | --- | --- |
| Rebase drops PR #2 or the local worker | Diff against `origin/main` after one integration branch | Stop feature work and repair the merge |
| Session policy cannot assume the sandbox role | One `aws sts assume-role` plus `DescribeServices` with the same policy string the client sends | Narrow the trust policy, do not widen to `ecs:*` |
| Worker ignores ECS because env vars are unset | Incident with role ARN set and one with it unset | Fix activity gating, do not hide the skip |
| Global Prometheus URL crosses workspaces | Two workspaces, one URL | Keep the workspace-id guard until secret refs exist |
| UI calls a candidate a cause | Read the incident page copy | Change copy, not the correlator’s return type |
| Uncommitted approval tables migrate on a shared DB by accident | Migrate only a local Compose database | Do not point `DATABASE_URL` at anything shared |

None of these checks were run in this research session.

## F. Verification implications

| Behavior | Proves it | Does not prove it |
| --- | --- | --- |
| ARN and account mismatch | `ecs-read` unit tests | A live role works |
| Workflow escalate on throw | Temporal test with a fake activity | Grafana can reach the laptop |
| Webhook secret and duplicate | Existing HTTP tests | A real Grafana contact point |
| Live ECS observe | Script or worker log from the sandbox, repeated by this team | Harshit’s earlier report alone |
| Passkey | One browser ceremony | CI |
| “Cause was the deploy” | Nothing in v1 should assert this | A `candidate` row |

Mocks are enough for control flow. They are not enough for IAM, network, or IdP metadata.

## G. Open questions and PRD corrections

There is no `docs/PRD.md`. The chat brief is the requirements list. `docs/IMPLEMENTATION_STATUS.md` in the working tree is ahead of GitHub and should be treated as a draft until the integration PR lands.

Contradictions:

- PR #2 fixtures moved toward a real service. The brief wants fictional fixture ids. Follow the brief.
- A green `test:aws` on a developer laptop is not the same as an incident that contains `ecs_evidence`. Do not write “live investigation verified” for a script-only success.
- Status text that says the ECS adapter is wired describes uncommitted code. GitHub `main` does not contain that wiring.

No product requirement is dropped. Items in brief section 5 remain in the backlog after the read-only slice.

## H. Readiness for planning

This section is the earlier conclusion. Section I replaces the AWS-first first check. The stack and the “do not act yet” rule still stand.

Settled in the earlier pass: stack, tenant database, Temporal read workflow, escalate-on-failure, ECS describe as the only AWS call, correlation is a lead, demo process stays separate, no act worker until the read path is real.

Provisional: local Authentik or Keycloak as the test IdP. One process-global Prometheus and one read role until per-workspace secrets. Rebase local work onto `origin/main` as the first branch.

Needs a human only for access, not for a new design: a sandbox AWS account and role this team can assume, and a machine where Prometheus and Grafana can run. Company profiles stay unused.

Highest-risk first check: after the rebase, one sandbox `DescribeServices` from the worker, stored on an incident, with a wrong ARN refused. If that fails, do not start rollback or model work.

Reasonable deferrals: Bedrock, OpenFGA, Cedar, Slack, status pages, EKS, cost, chaos, mobile. They stay in the plan as later milestones.

## I. Corrections after the free-integration audit

The later requirement is a functioning investigation of a running local service. AWS credentials are not required for that. Cloud observations may be simulated only when the stored result says they are simulated. This section records what was re-checked in the working tree and in two official docs on 2026-11-16. It does not install those services and does not claim they already run.

### What in sections A–H stays

- Three git layers. `origin/main` is `6bd66c0`. This branch’s commit is `87d98e7`. Uncommitted files are still the product path and must not be discarded.
- One correction to that reading: do not infer that a file is missing because `HEAD` is behind `main`. The working tree already contains the ECS worker wiring, even though that wiring is not what GitHub `main` shows.
- Stack stays: TypeScript, Next, Postgres with workspace isolation, Temporal workflow, separate demo process.
- `correlateEcsChange` is a lead. It does not call `UpdateService`.
- A script print is not an incident. Harshit’s live script result stays a script result.
- No act worker until a later reviewed sandbox path. Company AWS profiles and a company IdP stay unused.

### What in sections A–H is withdrawn

| Earlier statement | Correction | Why |
| --- | --- | --- |
| First proof is a live sandbox `DescribeServices` | First proof is a local service, real Prometheus metrics, a real Grafana webhook, Temporal, and a Postgres evidence row. ECS context in that incident is an explicit simulation | The revised requirement no longer waits on AWS to show a real investigation |
| Connectors other than Prometheus, Grafana, and ECS wait | Loki, Tempo, GitHub reads, and notifications can be real without AWS. Paid or unreachable providers stay simulated or unconfigured | “No AWS” was being used as a reason to postpone connectors that do not need AWS |
| Wrong workspace returns 403 | Current `workspaceAccess` returns 404 with “Workspace not found” when the membership row is absent (`apps/console/lib/workspace-access.ts`). Tests already expect 404 | The 403 figure was wrong. The check is denial, not a specific status invented for the plan |
| Either Authentik or Keycloak | Default local issuer is Keycloak. Authentik still speaks OIDC if the Keycloak container is too heavy | One default removes the hedge. The protocol does not change |
| Slack is simply deferred | First real notification path is self-hosted ntfy. Slack is optional and only after a workspace allows the webhook | A notification can be real without a Slack app |
| Demo versus live is only a separate process | Each evidence row and any conclusion that uses it must say `live` or `simulated`. A simulated ECS row must not close a live incident or authorize an action | A badge on `/demo` does not label a mixed incident |

### Code claims checked in this pass

These are in the working tree, not all on GitHub `main`.

1. One activity does every read. In `apps/worker-read/src/activities.ts`, `collectSlo` runs before the ECS call. If that call throws, ECS never runs. The workflow in `packages/workflows/src/index.ts` then marks the whole investigation escalated. A metrics failure therefore hides every other source.
2. If a Prometheus evidence row already exists, line 16 returns immediately. A later retry does not fill in ECS, logs, or traces that failed the first time.
3. The activity result is `{ available: boolean }`. That cannot say “metrics ok, ECS missing.”
4. Live freshness is two minutes. `packages/connectors/src/slo.ts` rejects a sample whose timestamp is older than `now - 120000` or more than 30 seconds in the future. `packages/engine/src/change-correlation.ts` uses the same 120 second window for an ECS observation. The showcase copy in `apps/showcase/model.ts` says five minutes. Those are different rules.
5. The collector queries `5m`, `30m`, `1h`, and `6h`, then checks only that the returned instant is fresh. A fresh timestamp does not prove six hours of samples exist. A new Prometheus will not have that history. The product must say the window is uncovered, not backfill fake points.
6. Configuration is one process. `PROMETHEUS_URL` and `SENTINEL_CONFIG_WORKSPACE_ID` gate telemetry. A second workspace on that worker is refused. That is safe for one local workspace and is not a multi-workspace connector system.
7. Grafana dedupe is not incident grouping. `apps/console/app/api/webhooks/grafana/[endpointId]/route.ts` inserts `webhook_deliveries` on `(endpoint_id, dedupe_key)` and, for a new firing key, inserts a new incident. The same delivery is ignored. A new key for the same outage is a second incident.
8. The route requires header `x-sentinel-secret`. Grafana’s current webhook docs list Extra Headers, so that header can be configured. Basic auth or an `Authorization` header alone would not satisfy this route. HMAC signing is documented by Grafana and is not implemented here. This was read from the docs. It was not tried against a running Grafana.
9. `compose.durable.yml` runs `temporal server start-dev` with a SQLite file on a volume. Temporal’s self-hosted guide says `start-dev` is for local development and points production at a separate deployment. Keeping the file across restarts is local durability only.
10. `https://grafana.com/docs/oncall/latest/intro/` as fetched on this date documents Grafana Cloud IRM, a paid add-on. It does not document a free OnCall server to install. The archive date 2026-03-24 was not on the page fetched here, so that date is not treated as verified. The decision does not need the date: do not add OnCall OSS as a foundation. This research never depended on it.

### Decisions now in force

- Stack: TypeScript, Next, Postgres, Temporal. No second control plane.
- Workload: a local service under real requests, including a deliberate fault. Measurements of those requests are real. They are not production, and they are not AWS.
- Metrics, alerts, logs, traces: self-hosted Prometheus, Grafana, Loki, and Tempo. Alloy collects logs and traces. Prometheus scrapes metrics. One collector path, not two scrapers doing the same job.
- Sentinel queries Prometheus, Loki, and Tempo itself for evidence. Grafana evaluates the alert and calls the webhook. Grafana is not a substitute for those query APIs.
- AWS: an explicit simulated adapter, chosen per scenario. If live credentials are absent, the worker does not quietly switch to the mock. Live `EcsReadClient` remains behind configuration for a later authorized account.
- Identity: local Keycloak realm. Company IdP is out.
- Secrets for the first local stack: files the operator mounts, referenced by workspace. Not a browser-chosen path. Not AWS Secrets Manager yet.
- Notifications: ntfy first. Slack only with an allowed webhook. No message was sent in this research.
- Model: optional, local, and only a summary that cites stored evidence ids. A template is not a model. The model does not approve an action.
- Required SLI missing: escalate. Optional source missing: keep the good evidence and record the gap.
- A conclusion that uses simulated evidence says so, including in an export.

### What was not re-verified

HolmesGPT, Robusta, SigNoz, Sloth, Pyrra, Gatus, OpenStatus, and Ollama were not cloned or run here. The useful judgment, without a compatibility claim, is: do not replace this control plane with HolmesGPT, and do not run SigNoz beside the Grafana stack. A 404 on one Keep URL is not a finding about that project. LocalStack is not a dependency. k3d would be a later real Kubernetes experiment, not proof of EKS.

### Verification log, 2026-11-16

`npm test` in this checkout finished with Vitest 5.0.5: 14 files passed, 7 files skipped, 48 tests passed, 19 skipped. The skipped files are the ones gated by `TEST_DATABASE_URL` or `TEST_TEMPORAL` (`packages/db`, `packages/auth`, `packages/approvals`, `packages/workflows`, `apps/worker-read` durable test, console HTTP test). This matches the earlier status note for a default local run. It does not re-run Postgres, Temporal, or the console HTTP suite. No Prometheus, Grafana, Keycloak, or AWS process was started.

Re-read of the worker, not a new test:

- Prometheus throws before the ECS `try`. The workflow `catch` then stores one sentence, “Evidence collection failed,” and drops the original error text (`packages/workflows/src/index.ts`).
- ECS throws only after a good Prometheus sample. The activity still returns `available: true`. The database can get `evidence.unavailable` for source `ecs`. The workflow status does not say that.
- If `SENTINEL_READ_ROLE_ARN` is unset, ECS is not attempted and nothing is audited. That is a silent skip, not a recorded “not configured.”
- The webhook inserts every new firing incident as severity `sev4` and state `investigating`. `recordInvestigation` updates `state` only. The incident row’s severity is never replaced by the SLI severity.
- Delivery dedupe is real for the same endpoint, fingerprint, `startsAt`, and status (`packages/connectors/src/grafana-alerts.ts`). A resolved notice uses a different key and does not queue a job. A later firing with a new `startsAt` is a new incident. Same outage from a second source is also a new incident.
- Grafana’s current webhook page documents Extra Headers, so `x-sentinel-secret` can be set there. That was read from the docs. It was not sent by a running Grafana. HMAC, which Grafana also documents, is not checked by this route.
- Loki’s current HTTP API page documents `GET /loki/api/v1/query_range`. It also says authorization is not part of the Loki API. No query was sent.
- ntfy’s publish page documents `POST /<topic>`. It says the topic name is the secret. No message was sent. The public server `ntfy.sh` is not the same thing as a server we run.
- `compose.durable.yml` pins `temporalio/temporal:1.5.1` and `server start-dev` with `/data/temporal.db`. Temporal’s self-hosted guide, fetched the same day, tells local development to use `start-dev` and points production at a different deployment. The volume does not change that.

### Run log, later the same day

These runs used the published branch `demo/credential-free-showcase` at `b591a8d`, not the uncommitted checkout. That branch’s read worker collects Prometheus only. It has no ECS call and no `ecs_evidence` table. The ECS skip, partial-ECS audit, and change-correlation notes above describe the uncommitted worker. They were not executed again here.

What ran:

- A local workload answered `GET /ok` with 200 and `GET /fail` with 500. Prometheus 3.5.0 scraped it. After the counters moved, `sum(rate(workload_requests_total[5m]))` was about twice `sum(rate(workload_requests_good[5m]))`. The process had been up for about 20 minutes. `count_over_time(workload_requests_total[6h])` was 187. The `6h` query still returned a number.
- Grafana OSS 13.0.2 sent the webhook. `Authorization` alone came back `401`. The setting that actually arrived was `settings.headers`, received as `X-Sentinel-Secret`. A map under `extraHeaders` was stored by Grafana’s API and was not sent. The route does not check an HMAC.
- Temporal workflow `investigation-79661550-e43f-4b9c-a0cd-697dd8249d48-f31a419d-a8ab-4b14-8772-3bd747bb7fcc` completed. Postgres stored one incident, `TestAlert`. Its row stayed `sev4`. The evidence row was source `prometheus`, severity `sev1`, state `advised`. The audit actions were `signal.received`, `evidence.collected`, and `incident.investigated`. No ECS row exists, so this incident has no ECS cause.
- Loki 3.5.5 accepted a pushed line and `GET /loki/api/v1/query_range` returned `GET /fail 500`. Alloy did not collect it. An instant log query was rejected; Loki requires a range query.
- ntfy v2.14.0 accepted one local publish and returned that message on read. Nothing was sent to `ntfy.sh` or Slack.
- Keycloak 26.4.2 answered `http://127.0.0.1:8088/realms/master/.well-known/openid-configuration`. No user logged in through it.
- Tempo 2.8.2 exited on the default command with `unknown backend`. The same image reached ready after a local-storage config. No trace was ingested.

The live incident page was not opened. The stored evidence source is Prometheus alone. A simulated ECS row marked `simulated` is still absent, because this branch cannot write one.
