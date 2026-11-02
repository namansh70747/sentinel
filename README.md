# Sentinel

Sentinel is an agentic SRE platform under active implementation. The repository currently contains an operator console, isolated incident demo, workspace-scoped Postgres foundation, OIDC login, passkey enrollment, Prometheus SLI collection and a read-only Temporal investigation workflow. Production actuation is not implemented.

## Open locally

Use Node 24 and npm. The root runtime commands load `.env` automatically without printing its values.

```sh
npm ci
cp .env.example .env
npm run dev:console
```

Website: http://localhost:3010. Workspace: http://localhost:3010/dashboard.

The normal API and demo are independent processes:

```sh
npm run dev:api
npm run dev:demo-api
```

The normal API runs on port 8787 with demo disabled. The demo runs on port 8790; open http://localhost:3010/demo to replay fixtures. The production dashboard does not subscribe to the demo feed. Without OIDC/database configuration the workspace displays setup instructions.

## Durable local development

Configure these in `.env`:

- `SENTINEL_DATABASE_ADMIN_PASSWORD` and `SENTINEL_DATABASE_PASSWORD`: separate URL-safe passwords, at least 16 characters.
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`: organization provider configuration. Register callback `http://localhost:3010/api/auth/callback` for local development. Remote deployments require HTTPS.
- `SENTINEL_PUBLIC_URL`: the exact browser origin, with no trailing slash.
- `SENTINEL_CONFIG_WORKSPACE_ID`: workspace UUID allowed to use this server’s provider credentials. Copy it from the dashboard after workspace creation. Other workspaces fail closed until per-workspace secret references are implemented.
- `PROMETHEUS_URL`, optionally `PROMETHEUS_TOKEN`: reachable from the console/read-worker environment.

```sh
docker compose -f compose.durable.yml up --build
```

This development stack provides persistent Postgres and Temporal volumes, migrations, runtime-role provisioning, console and read worker. The Temporal development server is not a production Temporal deployment. Stop any existing process using port 3010 before starting the container console.

For host processes instead of containers, set `DATABASE_URL` and `TEMPORAL_ADDRESS`, then run:

```sh
npm run db:migrate
npm run db:provision
npm run dev:worker-read
```

Migrate/provision with an administrative connection; run the console and worker with `sentinel_app`, a non-superuser role without `BYPASSRLS`. Provisioning preserves the password of an existing role. Never use a superuser as the runtime identity: it bypasses Postgres row-level security.

## Current product flow

1. Sign in with the configured OIDC provider. Login uses PKCE, state/nonce checks and single-use stored transactions; session tokens are stored hashed.
2. Create a workspace, then register an ECS service. Only workspace admins can register services or configure SLO queries. Services start with actuation off.
3. Configure availability target, latency target in milliseconds, and three Prometheus queries. Good/total request-count queries must include `{window}` for 5m, 30m, 1h and 6h. Each query must return exactly one series. Missing, stale, nonfinite or invalid observations are rejected.
4. Start an investigation. The request persists an incident and outbox job atomically. The read worker dispatches an idempotent Temporal workflow, collects configured evidence and records advice or escalation. It cannot execute a production action.
5. Review persisted evidence and workspace audit history. Audit rows are append-only, chained and canonically hashed; the UI verifies the returned segment, not an external immutable anchor.
6. Create a Grafana webhook for a service. Configure its URL and one-time header secret in the Grafana contact point. Deliveries are deduplicated, firing alerts queue investigations, and resolved notifications do not close incidents. The dashboard can revoke the endpoint created in that view.
7. Optionally enroll a passkey after signing in within five minutes. Enrollment requires authenticator user verification. Passkey-backed plan approval and production execution are still pending.

The GitHub read adapter supports recent commit/deployment reads. The AWS ECS read adapter validates the target account/region and describes observed service state through a read role. Neither adapter is yet wired into incident collection. Connector catalog entries describe planned capabilities; they are not proof of working connections.

## Verification

```sh
npm test
npm run typecheck
npm run build -w @sentinel/console
npm audit
```

Optional integration suites:

- `TEST_DATABASE_URL`: dedicated migrated test DB with a non-superuser runtime role. Tests create retained fixture workspaces; never point at a production database.
- `TEST_TEMPORAL=true`: starts the SDK's ephemeral Temporal test server.
- `TEST_CONSOLE_URL`: separately running console configured with the same test database and `https://identity.example` test issuer. HTTP tests create test sessions directly; they do not verify a real identity provider.

See `docs/IMPLEMENTATION_STATUS.md` for verified work and remaining scope. AWS sandbox, real OIDC login, live telemetry providers and full deployment have not been verified.
