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

TypeScript is the selected engine for the current Cloudflare deployment.
Rust/WASM passes the current eight-scenario parity corpus and remains an
independently executable candidate, but it is not admitted by this deployment.
The dedicated browser Worker keeps execution away from interaction rendering,
and neither backend changes scenario or frame schemas.

## Dedicated simulation Worker

The Worker transports the compiler-admitted weapon-termination model unchanged
and returns the engine-owned terminal state and event in the VSR. It cannot use
renderer distance, progress state or a legacy profile threshold to terminate a
weapon.

Air-domain adapters now carry the exact authored and compiled
`vector.air-mission.v1` lineage. Before caching a structured-cloned adapter, the
Worker independently recompiles mission, flight-plan, start, loadout, fuel,
model-pack, and environment-pack inputs and requires the same compiled digest;
main-thread validation is not trusted as Worker admission.
The #190 high-energy crossing package uses this same digest/ref protocol and
adapter. The Worker has no scenario-ID or named-aircraft branch; it executes the
ninth scenario through the ordinary fixed-step runtime and records its canonical
frames, events, observer pictures and report in the same VSR envelope.
Store-transfer admission follows the same rule: the Worker carries the authored
request, full compiled transfer, ordered compiler authority seal and compact
entity binding unchanged. It records either one accepted/achieved transfer or
one typed operational rejection; it cannot repair or promote a compact copy.
For Air scenarios, the compiler materializes BLUE start/heading, route-plan v2
geometry/transitions/radii, initial fuel, and admitted station/rule/quantity
from `CompiledAirMission`. The mission editor's spatial route is retained only
as an anti-staleness compatibility projection and does not become a second
runtime input.
The compiled scenario now carries a bounded `vector.environment-runtime-grid.v1`
projection. Both TypeScript and Rust/WASM ticks sample that immutable terrain,
atmosphere and wind payload; they never fetch provider or PostGIS data.

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

Worker results are a content-addressed VSR. The simulation Worker verifies and
opens the archive—including any deterministic terminal-engine replay—before it
posts the structured playback result and transfers the raw `ArrayBuffer` to the
main thread. The main thread never reruns engine ticks while accepting a record.
It returns the raw buffer to the Worker for bounded reuse after matching the
opened manifest identity to the completion receipt. Saved or uploaded records
use the same Worker's `open-record` request; the client transfers a bounded copy
so the caller retains its source bytes. The Worker retains at most two returned
buffers, each no larger than 64 MiB, and uses a power-of-two capacity so
subsequent records can reuse storage. No `SharedArrayBuffer` or cross-origin
isolation is required.

## Built Worker verification

The built-Worker journey includes CAP/BVR with an exact sourced Jodhpur runway start
and proves that the admitted artifact, rather than a UI label, reaches a
completed Worker run. Focused adapter tests tamper fuel after main-thread
compilation and require the same stable code and field path as server admission.
The environment-sampler module Worker admits only a complete digest-verified
regional pack and caches at most four pack identities. A sample request is
bounded by 4,096 queries and runs in 128-query scheduling chunks, yielding so a
cancel message can be observed without terminating the Worker. Cancellation
cleans request state; a subsequent retry against the same cached digest must
succeed. Invalid/corrupt packs, missing digests, out-of-coverage/time/altitude
queries and over-limit batches fail explicitly. The built Chromium gate proves
regional load, mid-request cancellation and same-Worker recovery.

`npm run worker:verify` loads the two production Worker artifacts from the
declared Vinext client output directory, `dist/client/_next/static`. It requires
exactly one hashed simulation Worker and one hashed environment-sampler Worker.
Missing or ambiguous assets fail the verification before a browser is started;
the verifier never searches arbitrary build directories or substitutes source
files.

The built-browser verification prepares its model-pack adapter with the exact
`DEPLOYMENT_CAPABILITIES` artifact embedded in the emitted Worker. It verifies
the one backend admitted by that manifest, including initialization, model-pack
admission, run, transferable record, and cancellation. It never injects a
verification-only manifest to exercise an unselected backend: that would be
correctly rejected as stale at the Worker boundary. Cross-backend numerical
parity remains owned by `tests/engine-backends.test.mjs` outside the deployed
browser admission path.
For #190, this built gate selects the governed 44 km/105-degree crossing
challenge, opens `report.json` and `frames.arrow` from the transferred VSR, and
requires a successful `weapon_intercept` termination at 131.9 s with a
21.836104 m closest approach inside the compiled 25 m verification-only radius.
It also requires the typed `WEAPON_TERMINATED` event, the terminal weapon frame,
an active target and `targetEffect: NOT_MODELLED`. A title, rendered path,
renderer proximity or progress message cannot satisfy that assertion.
Saved-record admission additionally recomputes the terminal predicate and the
weapon-lifetime closest approach from exact engine-retained fixed-step evidence;
jointly resealing an event and report value is therefore not accepted as new
simulation truth.
The #187 built-browser journey additionally proves the exact store identity is
absent before and appears once at the transfer frame, with the same outcome in
telemetry/report playback and successful cancellation/retry recovery.

## Clock ownership

- The Worker session owns fixed-step model time.
- The playback controls own seek, pause, and 0.5×/1×/2×/4× playback time over a
  completed record.
- Map and Three.js own render time through `requestAnimationFrame`.
- The runtime client owns wall-clock progress, timeout, and responsiveness
  measurement. Wall time never enters physics or record event ordering.
