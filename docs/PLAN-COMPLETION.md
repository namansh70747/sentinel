# Sentinel completion execution

This is the working plan for the repository after `39cfd7d`. The long form lives in the session plan. Research notes stay historical.

## Done in this pass

- Local owner username defaults to `nsharma_be24@thapar.edu` without removing `namsh70747@gmail.com` or resetting an existing password. `npm run dev:ensure-owner` creates the Keycloak user only when it is absent.
- `workload-payments` is a second local workload on port 9465, with its own log file, Loki service name, Tempo service name and Prometheus job. New checkout imports filter `job="workload"`. An existing checkout binding is updated only when its queries still match the old unfiltered fixture.
- Incident notes, transitions, alert grouping, workspace events, postmortem drafts and SLO versions have forward migrations `0030`–`0033`. Recovery to `recovered` requires live covered Prometheus evidence.
- Product pages exist for changes, findings and settings. The incident page can record a note, request recovery and draft a postmortem.
- GitHub issue publishing stays not-configured until a token is supplied, and it refuses any repository other than the approved one. Probe interpretation and fictional AWS scenarios are explicit.

## Still not claimed

Live login, Docker restart, Grafana delivery, two-workload ingestion, GitHub, Slack, Kubernetes, and the new migrations were not re-run as an acceptance suite in the same breath as this note. Run `npm test` and `npm run typecheck`, then `npm run db:migrate` against the local database before treating those paths as live. Optional Gitea, Argo CD, OpenTofu, Trivy, OpenCost, Backstage, Ollama and the act worker are not installed. AWS remains simulated.
