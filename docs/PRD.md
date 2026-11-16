# Sentinel product requirements

Sentinel helps an operator investigate service failures using measured evidence. The operator signs in, registers a service and monitoring connections, receives an alert, and follows a durable investigation. Evidence distinguishes live measurements, simulation, unavailable sources and hypotheses.

The approved delivery contract is [PLAN.md](PLAN.md). Its R01–R16 requirement ledger and milestone acceptance gates govern implementation. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) records measured progress.

## Essential user journey

1. Sign in through a dedicated identity provider and choose an authorized workspace.
2. Register a service, configure SLOs and test monitoring connections.
3. Receive a real Grafana alert or request an investigation.
4. Inspect measurements, logs, traces and recent changes collected by the worker.
5. Read a deterministic assessment with supporting evidence and visible gaps.
6. Record an operator action and monitor fresh measurements for recovery.
7. Produce an attributed postmortem and follow-up actions.

## Acceptance

The complete local product requires a real controlled workload failure to reach Prometheus, Grafana, authenticated intake, Postgres, Temporal, evidence collection, notification and the redesigned console. A successful build or provider catalog entry does not establish this journey.

AWS observations remain visibly simulated until an authorized sandbox is available. Company AWS profiles and company identity providers are outside this project. Model text cannot authorize actions or establish recovery. Production infrastructure mutations remain disabled during local-product implementation.

## Product surfaces

The website explains the product and links to sign-in and an explicitly labelled demo. The console supports overview, incidents, services/SLOs, connectors, changes, audit, runbooks, reports and operational findings as their backend capabilities become available. Every surface needs loading, empty, error, unavailable and permission states.
