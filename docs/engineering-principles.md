# Engineering principles

Vector Engagement Labs is being developed as an open-source, browser-first simulation system. The interactive engine remains useful without a hosted service, an account, or a network round trip during a run.

## Architectural rules

1. **One simulation contract.** Scenario compilation, engine execution, recording, playback, telemetry, explanation, and reporting communicate through versioned schemas rather than component-specific objects.
2. **Replaceable implementations.** TypeScript and Rust/WASM engines implement the same interface. Renderers and persistence adapters depend on that interface, not on either engine.
3. **Deterministic core.** Given the same scenario package, model versions, seed, and engine version, a run produces the same recorded frames within the documented numerical tolerance.
4. **Truth is separated from presentation.** Physics state, observer estimates, map camera state, UI state, and durable records have different owners and cannot silently mutate each other.
5. **Facts are separated from assumptions.** Public-source facts, user overrides, inferred values, and model coefficients retain explicit value states and provenance.
6. **No fixed entity count.** The engine advances declared entities and lifecycle events. It does not assume a duel or a specific number of aircraft, weapons, sensors, or installations.
7. **Performance is measurable.** Engine throughput, frame latency, map responsiveness, API latency, failed runs, and incomplete runs have regression thresholds and telemetry.
8. **Safe evolution.** Schemas are versioned, migrations are forward-only, saved records are immutable, and compatibility changes require fixtures and release notes.

## SOLID application

- **Single responsibility:** scenario compilation, numerical integration, sensing, recording, rendering, persistence, and reporting remain separate modules.
- **Open/closed:** new entity types, guidance laws, render layers, and storage providers extend registries or interfaces without editing unrelated workflows.
- **Liskov substitution:** every engine backend must pass the same contract, lifecycle, determinism, and parity suites.
- **Interface segregation:** UI consumers receive narrow read models for playback, telemetry, RASP, and reports instead of an all-purpose mutable store.
- **Dependency inversion:** domain logic depends on engine, clock, catalog, recorder, and persistence ports. Browser, PostGIS, Cloudflare, and Compose code are adapters.

## Twelve-factor alignment

| Factor | Repository rule |
| --- | --- |
| Codebase | One tracked repository, with deploys derived from immutable commits. |
| Dependencies | Node, Rust, browser, and container dependencies are declared and versioned. |
| Config | Runtime configuration is supplied through environment variables or platform bindings. Secrets never enter source control. |
| Backing services | PostgreSQL/PostGIS, object storage, and telemetry endpoints are attached resources behind adapters. |
| Build, release, run | Build artifacts are created once; deployment configuration selects a release; runtime does not migrate or seed implicitly. |
| Processes | Web/API processes are stateless. Durable scenario packages and runs live in backing services or user-downloaded records. |
| Port binding | The local application exports HTTP on the configured port, currently 4317. |
| Concurrency | Browser Workers scale local batches; stateless edge handlers scale independently; coordinated sessions require an explicit state service. |
| Disposability | Startup and shutdown are bounded, migrations are one-shot jobs, and interrupted runs never become completed records. |
| Dev/prod parity | Compose and Cloudflare use the same scenario, engine, API, and migration contracts even when their service adapters differ. |
| Logs | Services emit structured event streams and OpenTelemetry signals rather than writing private local log files as authority. |
| Admin processes | Migration, seed, verification, benchmark, and export commands are explicit one-off tasks. |

## Open-source extraction boundary

The reusable simulation library should be publishable independently from the product UI. Its public surface consists of:

- versioned scenario, entity, environment, event, frame, diagnostic, and recording schemas;
- a deterministic reference engine;
- the Rust/WASM backend and TypeScript reference backend;
- conformance fixtures, parity tests, numerical tolerances, and benchmarks;
- documentation for equations, coordinate frames, lifecycle transitions, limitations, and provenance.

The web application, map styles, PostGIS catalog, reports, and observability deployment consume the library but are not required to run it. A future workspace split must preserve this dependency direction: application to simulation library, never simulation library to application.

## Required release evidence

No engine release is complete without contract tests, deterministic fixtures, numerical sanity checks, backend parity results, benchmark results, generated API documentation, model-limit documentation, and a changelog entry.

## Rust engineering contract

The Rust core uses typed domain states, explicit `Result` errors, bounded input,
and a versioned WASM ABI. Production paths do not use `unwrap`, `expect`, or
`panic`. Unsafe blocks are denied; the narrowly allowed `no_mangle` attributes
exist only to publish reviewed WASM symbols and contain no unsafe operations.

Every change to the core must pass Rustfmt, strict Clippy, native tests, rustdoc,
fresh WASM integrity verification, and TypeScript parity fixtures. Release builds
retain overflow checks. Clone operations in the integration loop must be
intentional, and performance claims must identify whether they measure native
Rust, Node-hosted WASM, or an actual browser runtime.
