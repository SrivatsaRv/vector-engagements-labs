# VECTOR Engagement Lab

VECTOR is a browser simulation for enthusiasts and instructors. It provides a public landing page with a playable model, an operational Lab Home, a versioned Scenario Library, guided scenario design, abstract three-dimensional engagement replay, advanced Instructor Station controls, prepared fault introduction, run-file concepts, debriefing, and printable/JSON report generation.

## Scenario Library

The first-cut library is stored in `lib/scenarios.ts` as typed, version-controlled definitions. It covers A2A, A2G, G2A, and G2G training templates. Each definition includes its Red/Blue roles, target profile, generalized theatre, complexity, model scope, tags, version, and complete simulation configuration.

Library cards link to `/lab?scenario={scenario-id}`. The lab preserves that identity through session events and report generation. The report records the scenario ID and version, engine version, profile version, model scope, target profile, theatre, and random seed.

Reports surface interpretation and public-data status before detailed configuration. The web report includes an interactive 3D replay and a three-profile sensitivity comparison. Print/PDF replaces WebGL with a deterministic vector projection generated from the recorded run; JSON uses a versioned, indented export contract with scenario, result, telemetry, provenance, and limitations.

When the service layer is introduced, this TypeScript contract becomes the API response shape. Scenario and profile metadata move to D1 or PostgreSQL; larger run artifacts move to R2 or S3-compatible storage. The UI does not need to change its conceptual contract.

## UI acceptance rules

- Fit workflows to their task rather than forcing every surface to fill the screen.
- Scenario Design keeps its primary action visible and the desktop Conduct view keeps left controls, canvas, and right detail together.
- Example and saved-result states are labeled explicitly.
- View and comparison controls show their scope before activation.
- Editable controls and derived metrics use distinct visual treatments.
- React playback updates are capped at 30 Hz while Three.js rendering remains independent.
- Release verification targets 1366×768, 1440×900, and 1920×1080 with no horizontal overflow or collapsed desktop panels.

## Navigation and workflow language

- `/` explains the product; `/lab` is the operational Lab Home and always presents a clear next action.
- `/lab?scenario={scenario-id}` opens the workbench only after a template has been chosen.
- The workbench lifecycle is **Design → Validate → Conduct → Debrief**.
- Design contains five selectable authoring steps: **Intent → Entities → Geometry → Events → Review**. These steps configure one scenario; they are not a second session lifecycle.
- Pre-populated values are labeled as template starting values.

## Visual semantics

- Blue means friendly affiliation; red means hostile/opposing affiliation.
- Green means validated/ready/success state; amber means assumption, caution, or prepared fault.
- Grey means reference geometry or inactive context.
- Profile-comparison colors are series identifiers and never recolor force-affiliation tracks.
- Affiliation follows NATO APP-06 / STANAG 2019 and MIL-STD-2525 conventions. The UI uses a simplified subset rather than claiming full symbol-standard compliance.

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
- `/scenarios` — filterable A2A, A2G, G2A, and G2G Scenario Library.
- `/lab` — operational Lab Home with guided and Instructor Station entry paths.
- `/lab?scenario={scenario-id}` — lab initialized from a versioned library template.
- `/report` — printable and JSON-exportable debrief report.

## Verification

Run `make ci-local` before committing or publishing.
