Adds a credential-free Sentinel presentation prototype at `/demo/showcase` and as a standalone offline-capable HTML build. Operators can configure a simulated AWS profile and run healthy, degraded, failed-read and stale-data investigations with source-labelled evidence, timelines, bounded local history and downloadable reports.

The AWS connector includes staged local validation, masked credentials, account/region binding, and a simulated connection result. No live AWS calls, authentication, Temporal workflow, PostgreSQL persistence or infrastructure actions are performed by the showcase. Existing live workspace paths are preserved.

Validation: 45 tests passed and 10 integration tests skipped; root and showcase TypeScript checks passed; standalone and Next.js console builds passed. Browser interaction/accessibility testing and live integrations remain unverified. No migrations or runtime credentials are required. Setup: `npm ci`, then `npm run demo:showcase` (http://localhost:3011).

Naman's uncommitted laptop changes were unavailable and were not modified or integrated. Full setup, architecture, presentation steps and remaining work are documented in docs/SHOWCASE.md and docs/SHOWCASE-VALIDATION.md.
