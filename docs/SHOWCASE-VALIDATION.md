# Prototype validation — 16 November 2026

- `npm ci --cache /tmp/sentinel-npm-cache --no-audit --no-fund`: passed.
  The first default-cache attempt failed because the home npm cache was not
  writable; the workspace-safe cache resolved it.
- `npm test`: 13 test files passed, 6 skipped; 45 tests passed, 10 skipped.
  Skipped integration tests are not counted as passed.
- `npm run typecheck`: passed.
- `npx tsc -p apps/showcase/tsconfig.json`: passed.
- `npm run build:showcase`: passed; produces a self-contained HTML file.
- `npm run build --workspace @sentinel/console`: passed, including the
  prerendered `/demo/showcase` route.
- `git diff --check`: passed.

Focused tests cover credential-free/no-fetch operation, mock provenance,
healthy task counts, explicit partial results and audit entries on ECS read
failure, stale-data handling, and rejection of real resource identifiers.

No live AWS/monitoring/authentication/database/Temporal verification was
performed. Naman's uncommitted laptop work was unavailable in this checkout.

Browser interaction, visual, mobile-device, and screen-reader testing are
unverified. The supported Sites browser QA helper is not installed in this
execution environment. Responsive CSS and keyboard behavior are implemented
but are not a claim of browser-tested accessibility.
