# Investigate local checkout telemetry

Use this reference when the local checkout service reports errors or slow requests.
These steps describe inspection; Sentinel does not execute them automatically.

## Confirm the signal

Open the incident and inspect each source outcome and its observation window.
An uncovered Prometheus result means the input coverage is insufficient. Wait for
enough real traffic and scrape history before interpreting a severity result.

## Compare the evidence

- Compare request availability and latency for the affected service in Prometheus.
- Read Loki logs using the service's configured labels, not a global workload query.
- Open matching Tempo traces and compare the trace identifiers extracted from logs.
- Inspect repository changes only after the GitHub read connection is configured
  and its synchronization has completed. Missing credentials are not evidence that
  no changes occurred.

## Refresh and communicate

Start a fresh investigation to collect another observation window. Earlier runs
remain unchanged. Review the new run's source timestamps before comparing it with
an older run.

Send test notifications only through an explicitly approved destination. A provider
acknowledgement and an observed ntfy subscription receipt are different states.

## Boundaries

AWS context remains simulated until a dedicated sandbox connection is configured.
This runbook is an operator reference, not a declaration that an incident recovered.
