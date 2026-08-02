# VECTOR Engagement Lab

VECTOR is a Cloudflare-native browser simulation for enthusiasts and instructors. It provides a public landing page, guided Scenario Studio, abstract three-dimensional engagement replay, advanced Instructor Station controls, prepared fault introduction, run-file concepts, debriefing, and printable/JSON report generation.

## Product posture

- Generic interceptor profiles rather than named weapon claims.
- Abstract entity symbols rather than aircraft renders.
- Public-data educational approximation with visible method and provenance.
- Scenario values, engine version, profile version, seed, events, and results travel with reports.
- No live military tracking, current deployment information, or weapon-control recommendations.

## Cloudflare stack

The application uses the bundled vinext runtime and builds to a Cloudflare Worker-compatible ESM artifact. The current preview keeps scenarios on-device with browser storage. Cloudflare D1 and R2 are intentionally not required for the first playable cut.

## Routes

- `/` — product landing page.
- `/lab` — guided Scenario Studio and Instructor Station.
- `/report` — printable and JSON-exportable debrief report.

## Verification

Run `make ci-local` before committing or publishing.
