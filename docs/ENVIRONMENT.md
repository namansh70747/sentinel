# Local environment

Run commands from the repository root. Node 22 or newer and Docker Compose are required.
Set unique local database, Grafana and Keycloak passwords in the ignored `.env` file using `.env.example` as the reference. Never commit that file.

Validate the combined configuration before startup:

```sh
npm run dev:prepare-auth
docker compose -p sentinel -f compose.durable.yml -f compose.observe.yml -f compose.local.yml config --quiet
```

Auth preparation creates ignored `.local/keycloak/realm.json`, `operator-password` and `oidc.env`. It preserves generated credentials on repeated runs. The realm imports on first startup; an existing realm is not silently overwritten. The generated client uses authorization code + PKCE and callback `http://localhost:3010/api/auth/callback`. For a host-run console, load the generated `oidc.env` into its environment along with the database configuration. Local HTTP discovery requires the explicit `SENTINEL_ALLOW_LOCAL_OIDC_HTTP=true` flag and an exact loopback issuer. Containerized browser/server issuer routing still needs acceptance verification.

Start the local application and providers:

```sh
docker compose -p sentinel -f compose.durable.yml -f compose.observe.yml -f compose.local.yml up -d --build
npm run dev:wait
```

The readiness gate polls the workload, Prometheus, Loki, Tempo, Alloy and Grafana for at most two minutes. Run traffic after it passes:

```sh
npm run scenario:healthy
npm run scenario:degradation
npm run scenario:recovery
```

Scenarios accept only an HTTP loopback origin through `SENTINEL_SCENARIO_TARGET`. Request count is bounded. The workload requires explicit local mode to expose failure and latency endpoints. SLO query templates, including histogram seconds-to-milliseconds conversion, are in `ops/slos/checkout.yaml`.

The local override connects console and read worker to the observation network and uses container DNS names for provider access. Set `SENTINEL_CONFIG_WORKSPACE_ID` to the workspace that owns the local monitoring configuration. ECS is explicitly simulated; no AWS credentials are needed for this setup.

Console: http://localhost:3010. Grafana: http://localhost:3012. Prometheus: http://localhost:9090. Tempo: http://localhost:3200. Loki: http://localhost:3100. Keycloak: http://localhost:8088. Temporal UI: http://localhost:8233.

Configuration validation does not establish successful startup, login, alert delivery or telemetry ingestion. Those require the milestone acceptance checks in `PLAN.md`. Temporal uses its development server and is intended for local use.
