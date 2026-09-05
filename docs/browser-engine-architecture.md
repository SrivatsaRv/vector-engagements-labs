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

Issue #207 does not change the Worker protocol. It expands the verification
workload to the current BVR `1.3.0` package and two release-only controls, while
retaining transfer, recycling, cancellation and exact-package admission.

#197 keeps the numerical Worker boundary unchanged while strengthening the
scenario envelope around it. Before dispatch, the browser binds the selected
immutable `vector.scenario.v4` definition to an exact
`vector.scenario-package-reference.v1` `{ id, version, contentHash }`, admits
the scenario-owned `runDurationSeconds`, and preserves the optional
`vector.authored-route-profile.v1` descriptor for VSR explanation. The
reference must resolve to the exact id/version/content hash in the deployment's
retained scenario inventory before browser dispatch and again at Worker
admission; a digest-valid adapter cannot mint an arbitrary package claim. The
duration is passed through the existing compiled `EngineScenario.durationSeconds`; the
package reference and tactical profile labels are not numerical inputs and
must never select a backend, model, route controller, or target-effect branch.
The three #197 Air studies therefore use the same model-pack, mission compiler,
Worker protocol, fixed-step engine, and event contract as every other admitted
Air run.

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
`vector.browser-runtime.v2` and its observable states are `initialization`,
`ready`, `running`, `paused`, `cancelling`, `completed`, `failed`, and
`terminated`. Version 2 requires every run request and completion to carry the
same validated `vector.scenario-draft-admission.v1` receipt.

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
After matching the opened manifest identity to the completion receipt, the
client retains one exact-length copy, bounded by the 64 MiB VSR transport
maximum, and returns the original capacity buffer to the Worker for reuse.
Workbench **Download VSR** uses only that Worker-produced copy; it never asks the
server or main thread to recreate the run. **Open/verify VSR** sends a bounded
copy through the same Worker's `open-record` request, requires the exact current
retained scenario-package tuple, and installs the opened scenario/result only
after verification succeeds. The workbench reads back the full record ID and
content digest and leaves the prior canonical run unchanged after corrupt,
unsupported or different-package imports. The existing server **Save run** and
report path remains separate. The Worker retains at most two returned
buffers, each no larger than 64 MiB, and uses a power-of-two capacity so
subsequent records can reuse storage. No `SharedArrayBuffer` or cross-origin
isolation is required.

An `open-record` request carrying an unretained engine-verification pack reaches
the same shared supplied-authority validator before either replay or Air-mission
recompilation. A no-release ground-start record therefore cannot use skipped
engine replay to expose partial evidence records or aircraft dependencies whose
validity domains do not cover the aircraft. The Worker does not maintain a
weaker model-pack validator.

## Built Worker verification

The #207 built-Worker gate prepares the current immutable Air-combat set: BVR
`1.3.0` plus WVR/BFM and transition at `1.2.0`. It transfers their ordinary VSRs,
reopens every transferred record through the Worker verifier, and verifies that
each record retains the selected package ID, version,
content hash, and compiled authored duration. The authored route profile stays
in the immutable scenario definition; it is not duplicated into the VSR or
treated as engine input. The gate proves the
published BVR and WVR studies each produce a canonical `KILL` with target
lifecycle `TERMINATED`, and the transition study produces `NO_EFFECT`. A
matched BVR control changes only release time from 2 s to 1.95 s and produces
`NO_EFFECT`; a matched WVR control changes only the admitted loft release time
from 20 s to 20.65 s and must instead retain an active target with
`NO_EFFECT`.
These are orchestration/VSR assertions around the existing engine and governed
model-pack contracts, not a new engine ABI, coefficient set, or named-platform
physics claim.

`npm run worker:verify -- --write-air-combat-evidence <directory>` writes the
five transferred `.vector` records and a deterministic compact JSON inventory
of package identity, record digest, duration, outcome, size and terminal
lifecycle. The destination must be a distinct empty staging directory. Write
mode validates and emits the newly generated set without consulting tracked
equality, so a stale tracked set cannot prevent its own recovery; the operator
replaces tracked files only after inspecting the staging set. Without the flag,
normal CI remains strict and retains no binary evidence artifact in the
worktree.

The exact issue #207 acceptance run is retained under
`fixtures/vector-record/issue-207/`: three canonical `.vector` records, the
1.95 s BVR and 20.65 s WVR release-time controls, and
`air-combat-study-evidence.json`. The #197 directory remains historical. The
current inventory binds each file name, byte length, record digest, package tuple,
duration, termination, effect, closest approach and terminal lifecycles. These
files are generated evidence, not alternate runtime inputs or precomputed
visual tracks.

Plain `npm run worker:verify` is also the semantic freshness gate for those
tracked artifacts. It requires the exact five-file inventory, matches record
IDs and byte lengths, validates every archived member digest, compares every
non-manifest member and compares the manifest after excluding only
`createdAt`, the content digest derived from that timestamp, and the browser
transport protocol label. The protocol label is tested by the runtime contract;
it is not simulation evidence and changing it does not justify rewriting five
otherwise identical records. Missing or stale simulation evidence still fails
normal Worker CI. Whole-archive hashes are not used as the oracle because record
creation intentionally records wall-clock creation time. The exact
fixture-directory prefix is registered in contract governance and the verifier
rejects missing, extra or renamed evidence files.

#207 grants no browser-artifact size allowance. The historical 585,000-byte
evidence gate and the current strict sub-620,000-byte optimized WASM ceiling
remain unchanged and are enforced by the existing build/performance checks.

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
The retained #190 regression still opens `report.json` and `frames.arrow` from
its transferred VSR and verifies the typed termination event, terminal weapon
frame, target lifecycle, and target-effect result. A title, rendered path,
renderer proximity or progress message cannot satisfy that assertion.
Saved-record admission additionally recomputes the terminal predicate and the
weapon-lifetime closest approach from exact engine-retained fixed-step evidence;
jointly resealing an event and report value is therefore not accepted as new
simulation truth.
Focused VSR verification also opens no-release Air records with digest-valid
supplied packs whose evidence row is incomplete or whose referenced aerodynamic
domain is narrower than the aircraft domain. Both must fail before mission
recompilation, using the same authority boundary exercised by the Worker.
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
