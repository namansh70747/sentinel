# Implementation decisions

| Decision | Reason | Revisit when |
| --- | --- | --- |
| Keep PostgreSQL/outbox/Temporal | Preserve durable intake and existing tenant isolation | Measured requirements justify a change |
| Real self-hosted telemetry, explicit simulated AWS | Develop and verify useful investigations without sandbox credentials | Dedicated authorized sandbox arrives |
| Four optional collectors per batch | Bound provider fan-out and continue after isolated failures | Runtime measurements justify a different bound |
| Preserve Temporal patch branches | Existing histories retain their original command sequence | Old workers/histories have expired and replay checks pass |
| Local fault controls require explicit local mode | Keep test failures out of production-mode workload | Fault-control requirements change |
| Request histogram uses seconds | Follow Prometheus unit conventions | Never silently reinterpret historical units |
| SLO latency query converts seconds to milliseconds | Existing assessment contract uses milliseconds | Versioned SLO contract changes |

Resolved package versions are recorded in the npm lockfile. Provider image pins are validated against actual image commands. Installation warnings and live verification limits belong in measured implementation status.
