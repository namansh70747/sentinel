# Product UI contract

## User direction, 2026-11-16

Use the existing localhost:3011 showcase frontend as the visual foundation for the connected product. This explicit direction supersedes the older graphite/teal preference in the master plan. Preserve its light canvas, restrained lilac accents, white cards, generous spacing, sidebar and signal/workbench hierarchy.

## Implementation

`components/showcase.css` provides shared visual tokens and shell classes. `components/product.css` adapts real workspace forms and content. `ProductFrame` in `components/shell.tsx` composes the connected console shell. The browser-local `Showcase` remains the explicitly labelled demo; real routes use authorized API records.

Reuse the same design in the actual app rather than duplicating a second application or connecting demo-generated observations to live incident tables. Continue extracting components as real product screens mature.

## Visual rules

- Background `#f7f8fa`, white panels, borders `#e8e9ef`, body text `#242733`, action accent `#7660bd`.
- Navigation, controls and cards share one spacing/radius system. Use color with text labels for state.
- Sidebar and topbar expose overview, incidents, services, connectors and audit. Destination screens require actual backend support or explicit empty/unavailable states.
- Use real loading, permission, error, empty and partial-data states. No fabricated production health, operator names, service counts or successful connectors.
- Keep source mode and data freshness near the corresponding evidence. AWS simulation remains visibly labelled.
- Honor reduced motion. Keyboard focus must remain visible. Tables and forms must work on narrow screens.

## Verification

Typecheck and build both the connected console and standalone showcase. Inspect desktop and narrow browser layouts. Verify keyboard navigation, authentication, workspace selection, incident declaration/detail and failure states. Styling alone cannot mark the complete product redesign milestone finished.
