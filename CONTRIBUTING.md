# Contributing to Vector Engagement Labs

Vector Engagement Labs welcomes reproducible improvements to its simulation contracts, reference engines, analysis views, data provenance, and verification tooling.

## Before changing code

1. Read [`docs/README.md`](docs/README.md) and [`docs/engineering-principles.md`](docs/engineering-principles.md).
2. Identify the owning contract: scenario, engine, RASP, recording, persistence, rendering, report, or deployment.
3. Keep sourced facts, model assumptions, user inputs, and computed values distinct.
4. Do not introduce operationally precise or unsourced claims as authoritative data.

## Local workflow

```bash
npm ci
make ci-local
make integration-local
make performance-local
```

Rust/WASM changes must also preserve the committed module integrity record and pass backend parity. Map or UI changes must pass the supported responsive viewport suite. Persistence changes require a forward migration and database verification update.

## Pull request evidence

A change should include:

- the user or engine behavior being changed;
- updated contracts in `docs/`;
- unit, integration, regression, and edge-case tests proportional to risk;
- numerical tolerance and benchmark evidence for engine changes;
- screenshots only when visual behavior materially changes;
- explicit source and value-state updates for catalog changes;
- a migration and rollback-safe release note for schema changes.

## Design constraints

- The reusable engine must not import React, MapLibre, PostGIS, Cloudflare, or report code.
- The UI observes and controls runs through versioned contracts; it does not contain physics.
- A carried weapon becomes a world entity only at its launch event.
- Saved runs and published records are immutable.
- No backend may silently substitute itself for another backend.
- No new top-level workflow terminology may compete with Enter, Construct, Simulate, Observe, Explain, Compare, and Report.

## Licensing

Do not copy source, artwork, datasets, or coefficients without a compatible license and attribution record. Contributions are accepted under Apache-2.0. Third-party material must retain its compatible license and attribution in `NOTICE` and the relevant provenance contract.
