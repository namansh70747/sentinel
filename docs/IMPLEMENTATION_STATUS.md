# Sentinel implementation status

This is a production foundation in progress, not a completed SRE platform.

## Implemented and locally verified

- Separate marketing website, real workspace setup and explicit `/demo/...` fixture routes. Interactive website stage selection verified in browser.
- Independent default API and demo process; production does not emit fixtures. Replay inputs validated and bounded. Demo runtime is available at port 8790.
- Postgres migrations, runtime-role provisioning, forced tenant row-level security, transaction-scoped tenant context, immutable evidence/audit records and canonical audit-chain verification.
- OIDC code flow with PKCE/state/nonce, stored one-use login transactions, hashed DB sessions and revocation. No real identity provider has been configured or verified.
- Workspace/service creation, membership-scoped reads, admin-only SLO configuration, manual investigation requests and workspace audit UI/APIs. HTTP tests use database-created test sessions, not real SSO.
- Prometheus query/health/SLI adapters with stale/missing/invalid-data rejection. Server-scoped credentials require an explicit assigned workspace until per-workspace secret references are implemented. Evidence collection tests use mocked provider responses; live Prometheus has not been verified.
- Durable investigation outbox and Temporal read-only workflow; real Postgres + ephemeral Temporal tests verify dispatch, escalation and crash/retry deduplication. No production action can execute.
- Grafana webhook provisioning/revocation, hashed secrets, bounded input, delivery deduplication and queued investigations. HTTP tests verify wrong secrets, duplicate deliveries, resolved notifications and revocation. No live Grafana provider has been connected.
- Passkey enrollment routes/UI with session-bound single-use challenges, expiry, RP/origin checks and required user verification. Negative security tests passed; successful hardware/browser enrollment remains unverified.
- Standalone Ed25519 playbook-signature and SHA-256 execution-plan hashing utilities. These are not integrated into an execution boundary.
- Standalone AWS ECS read adapter with account/region/ARN validation and partial-failure rejection; tested using SDK responses, not a live AWS account.
- Standalone GitHub commit/deployment read adapter with mocked HTTP tests; workspace configuration/collection integration remains pending.
- Local Compose configuration for persistent DB/Temporal, migrations, console and worker. Configuration validates; full container stack build/run remains unverified.
- CI definition for unit, database and Temporal tests, typecheck/build and dependency audit. GitHub CI has not run.

## Verification checkpoint

The full enabled local suite passed 50 tests with Postgres, Temporal and console HTTP tests enabled. Subsequent changes receive targeted checks; exact test counts and skipped optional suites depend on environment variables. The latest checked dependency audit reported zero findings.

## Remaining production work

- Provider-backed OIDC testing, actual passkey enrollment/authentication and exact-plan approval proofs.
- Signed playbook registry, OpenFGA/Cedar gates, act-worker isolation, idempotent ECS rollback and real sandbox recovery/watch-window validation.
- Real AWS read clients, GitHub change-feed integration, Slack/comms worker and provider credential isolation/Secrets Manager.
- Complete incident correlation/ranking, alert hygiene, release gates, SLO lifecycle, on-call, status publishing, postmortems and review loops.
- Remaining AWS/Kubernetes, cost/capacity, DR, certificate, drift, EOL, toil and chaos modules.
- Remaining connector families, specialists, Bedrock grounding/evaluations, Zero/Tiptap collaboration, MCP/A2A and mobile experience.
- AWS CDK/Helm production packaging, monitoring, operational runbooks and deployment/restore verification.
- Full visual, accessibility, browser interaction and performance test coverage.

The owner confirmed AWS sandbox and organization IdP setup are still pending. Never interpret this checkpoint as authorization to enable live actuation.
