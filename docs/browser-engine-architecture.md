# Browser simulation engine boundary

Status: dedicated browser runtime implemented; Rust typed batch ABI pending.

1. Construct emits one immutable scenario package.
2. The compiler resolves catalog objects and versioned coefficients.
3. The engine creates state for any number of declared entities.
4. Carried weapons remain inventory (`STOWED`) and are omitted from observable frames.
5. A launch event activates a weapon and copies the launcher position, velocity, and heading into its initial world state.
6. The engine advances all active entities at a fixed model step and emits immutable sampled frames plus diagnostics.
7. Map, 3D, telemetry, RASP, explanation, comparison, and reporting consume those same frames.

## State ownership

- PostGIS owns published template versions, object identity, source assertions, model versions, installation geometry, and saved runs.
- The Construct state owns one editable draft and increments its local revision when an authoring input changes.
- Conduct owns runtime-only state: playback time, speed, selected surface, active RASP perspective, layer visibility, and prepared-condition state. These controls do not mutate the authored scenario.
- A completed result is valid only for the draft revision that produced it. Editing an authoring input invalidates Results and Save; playback, view switching, and fault activation do not.
- The report owns no simulation logic. It renders the exact saved frames and provenance read from PostGIS.

## Geographic presentation

The MapLibre surface has two independent choices:

- basemap: minimal or satellite;
- extent: engagement (default, fit to recorded trajectories) or region (India/Pakistan public-reference station context).

Map, 3D, and telemetry share model time. Tactical markers are keyed by affiliation, object kind, and lifecycle; a guided weapon is absent before launch.

The compiled scenario also carries `vector.engine-geospatial.v1`: a stable WGS84
origin, entity-keyed geographic initial positions, and the frozen
`vector.synthetic-environment.v1` manifest. Each sampled frame records both the
authoritative local f64 position and an entity-keyed WGS84 ellipsoid position.
MapLibre consumes the recorded geographic sample; Three.js consumes the same
frame's local sample through a camera-relative f32 adapter. Neither renderer can
write position back to the engine. See
[`geospatial-environment.md`](geospatial-environment.md).

`lib/engine/contracts.ts` defines the boundary; `compiler.ts` resolves the scenario; `core.ts` integrates it. No loop assumes two, four, or another fixed entity count.

TypeScript is the conformance reference; Rust/WASM is the authored default for
new interactive scenarios because it passes the current eight-scenario parity
corpus. “Reference” describes independent verification ownership, not silent
runtime fallback. The dedicated browser Worker keeps execution away from
interaction rendering, and neither backend changes scenario or frame schemas.

## Dedicated simulation Worker

Interactive workbench execution uses the module Worker in
`lib/runtime/simulation.worker.ts`. This is a browser Web Worker and is unrelated
to the Cloudflare application Worker in `worker/index.ts`. Its message contract is
`vector.browser-runtime.v1` and its observable states are `initialization`,
`ready`, `running`, `paused`, `cancelling`, `completed`, `failed`, and
`terminated`.

The TypeScript backend advances an `EngineSession` in bounded `runTicks(count)`
batches. It yields between batches so pause, cancellation, and bounded progress
messages can be observed. The default batch is 128 fixed steps and progress is
limited to at most 20 messages per wall second. Rust/WASM implements the same
Worker request, result, record, failure, timeout, and provenance protocol, but
currently executes one whole-run `rust-json-v1` compatibility call. It therefore
cannot cooperatively pause inside that short WASM call; cancellation or timeout
that cannot be acknowledged within the client grace period terminates the Worker
and the next request creates a new instance.

The runtime loads a compiled input once under a SHA-256 digest, then runs it by
`digest + scenarioRef`. The adapter carries the immutable
`DeploymentCapabilityManifest`; the Run request cannot select a backend. The
Worker dispatches only to the backend admitted by that manifest and the VSR
binds the same manifest digest. `RuntimeModelPackAdapter` is deliberately the only place
that treats the current `EngineScenario` as a model pack. It will be replaced by
the Simulation Data Foundation contract after that work lands; no competing
entity or model schema is introduced here.

Worker results are a content-addressed VSR transferred as an `ArrayBuffer`.
Ownership moves Worker → main thread at completion and main thread → Worker after
verification and decoding. The Worker retains at most two returned buffers, each
no larger than 64 MiB, and uses a power-of-two capacity so subsequent records can
reuse storage. No `SharedArrayBuffer` or cross-origin isolation is required.

## Clock ownership

- The Worker session owns fixed-step model time.
- The playback controls own seek, pause, and 0.5×/1×/2×/4× playback time over a
  completed record.
- Map and Three.js own render time through `requestAnimationFrame`.
- The runtime client owns wall-clock progress, timeout, and responsiveness
  measurement. Wall time never enters physics or record event ordering.
