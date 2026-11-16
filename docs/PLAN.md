# Sentinel plan

The AWS-first order in the previous copy of this file is withdrawn. The current build is the read-only loop on branch `sentinel/read-evidence`.

AWS stays simulated until a sandbox role is in the local `.env`. See `docs/handoff/ENV.md`. Do not paste secrets into chat.

What this branch does:

- One evidence row per source, with outcome and provenance.
- Prometheus is required. A missing sample escalates and keeps the error text.
- ECS mode is `off`, `simulated`, or `live`. An empty role does not select the mock.
- CloudWatch, cost, and disaster-recovery reads are simulated and labeled.
- Loki, Tempo, GitHub, and ntfy are real only when their URLs or token are set.
- The incident severity is the SLI severity after a successful Prometheus read.
- A simulated ECS row is a lead. It is not a cause and it does not authorize a rollback.

Live `DescribeServices`, Slack, passkeys, and a six-hour history claim are not part of the current proof.
