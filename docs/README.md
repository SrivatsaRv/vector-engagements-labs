# VECTOR Engagement Lab

VECTOR is a local-first browser simulation workbench for defence and aviation enthusiasts. It combines a versioned scenario library, named public-reference objects, source-aware loadouts, a deterministic browser physics model, Real Air Situation Picture views, repeatable experiment tools, and durable reports.

## Product flow

The experience has one continuous enthusiast journey:

1. `/` explains what VECTOR does and embeds a live model preview.
2. `/scenarios` presents eight configured templates across A2A, A2G, G2A, and G2G.
3. `/workbench?scenario={id}` opens the selected template at Review, ready to run unchanged or edit.
4. The workbench progresses through **Configure → Run → Results**.
5. Configuration uses **Brief → Forces → Flight → Conditions → Review**.
6. A saved run opens `/report?run={id}` with interpretation, replay, provenance, sources, print/PDF, and JSON export.

`/lab?scenario={id}` is retained as a backward-compatible route alias. `/lab` without a scenario redirects to the library; it is not a second landing page.

## Implemented capability

- Eight configured scenario templates stored in `lib/scenarios.ts`.
- Named Blue and Red objects with domain and affiliation filters in `lib/object-catalog.ts`.
- Source-aware A2A platform, subsystem, weapon, compatibility, and study-model records in `lib/capability-data.ts`.
- Su-30MKI/Astra Mk-I versus PAF F-16C Block 52/AIM-120C-5 as the detailed first A2A slice.
- Explicit aircraft variant, weapon, quantity, fuel, radar, data-link, jammer, track source, maneuver, and decision inputs.
- Separate Model Truth, IAF RASP, and PAF RASP views. Air-picture uncertainty is derived from configured sensor and information state and never presented as truth.
- Deterministic point-mass simulation with direct/lofted paths, target motion, an educational standard atmosphere, Mach, line-of-sight rate, prepared condition effects, and reproducible telemetry.
- Advanced enthusiast tools inside the run: repeatable variants, condition injection, observation markers, reset, replay, and results.
- D1-backed catalog bootstrap and saved-run snapshots through `/api/catalog` and `/api/runs`.
- Report output that leads with what was tested, who was involved, starting conditions, outcome, interpretation, and next comparison.
- Interactive Three.js result on screen and a deterministic SVG trajectory projection in print/PDF.
- Versioned, indented JSON export with inputs, result, telemetry, provenance, sources, and limitations.

## Data and truth boundaries

Public facts and simulation assumptions are separate records. A published conditional maximum figure is never treated as a universal engagement range. Each named weapon uses a visibly labeled VECTOR public-study curve until a stronger public validation basis exists.

RASP is a synthetic sensor-derived view generated from the run state. It models track confidence, age, uncertainty, identification, degradation, and coasting for interface and research purposes; it is not live tracking or a verified radar model.

Non-A2A templates use named catalog objects but currently retain generic public-study physics profiles. Their UI and reports no longer inherit A2A platform or weapon data through fallback lookups.

The current visualization uses a local Cartesian coordinate frame. Regional basemaps and authored geographic replay remain separate future presentation contracts; no current base coordinates or operational routes are included in this cut.

## UI acceptance rules

- Primary action visible at 1366×768, 1440×900, and 1920×1080.
- No horizontal scrolling at those desktop breakpoints.
- Configure keeps steps, authoring surface, and summary together.
- Run keeps the left experiment rail, 3D canvas, and right detail rail together.
- Results on load are explicitly labeled example, saved run, or loading; a missing saved run never silently substitutes example data.
- Controls show affiliation or view scope before effect.
- Editable inputs and calculated outputs use different component treatments.
- Custom object pickers have keyboard, hover, active, disabled, and focus states.
- React playback updates are capped at 30 Hz; Three.js renders independently.

## Visual semantics

- Blue: friendly/Blue Team affiliation.
- Red: opposing/Red Team affiliation.
- Green: ready, sourced, passed, or successful state.
- Amber: assumption, caution, uncertainty, or prepared condition.
- Grey: reference geometry or inactive context.

VECTOR uses this limited affiliation convention consistently but does not claim complete APP-06 or MIL-STD-2525 implementation.

## Cloudflare architecture

- UI and API routes: Cloudflare Worker-compatible vinext build.
- Structured catalog and saved-run metadata: Cloudflare D1.
- Future large telemetry or generated artifacts: R2, referenced by D1.
- Future account/session state: Workers authentication layer plus D1; Durable Objects only where live multi-user session coordination is required.

The current development target is local Cloudflare runtime parity. No external deployment is required to use or verify this cut.

## Verification

Run `make ci-local`. It runs lint, production build, and rendered-route tests before a commit.
