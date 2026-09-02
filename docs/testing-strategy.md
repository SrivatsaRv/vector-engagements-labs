# Testing strategy

## Frozen TP-1538 evidence

`npm run tp1538:sources:verify` checks the immutable source and metadata hashes, exact 59-page mapping, exhaustive manifest descriptors, source-render and upright lossless-display hashes/dimensions/orientation lineage, rights/export fields, visual-QA inventory, path confinement, and verification-only production isolation. `npm run tp1538:sources:generate` is deliberately pinned to Poppler `pdftoppm` 26.05.0 and Sharp 0.35.0; repeated generation must be byte-identical before any regenerated artifact is admitted.

The verifier is offline and cannot fetch replacement evidence. Numeric transcription, interpolation, and runtime tests belong to later #142 children and must not be credited to #143.

## TP-1538 aerodynamic verification corpus

The #142 gate admits two complete, isolated manual transcripts, reports every structural/state/printed-string mismatch, requires source-page adjudication for each difference, and validates one immutable 48-table/14,705-position corpus. The admitted corpus has canonical SHA-256 `24833d23b6ba542cdda4152e9f0eeac4a5936e827c9c4367d25eb70e11a724d2`; its 13,587 available, 37 printed-blank, one illegible, and 1,080 out-of-domain decisions replay from embedded lineage. Focused tests reject OCR/imported numeric methods, missing/reordered/duplicate coordinates, altered pages or configurations, unavailable-cell coercion, forged recomputed digests, caller mutation, extrapolation, and production imports or bundles. Independent source-page oracles cover exact knots, interior interpolation, increments, derivatives, configuration selection, published symmetry, Appendix B assembly order, and the explicitly withheld one-dimensional `CN_AILERON_INCREMENT` assembly term.

The admitted corpus must then replay identical full-state results through TypeScript and the generated-schema Rust/WASM verifier, survive bounded UTF-8 record readback, and recover a separate verification-only Worker from the same corpus after termination. Corpus admission replays each resolved state/value and `AGREED_DOUBLE_ENTRY` or `SOURCE_ADJUDICATED` label from the exact embedded transcripts and complete frozen adjudication artifact. That artifact's content digest and comparison raw/canonical binding are part of the corpus digest, so a recomputed top-level digest cannot detach a value from its evidence lineage or collapse two raw-distinct evidence chains. The immutable performance workload binds its corpus, requests, expected results and runtime identity; its executable policy rejects dirty or unidentified measurement state and validates every complete measured output against the frozen result digest. Pre-optimization admission, 4,096-operation batch, Worker, memory and WASM-size limits are maintained in [`tp1538-aero-verification.md`](tp1538-aero-verification.md). `make ci-local`, exact-SHA clean-clone execution, and built-bundle isolation remain completion gates rather than substitutes for the independent numeric workflow.

## Value-free TP-1538 aerodynamic tooling

`make tp1538-adjudication-local` independently exercises the decision CLI over two bounded `TEST_ONLY_SYNTHETIC` mismatches. It proves immutable comparison admission; exact create/apply/validate/freeze state transitions; complete, duplicate-free mismatch coverage; canonical digest naming; exclusive `0444` persistence and raw readback; finalizer consumption; corpus retention/replay of the frozen artifact and comparison raw/canonical binding; raw-distinct evidence-chain identity; and hostile page, coordinate, decision, state/value, rationale, actor, stale-digest, symlink, oversize and tamper rejection. The separate `make tp1538-aero-local` gate regenerates the real workload byte-for-byte and runs real-corpus page oracles, full-state parity, record, Worker-replacement, size and isolation evidence.

## Generic mission-policy Stage-0 source freeze

`npm run policy:generic-mission-policy-source:verify` is the source-independent
CI contract gate. It validates the canonical manifest, non-legal source-terms
evidence, exact release-owner review binding, closed denied decisions,
value-less assumption classes, corrected FAA PDF/printed-page mapping, rejected
alternate identity, hostile manifest cases and production/runtime-fixture
isolation. It runs under the deny-all network guard before and after the Worker
build. A missing external-source directory cannot become a skipped success.
Isolation scans every production/runtime-fixture file for exact governed-byte
hashes and SHA-256-confirmed raw or contiguous-base64 rolling fingerprints; a
marker-free PDF, metadata response, page render or contact sheet still fails.
The committed record is only a policy template. Each run generates PASS
evidence bound to exact candidate/runtime heads and content digests for all
attested inputs and the scanned production tree.

`VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR=/absolute/path make
generic-mission-policy-sources-local` is the separate mandatory completion
gate. It checks the three user-supplied PDFs, both NASA metadata files and the
rejected NASA alternate by exact size/hash; verifies NASA rights/export facts,
FAA MD5 and all PDF page counts; rerenders all 15 selected pages with the
content-addressed Darwin arm64 Poppler 26.05.0 profile; and requires exact
source-set and ordered render-set digests. The source, metadata, render and
contact-sheet bytes remain outside Git.

Runtime/parity, browser, performance, database and migration layers are omitted
because this change adds no executable, UI, persistence or schema behavior.
Normal `make ci-local`, built Worker verification and exact clean-clone evidence
remain mandatory to prove nonpromotion and regression safety.

## Generic sensor Stage-0 source freeze

`npm run generic-sensor:sources:verify` first proves the generated manifest and
all derived governance records are current, then verifies the offline bundle.
Every generator, verifier, and focused adversarial test process preloads the
tracked deny-all Node network guard; the regression first proves that raw TCP,
HTTP, and every callback, promise, resolver-instance, and ESM DNS lookup,
`resolve*`, and reverse call fail. The same verifier runs again after `npm run build` in
`worker-local` and hosted integration so `.next` and every other production
output are present when source-bundle exclusion is measured.
The verifier pins the complete canonical manifest digest and rejects
caller-resealed source identities, substituted PDFs, relabelled renders, erased
claims, and relaxed numeric/equation extraction policy even when every local
hash, byte total, and dependent artifact is updated consistently. This command
is mandatory in `make ci-quality`; `make generic-sensor-sources-local` exposes
the same focused gate.

The same command independently rerenders all 44 declared NASA source pages
from the exact PDFs with the closed Poppler profile selected by operating
system and architecture, requires byte-identical PNG output within that
profile, rejects blank or structurally invalid images, reproduces the three
upright display derivatives, and checks every source/display page mapping.
Darwin arm64 and Linux amd64 are separately content-addressed because Poppler's
lossless PNG bytes are not cross-platform identical. No tolerance or
cross-platform-byte claim is used. The manifest binds the release owner's
semantic review to both exact 44-page render sets and all eight profile/contact
sheet identities, including cross-profile mapping, structure, orientation, and
limitation consistency. It does not use OCR or extracted text to supply numeric
values or equations.

A dedicated hosted renderer job builds Poppler 26.05.0 once from the official
release archive through `scripts/install-pinned-poppler-ubuntu.sh`, inside the
Ubuntu 24.04 image pinned at
`sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517`.
The bootstrap rejects any source digest except
`6fef27ff04f37db43054c86bcdff6128c9fb1f6af4ef3c8b369a7e9abd68d0bb`.
Its Docker image is cached under a key derived from the installer, Dockerfile,
and network-denied wrapper, then restored by quality, web-contract, and
post-build integration instead of compiling independently in each job. The
protected production verification job restores and validates the same pinned
renderer before it runs `make ci-local`; deployment cannot proceed using an
ambient or missing PDF renderer. Both
`pdftoppm` and `pdfinfo` are built from that source and invoked through the
same no-network container; Stage 2A depends on the setup job because `npm test`
executes the mandatory source rerender regression. The cold x86-emulated reproduction completed in
6m31s; the setup job has a 15-minute budget while the existing 20-minute
quality/integration budgets remain unchanged. The verifier container has no
network and every Linux render must match its committed profile byte-for-byte.
The built executables and their Poppler shared library live under `/opt/poppler`;
they cannot be placed below `/tmp`, because the network-denied wrapper mounts
the host temporary tree there for exact input and output paths. Bootstrap also
expands every workspace placeholder before the wrapper's version probe, so no
literal template token can survive into a hosted mount target.

Testing is part of the implementation contract. An executable action is incomplete until its behavior is covered at the appropriate test layers and the result is recorded. The project uses focused tests for fast feedback and staged integration evidence for release confidence.

## Required layers

- **Unit:** pure math, coordinate transforms, parsers, reducers, validators, compilers, and state machines.
- **Contract and regression:** schemas, canonical hashes, lifecycle transitions, backend boundaries, saved records, error cases, and every bug fix.
- **Documentation impact:** base/head policy ownership, rename/copy endpoints, exact owning-section identities, structured dispositions, and hostile declaration inputs.
- **Engine:** Rust unit/integration tests, TypeScript reference tests, strict lint/Clippy/rustdoc, and deterministic parity fixtures.
- **Database and API integration:** empty-database migration, upgrade migration, deterministic seed/verifier, route admission, persistence, report replay, and failure paths.
- **Frontend:** component and interaction tests for builder, maps, playback, reports, keyboard/touch behavior, loading, cancellation and errors.
- **Browser end-to-end:** built-app journeys proving Enter → Construct → Simulate → Observe → Explain → Compare → Report, including save and replay.
- **Visual/responsive:** supported viewport checks, changed-breakpoint screenshots or traces, and map interaction evidence.
- **Performance and operations:** p95/allocation benchmarks, Worker cancellation/recovery, load/soak, health, metrics, traces and logs.

Use the smallest complete set for a change. State why any applicable layer was omitted. A passing build is not a passing behavioral test.

## Pre-engine control admission regression

The BVR `1.3.0` regression compiles the unedited package and the 1.950 s
release-only control through the same structured and final mission admission
path. Route, duration, speed, fuel, wind and temperature domains retain their
shared numeric authorities; capability projection is presentation-only and
cannot bypass admission or alter engine inputs.

The #197 matrix adds scenario-owned run duration plus the BVR/WVR/transition
route, release and guidance combinations. It proves identical frontend,
compiler and Worker domains, malformed-draft persistence across step unmount,
and that profile labels cannot change compiled bytes while a causal input does.

The machine-readable inventory is
`governance/air-combat-study-control-matrix.v1.json`. Its fourteen rows are
strictly limited to controls required by #197 and exercised by the three
governed studies; it is not evidence that #193's workspace-wide inventory is
complete. Every evidence reference carries an exact executable case ID, test
file and test name. `node scripts/verify-air-combat-control-matrix.mjs
--allow-gaps` runs those exact cases and validates the inventory in audit
mode; omitting it is the completion gate and fails
while any row is `GAP`. Compiled target-effect authority is not an editable
control and is therefore explicitly outside this editable-control inventory;
its separate canonical authority/commit matrix remains mandatory.
Projection-only regime/leg semantics and the deterministic replay seed's
explicit `NO_RUNTIME_EFFECT` state are not promoted to causal engine inputs.

Target-effect authority is not editable scenario-builder input. Its compiler
boundary still applies the same fail-closed layering: exact schema/digests and
weapon/target bindings before ticks, then a canonical six-decimal projection of
termination distance/time and target mass/speed/altitude before domain checks
and commit hashing. Independently resealed noncanonical values are rejected.

The #193 baseline makes the 41-field legacy `Scenario` authority inventory a
compile-time complete `Record<keyof Scenario, ...>` with an immutable SHA-256
identity. Its focused regression enumerates all 20 numeric legacy domains and
tests malformed raw text, exact bounds, adjacent out-of-range values,
integer-only constraints, declared precision, nullability and blank-versus-zero
semantics. Structured tests then repeat type, finite, range, integer and
precision checks after parsing and prove the frontend validator, saved-run
server and final engine preparation reject the same stable code and field path.
A hidden-field poison inventory requires an explicit remove,
migrate, derive or show-read-only disposition for every non-visible authority.

Component regressions exercise the actual raw numeric authoring control. They
prove malformed atomic values remain visible and invalid without being
committed to scenario state, while a valid replacement commits and restores
the control's validity. Existing spatial component tests independently prove
that invalid coordinates, heading, speed, route length and waypoint acceptance
radius remain visible and block admission instead of being clamped.

Air-mission tests independently prove the three-decimal ordinary-scalar ceiling
at both server and production Worker admission, while existing relational
regressions cover class-owned fields, route/start identity, ETA/TOT, fuel and
reserve, loadout capacity, runway/wind, store transfer and environment binding.
Computed legacy duplicate projections are not relabelled authored inputs; their
compiler consistency checks remain authoritative until #154 removes them.
Their computed precision is exempt, but structured type, nullability,
finiteness, range and integer checks still run before compilation. A dedicated
regression injects string, `NaN` and out-of-range duplicate values and proves
final simulation preparation fails closed.

The catalog-admission regression resolves the same current immutable model-pack
fixture used by every scenario package. When migration 017 advances that
identity to 0.9.0, the regression must advance with it and still falsify a
missing pack, payload-digest mismatch, missing limitations and mismatched
approval state before any scenario becomes runnable.
Migration regression also proves that all nine new packages use `1.1.0`, that
the nine historical `1.0.0` identities remain present, and that migration 017
contains no update path for an existing `(id, version)`. Its post-insert
readback binds every historical and current intended-use, source, credibility
manifest and compiled-pack field to the generated immutable content, so a
pre-existing conflicting identity aborts instead of being silently reused.
The historical intended-use oracle is migration 007's exact JSON definition and
legacy identity-string hash, preventing a newer reconstructed definition from
being mistaken for the already-published immutable row.
Migration 018 is a separate forward-only generator/readback gate. It publishes
only the three Air-combat packages at `1.2.0`, retains their prior immutable
rows as `RETIRED`, proves every stored field and canonical content hash, and
aborts on a conflicting existing identity. Migration 017 is checked by frozen
SHA-256 rather than regenerated from the newer library.
Engine regression
contrasts a 75 ms lifetime with a 100 ms control in the same crossing geometry:
the former expires at the exact in-step boundary while the latter intercepts,
with identical TypeScript and Rust/WASM results.
The suite additionally changes an entity and its compact projection, recomputes
the runtime digest, and proves the retained compiled pack still rejects the
forgery. Separate TypeScript, Rust/WASM and VSR regressions delete the digest
and prove that a retained pack with weapon-termination authority cannot fall
back to an unbound legacy projection. A non-Air VSR regression replaces and
reseals the complete runtime-pack identity and termination projection; replay
rejects it unless an independently supplied full compiled pack matches the
recorded id, version and digest exactly. Live-engine and VSR falsifiers then
mutate the supplied full pack while retaining its claimed digest; both reject
before using its termination or replay authority. The synchronous live verifier
and asynchronous replay verifier are checked against the same valid and
tampered canonical pack bytes. A legacy-event VSR with an unretained pack and
no runtime or entity termination authority remains readable without an external
pack, proving the fail-closed requirement is authority-scoped rather than an
unconditional retention dependency. Exact pre-termination records that omit
`weaponTerminations` retain their historical runtime-digest v2 verification and
are normalized to an empty projection only after that digest passes; a changed
v2 digest fails closed. Conversely, an entity termination cannot borrow the
identity of a retained pre-termination pack: both live backends require the
resolved pack itself to contain the exact termination authority. A hash-resealed
current record whose typed terminal events are replaced by legacy v1 events is
rejected before replay, while the historical no-termination records retain
explicit unavailable-event playback. A second hash-resealed falsifier restores
the final weapon to its preceding active state, deletes both terminal events and
relabels the report and completion as a time limit; independent final-segment
predicate evaluation still detects and rejects the geometric intercept. A
stronger hash-resealed falsifier also removes that exact predecessor frame and
its observer picture, then reindexes the remaining events; replay rejects the
record because every released termination-capable nonterminal claim must retain
an exact final fixed-step pair. A third falsifier discards an earlier intercept,
appends two copies of an earlier active frame at the nominal final fixed-step
times, removes terminal events and relabels the archive as `time_limit`; full
deterministic rerun of every termination-capable record rejects the forged
nonterminal outcome even though its final retained pair is locally consistent.
A VSR round-trip separately proves that an
explicit unpowered `JETTISON` remains outside guided-weapon terminal authority
instead of being rejected as a suppressed terminal event. The governed airborne
`RELEASE` round-trip remains inside full replay and proves that canonical member
key ordering does not change closed ground-dynamics validity. Native Rust validation separately removes the
runtime termination projection from an otherwise executable entity and proves
that direct rlib/WASM callers reject it before integration, matching the
TypeScript and wrapped-WASM boundaries. The backend admission matrix also
proves that only `GUIDED_WEAPON` entities count toward the single scheduled
guided-release limit in both TypeScript and Rust/WASM. VSR mutation regressions
rehash complete terminal and truthful nonterminal records after changing the
report's primary weapon to a carried store. Terminal event authority rejects
the first form, while deterministic full-run replay rejects the nonterminal
form by comparing the exact primary weapon and target identities. Contradicting
any terminal cause with the target lifecycle also fails before replay exposure.
Migration 017 additionally exact-reads every
explicitly inserted scenario column after conflict, including status and the
complete package, so a partial deployment cannot leave a non-executable or
otherwise divergent row behind a matching content hash.

Raw-boundary regression additionally relabels a jointly resealed product
projection as `engine-verification` and requires rejection unless the complete
canonical compiled pack travels in `vector.engine-run-request.v1`. The positive
case proves both live backends execute that exact authenticated verification
pack. Separately digest-valid supplied packs with an extra top-level authority
field, a duplicate weapon identity or a duplicate intended-use identity fail in
both TypeScript and the raw Rust/WASM ABI before the pack can authorize
execution. The same cross-backend table reseals a string-valued weapon launch
mass under a valid canonical digest; TypeScript and raw Rust/WASM must both
reject it at the compiled-weapon boundary. The same table rebinds a weapon and
its runtime/entity projection to a non-semantic version and proves that both
backends reject it. The no-release Air-record regression then carries malformed
weapon-mass and aircraft-fuel packs to VSR readback and proves neither can
exploit a skipped engine rerun to reach mission recompilation. The validators
cover the complete compiled weapon key set, base identity/evidence/validity
fields, physical scalars, referenced model indexes, enums and termination
authority; the Air readback boundary applies the corresponding complete
aircraft shape, physical-domain, component-index and performance-admission
checks before compilation. It also reseals the selected compiled station's
integer capacity as a string and proves that complete loadout/compatibility
shape, numeric-domain and reference validation rejects the pack before
Air-mission loadout arithmetic. The same table proves a digest-valid loadout
whose altitude domain no longer covers its aircraft is rejected by the shared
canonical coverage predicate, while a separately resealed unused station with
an empty compatible-store list remains valid. The no-release VSR path repeats
the narrowed-domain falsifier so skipped engine replay cannot bypass the
loadout-to-aircraft relationship.
The supplied-authority matrix also independently reseals partial, extra-field,
unknown-kind, duplicate-ID, invalid-digest, relative-URI, impossible-date and
blank-locator evidence records. Each must fail before evidence IDs can authorize
aircraft, weapon, loadout or compatibility references. Six separate coverage
falsifiers narrow the referenced aerodynamic domain, an aerodynamic coefficient
table, propulsion domain, thrust table, fuel-flow table and sensor domain; all
must fail through the compiler-owned aircraft coverage predicate. A separate
digest-valid falsifier removes every coefficient table from the selected
aerodynamic model. A table-driven structural matrix independently falsifies a
table's exact field set, axis unit, strict coordinate order, tensor shape,
finite values and evidence linkage; adjacent cases falsify propulsion and
sensor exact shapes and numeric authority. The no-release Air VSR regression
repeats the partial-evidence, narrowed-aerodynamic, empty-table and partial-table
cases to prove skipped
deterministic engine replay cannot expose any of those packs to mission
recompilation.
Table-driven native and
raw-WASM falsifiers then corrupt the termination
patch target, duplicate target key, compiled old value, SI unit and evidence
reference while recomputing `runtimeDigest`; every case fails before the
override is consumed. A positive Air VSR regression then binds its authored and
compiled mission to an unretained engine-verification pack, opens the record
with that complete authenticated pack and requires exact mission and pack
identity on readback. This proves supplied authority is reused for Air-mission
recompilation rather than passing engine replay and then failing at a
retained-only inventory lookup. A separate ground-start falsifier supplies a
digest-valid compiled pack with the recorded id/version/digest but without the
claimed engine-verification intended use. Because the implicit guided release
cannot execute, the record reaches Air-mission recompilation without an engine
rerun; admission must still reject the pack through the same full structural
and intended-use validator before the mission compiler can consume it. The
digest-valid string-mass and string-fuel variants are separately shown to fail
before the mission compiler can create invalid takeoff-mass arithmetic; the
string station-capacity variant must likewise fail before a coerced comparison
can admit the loadout, and the narrowed loadout-domain variant must fail before
archived mission recompilation.
Browser runtime tests admit the `open-record` message and prove the client sends
saved-record verification to the simulation Worker. The built browser journey
opens the Worker-produced VSR inside that Worker, so deterministic terminal
replay cannot block the rendering thread.

This baseline does not satisfy #193 by itself. Completion additionally requires
machine-readable registration for every nested Air-mission and presentation
control, deterministic constrained cross-field combinations, Worker/server
admission parity, latest-draft digest binding, persistence/VSR/report readback,
runtime configuration contrasts and a CI artifact that reports uncovered
matrix rows.

## Existing baseline

The repository owns Rust 1.97.1 as the compiler for every committed WASM
artifact. Hosted Rust verification deletes the Cargo outputs for the production
engine, generic AAM verifier and TP-1538 verifier before rebuilding and
byte-checking all three artifacts. Release and production workflows install the
same exact compiler. A floating `stable` toolchain or cached target directory is
not release evidence.

Production verification binds the contract-documentation base and tested head
to the same admitted SHA. A regression fixture keeps a newer main tip present
while proving that an older admitted revision remains independently verifiable.

The current Air-combat baseline is BVR `1.3.0` plus WVR and transition at
`1.2.0`. BVR and WVR produce generic `KILL`; transition produces `NO_EFFECT`.
The BVR 1.95 s and WVR 20.65 s release-time controls each produce
`NO_EFFECT`. Capability-projection tests independently prove that deployment
switches cannot advertise a sensor, EW, data-link or virtual-pilot model absent
from the compiled run authority.

Three independent Air-combat oracles now supplement the baseline: literal
WGS84/MSL-to-ENU geometry, deterministic histories and TypeScript/Rust parity;
the WVR study additionally uses a one-field release-time control to distinguish
recorded `KILL` from `NO_EFFECT` without asserting named-system performance.

Weapon-termination regression now includes independent relative-segment
closest-approach cases, malformed admission, maximum-flight expiry, legacy-
distance non-authority, a delayed release whose launch boundary remains the
lifetime minimum, nine-scenario TypeScript/Rust parity and built-Worker event/
lifecycle readback. Legacy geometric-intercept assertions verify that target
effect remains not modelled. The separate target-effect matrix adds strict
content-addressed authority/commit admission, independent below/equal/above
threshold oracles, configuration contrast, label invariance, unavailable and
non-geometric controls, exact once-only lifecycle/event causality, VSR v7
mutation/readback, and exact-frame presentation checks. TypeScript/Rust parity
does not replace the independent expected-value oracle.

The #197 Air-combat gate adds a closed literal ENU/WGS84/MSL oracle for all
three four-point routes, a one-metre inverse-projection budget, deterministic
repeat histories, minimum pairwise trajectory contrast, an admitted
route-coordinate mutation, complete TypeScript/Rust frame and event comparison
under the governed absolute-plus-relative floating-point tolerance, and a
single-field WVR control: release `20.00 s` records KILL/terminated while
`20.65 s` records NO_EFFECT/active. VSR tests bind the exact scenario-package
reference across compiled, manifest and report artifacts and reject malformed
or coherently resealed divergence. Browser/Worker/VSR-creation tests also reject
well-formed id/version/hash claims that do not match an exact retained package.
The BVR and transition studies likewise carry release-time-only controls within
0.25 s of their baseline; each must record a different canonical effect class.

`performance:engine-wasm-load:verify` binds the production module to the exact
pre-#196 baseline commit and interleaves 20 fresh Chromium contexts per
artifact. It gates raw/gzip/Brotli module size, built Worker raw/gzip/Brotli
growth, relative initialization p95, absolute initialization maximum and exact
initial memory through the shared `vector.engine-wasm-performance-policy.v1`.
The current raw ceiling is strictly below 620,000 bytes; changing that single
policy requires new measured evidence rather than scattered assertion edits.
`performance:engine-wasm-memory:verify` independently instantiates the exact
baseline and candidate, executes 100 high-energy runs, and gates initial bytes,
absolute and relative retained growth, plus zero growth after run one.

The generic sensor Stage-0 generator, deny-network verifier, and adversarial
suite are mandatory quality checks. `worker-local` and hosted integration rerun
that same verifier after the production build so production-output quarantine
is measured rather than inferred from missing build directories.
The focused gate also rerenders all 44 declared NASA source pages from the exact
frozen PDFs with the pinned Poppler recipe, compares exact PNG bytes, rejects
blank or structurally invalid images, reproduces the three upright display
derivatives, and checks every source/display mapping. It never extracts numeric
values or equations, and source PDFs remain authoritative.

The TP-1538 baseline retains the complete empty-coordinate and hostile
synthetic-tooling controls, then independently admits the real content-addressed
corpus and frozen workload. It checks exact source/transcript/comparison/
adjudication identities, page-grounded knots and unavailable marks, independent
bilinear and trilinear interior values, a derivative, Appendix B assembly,
complete TypeScript/Rust-WASM state parity, bounded record readback, replacement
Worker recovery, production isolation and the 500,000-byte WASM ceiling.

`make ci-local` runs quality, Rust, TypeScript, contract, parity and
production-audit checks. It first runs the same contract-documentation impact
validator used by hosted CI. Governed feature branches must supply an explicit
declaration file or JSON value; an absent declaration fails as soon as the
merge-base-to-worktree change set contains a registered family. The verifier
constructs an isolated temporary Git snapshot for dirty and untracked files,
so pre-commit validation neither ignores edits nor mutates the real index. The
post-commit clean-clone run validates the exact immutable candidate and carries
the declaration path forward. Registry regression also resolves each newly
introduced family to its exact implementation and maintained section, and
checks changelog-heading uniqueness against the live inventory rather than a
fixed family count. The #193 admission section is part of that exact owner
inventory, so mission implementation and test rules cannot gain admission or
schema facets without selecting its regression contract. It then verifies the machine-readable runtime stub
ledger. A new or removed production fallback, temporary adapter, model
assumption, named-duel identifier, scripted guidance hold, or source-less public
reference must update its owning ledger entry; an
unclassified occurrence fails. A zero-match policy control is rejected because
it can hide a classified indicator; every exemption has an accountable issue
owner and a non-causal rationale. The named targeted contracts are `make worker-local`,
`make frontend-local`, `make integration-local`, `make container-verify`,
`make observability-local`, `make performance-local` and
`make air-reference-local`. `frontend-local` requires `VECTOR_URL` to identify
an already running built application; it does not start or silently substitute
a development server. `make integration-local` validates Compose, builds and
inspects the non-root production image, starts the authoritative topology,
verifies governed migration data before fixture admission, covers the live
PostGIS/API path, and runs automated responsive interaction checks. The
responsive verifier reads the configuration-owned engine identity from
`config/deployment-capabilities.json` and requires the observed run to use that
backend; it must not hardcode a TypeScript or Rust/WASM selection. Its default
run covers the entire governed responsive matrix. `VECTOR_RESPONSIVE_WIDTH`
can select one admitted matrix width for local red/green diagnosis, but it
fails closed for unknown widths and is not complete release evidence. The image
inspection rejects missing OCI identity, development `node_modules`, an
unexpected command, or a root user. These targets remain separate because they
have different environment and runtime costs.

`make clean-clone-local` clones the current committed branch without local
working-tree files, resolves the documented harness entry point, installs the
lockfile and runs `make ci-local`. Run it after the candidate commit exists. It
is not evidence for uncommitted files.

Database integration runs `db:environment-upgrade:verify` after migrations and
before any seed command, proving production migration alone installs the exact
canonical 21 installation prerequisites, 24 runway rows and 12 EnvironmentPack
payloads. The later `db:verify` mutation matrix attempts to update every pack
column and proves that only `superseded_at` is mutable.

Database integration additionally runs `db:credibility:verify`, which confirms
the live immutable triggers reject same-version mutation and malformed compiled
pack insertion under rolled-back transactions. API tests assert that admitted
credibility, limitations, persisted run provenance, and the Validate surface
all carry the same pack digest.

Air-mission verification uses the exported `AirMissionDefinition` adapter at
template creation, JSON import, compiler admission, the production Worker
boundary, saved-run readback and VSR replay. Its focused regressions cover every
mission class, engagement overlay and start posture; hostile nested authority,
non-finite or out-of-area geometry, stale environment/runway evidence, invalid
time and fuel constraints, BLUE-only side admission, arbitrary/deleted task
references, unknown station/rule identities, store quantities above immutable
capacity, ground-envelope digest tampering, environment-owned geometry
regeneration, cross-model loadouts, digest tampering and missing
persisted intent; and causal first-frame, fuel, mass and store consequences.
The database gate must prove both an all-v3 pre-migration state and the exact
all-v4 result of migration `013_air_mission_contract.sql`; mixed versions fail.
Browser completion evidence includes the governed viewport matrix and a real
built Worker run from mission authoring through report provenance.

Airborne-store verification additionally covers authored/full/compact joint
resealing against the compiler-owned authority seal, seal/material mismatch,
ordered transfer cardinality and duplicate identity, missing/wrong
launcher/store/station/rule bindings, non-finite/nonphysical and terminal-time
requests, ground-state and once-only rejection, and direct raw-WASM parity.
Independent boundary checks use retained pre/post mass, fuel and installed-drag
evidence plus the spawned store frame for mass, momentum and kinetic-energy
balance. The matrix includes two successive stores, RELEASE/JETTISON, at least
three installed-drag/wind/mass configurations, and 10/20/40 Hz convergence.
VSR/map/frontend/browser checks prove that the same event and frame survive
Worker completion, replay, cancellation/retry and report readback.
The compiler/Rust hostile matrix also admits both exact installed-drag-area
boundaries, rejects the immediately adjacent out-of-range values and rejects a
resealed caller attempt to alter the versioned `[0.001, 1] m²` validity. The
separate `performance:generic-airborne-store-transfer:verify` process uses three
warmups and 20 measured samples per backend, reports maximum separately from
nearest-rank p95, and leaves #182's takeoff fixture and benchmark unchanged.

Aircraft-model verification additionally runs `reference-aircraft:verify`.
The gate checks immutable NASA source identities, deterministic trim
propagation, every declared external time-history tolerance, malformed and
unbounded input rejection, energy invariance, step-size convergence at common
checkpoints, and 1×10⁻⁹ TypeScript/Rust-WASM parity. A deliberately perturbed
trajectory must fail the gate.

Generic-missile arithmetic verification additionally runs
`reference-aam:verify`. It checks the frozen NASA TM-109057 bytes, exact raw corpus
and successor workload ownership, private-corpus mutation resistance, input/output falsifiers,
independent arithmetic and convergence oracles, forward/reversed workload
digests, a cross-platform quantized semantic identity with sampled and aggregate
trajectory values, full-to-terminal comparison of all 30 numeric frame leaves under the governed default/CPA-specific absolute-plus-relative parity policy,
half-bin/overflow/policy-tamper falsifiers, printed-radian boundary flips, D09 exceptional semantics, exhaustive
finite content-addressed run decoding, isolated production-bundle scans, exact numeric-boundary sweeps, and complete TypeScript/actual-WASM frame parity. The separate
`reference-aam:performance` target first verifies the immutable workload bytes,
then reports both backends under the exact `APPLE_M5_NODE24` environment profile
and closed p95 limits. It rejects dirty or unidentified Git state before
measurement and independently admits every measured backend batch against the
exact per-case terminal/tick/cause/frame-count/semantic digests, 12,145-frame
total and governed sorted batch digest. Its output binds the exact Git SHA,
complete workload identities, every timing sample, distribution, RSS growth,
frames and output bytes. It makes no Worker or product-capacity claim. See
[`generic-aam-verification.md`](generic-aam-verification.md).

Scenario-composition verification runs the focused
`tests/scenario-kernel*.test.mjs` and `tests/scenario-capabilities.test.mjs`
suites for exact schema admission, content-addressed descriptors, graph bounds,
canonical bytes, atomic typed history, six-surface redaction, stale async
response rejection and exact #154 intake, #155 workspace and #60 published-Air
adapter boundaries. The #60 proof rejects forged compiled lineage, dangling
assignment/target identities and missing governed capability admission while
emitting no duplicated mission fields. The reproducible
`npx tsx scripts/benchmark-scenario-kernel.ts` workload measures 12, 75, 100
and 250 entities over compilation, all-entity bulk edit, exact-byte undo/redo
and all six workspace projections after warm-up, rejects digest drift, and
enforces p95 at or below 100 ms for every tier. It is contract/projection
evidence only; it does not substitute for the
browser, Worker, renderer, memory or runtime capacity gates owned downstream.

GitHub CI uses `scripts/classify-ci-changes.mjs` to select the smallest complete
automated gate from merge-base-relative `--name-status -z` records. Rename and
copy records use `--find-copies-harder` and retain both endpoints without
trimming legal path bytes. Invalid UTF-8, control characters, absolute paths,
dot segments, backslashes, symlink traversal, and unregistered additions fail
closed.
`scripts/verify-contract-doc-impact.mjs` independently maps those endpoints to
the base and head versions of `governance/contract-doc-ownership.v1.json`,
validates the one structured declaration, resolves every registered Markdown
file and heading from exact Git blobs, derives the changed semantic facets, and
compares only their exact registered sections. Every test path belongs to its
actual model, engine, evidence, Worker, VSR, UI, security, mission, geospatial,
content, data, or delivery family rather than a generic test-only owner.
Regression coverage changes a test and two independent owning sections in one
fixture, proving the test-selected facet cannot hide the second changed contract
section; migration headings remain a distinct requirement inventory.
The ownership baseline also binds the shared overlay implementation and its
focused ObjectPicker/overlay regressions to `UI_RESPONSIVE_INTERACTION`,
including its dedicated shared-overlay section, so future primitive changes
cannot bypass responsive interaction evidence.
The template command runs the same analysis without accepting a declaration and
emits the exact required family/section inventory for the current diff. Hosted
verification writes the subsequently validated declaration to the visible job
summary. Regression coverage also proves changelog headings are family-unique,
the aggregate Drizzle facade has only generic database ownership, and each
domain schema module selects only its generic plus truthful domain owners.
Post-bootstrap section-introduction fixtures cover both a wholly new family and
a new facet on an existing family. They require the exact owning document and a
semantic declaration in the introducing revision, and reject dormant relabels,
empty new sections, unchanged or unrelated headings, and every non-semantic or
docs-current disposition. The same core is exercised through dirty-tree,
pull-request exact-head, and associated-main-push adapters.
Placeholder-only section regressions reject non-rendered HTML comments, empty
raw tags, subordinate headings without material rendered content, invisible
Unicode/HTML entities, reference definitions, empty links, and non-textual raw
style content. Hidden, styled, titled, dialog/details, cross-block containers,
cross-block stylesheets, and every other raw-HTML-bearing section fail closed;
raw HTML is never permitted to establish new contract authority. Positive
controls admit ordinary prose, code/list content, and a visible Markdown
autolink through the pinned renderer and decoded-DOM policy. Hosted Stage 0.6
installs the exact JavaScript lockfile with lifecycle scripts disabled before
running this parser-backed gate, while Stage 0/0.5 remain dependency-free.
Classifier probe regressions exercise the shared dependency-free name-status
parser from a clean materialized tree, bind its source digest to the classifier,
and require passing unchanged V1 and V2 self-comparisons before hostile
mutations. The immutable V1 probe remains executable compatibility authority as
well as a historical ledger entry; V2 is the current two-file
classifier/parser-helper identity contract. The helper re-exports the parser
implemented once by the self-contained classifier, so compatibility does not
create a second parser.
Exact-rule retirement regressions reproduce the former delete/rename deadlock
and then require a bijective, append-only tombstone bound to the merge-base
commit, canonical base-policy digest, old endpoint, and exact Git operation.
They cover implementation, test, and generated-rule slots; endpoint-aware
`TEST_ONLY`; same-family/inventory/facet rename replacement; retained tombstones
across later revisions; and rejection of prefix, wrong-digest, wrong-revision,
orphan, edited, removed, mismatched-target, copied/still-live, cross-inventory,
new-dormant-probe, new-inert-multi-family, empty-generated-group, and bootstrap
retirements. A two-hop rename proves historical replacement paths may later
move under a second independently bound tombstone.
The exemption matrix also rejects a deleted/retired output even when the
registered freshness command or pre-trusted refactor/invariant probes succeed,
because output retirement changes the governed contract rather than merely
refreshing derived bytes.
TEST_ONLY, GENERATED_ARTIFACT_ONLY, INTERNAL_REFACTOR,
NO_SEMANTIC_CHANGE, and DOCS_ALREADY_CURRENT are mutually exclusive,
evidence-bearing dispositions; none receives credit merely because an arbitrary
document changed. INTERNAL_REFACTOR and NO_SEMANTIC_CHANGE remain unavailable
unless a versioned adapter already registered and digest-bound by the merge-base
policy supplies the exact identity or invariant result. The declaration names
probe IDs only; the family, disposition, changed-path coverage, adapter,
assertions, revisions, and equal base/head identities are validated outside the
declaration. Adapters execute twice with a scrubbed environment and bounded
output. Candidate decision modules execute in a nested observation process and
return unhashed data; the immutable adapter parent alone hashes Git source,
decision identities, and evidence. A newly added head-policy probe, malformed result, failed assertion,
nondeterministic output, or caller-authored hash/command fails closed. The
classifier refactor probe binds the complete exported rule/effect inventory and
exact decision-function identity, then compares every base/head tracked path,
registered boundary sentinel, and add/modify/delete/rename/copy parser case.
The Required PR Gate invariant probe binds its complete mandatory-field,
review-kind, state, gate, selection, terminal-result, and decision-function
identity as well as the positive/negative matrix. An unsampled new rule or
admitted value therefore changes the identity. Probe evidence still does not
certify the technical adequacy of the contract. A generated-only disposition executes
the policy-registered direct argv after
Stage 0.6 provisions its closed Node or Rust/WASM toolchain;
it cannot be redirected by editing `package.json`. The command runs against a
temporary exact-head archive and tracked-file mutation fails. The hosted checkout is the
exact pull-request head rather than GitHub's synthetic merge tree. Semantic
schema/storage/VSR facets
additionally require their registered
Unreleased migration section. Repository-policy tests always run, and an
unknown or unclassified tracked path makes policy validation fail. Documentation and agent-harness
changes do not consume application, Rust, container, or PostGIS runners. Web,
simulation, database/API, dependency, workflow, and infrastructure paths each
add their owning gates. Shared mission, scenario, environment, model, Worker and
Vector Simulation Record contracts select the Rust/parity and integration gates
that consume them. The single Required PR Gate is always emitted and verifies
that the documentation-impact job succeeded, every selected job passed, and
every unselected job was skipped. Failed,
cancelled, timed-out, action-required or unexpectedly skipped selected jobs all
fail the gate. Workflow-level path exclusions are not used because they can
strand a required check.

The classifier names the tracked contract locations rather than legacy logical
names. `lib/record/**`, mission and spatial admission, the canonical frontend
selectors, browser Worker protocols, runtime security adapters, compiled model
packs, and `governance/environment-sources/**` each select their actual
consumers. The quality job runs the environment-source, aircraft-evidence, and
public-aircraft-reference validators as well as generated model and symbol
checks. An unclassified evidence artifact still fails closed through the full
matrix; it is not silently treated as documentation.

Regression fixtures distinguish the browser simulation Worker from the
Cloudflare delivery Worker. They also prove that a change to canonical JSON
identity selects browser, Rust/parity, and persistence consumers; that every
generic-AAM verifier source, adapter, generated artifact, generator, and Rust
crate selects its Rust owner; and that each registered seed, database-upgrade,
or credibility-catalog executable selects integration. The generic-AAM
generated-only disposition is available only through its registered Rust
source, exact generated output, direct generator command, and successful
freshness reconstruction. Ownership tests additionally keep generic delivery
harnesses out of the simulation-Worker family, bind the runtime capability
validator to both descriptor and Worker contracts, and require the public
aircraft fixture/evaluator/verifier chain to update its numerical-evidence
contract when that chain changes. They also bind the model-pack compiler to its
digest/admission/runtime sections, evidence registries to admission and subject
validity, VSR digest/event sources to every replay consumer, and real
TypeScript/Rust physics producers to the integrated-model and Rust/WASM proof
sections. This prevents backend documentation from becoming a substitute for
the actual physics or recording contract.

Precision regressions also prohibit broad semantic ownership where distinct
authorities merely share a directory. They bind geospatial datum, environment,
terrain, source-admission, verification, installation, and scenario-spatial
paths to different headings; require the built-browser gate for every
browser-consumed geospatial/catalog producer; and keep offline source admission
out of that product claim. Generic database migrations prove platform
migration/provisioning mechanics only. Exact model-pack and saved-run schema,
migration, seed, verifier, and integration-test paths additionally select their
respective persistence contracts. Mission tests distinguish authored scenario,
information-state/replay, spatial, and orchestration facets. Generic-AAM
source/evaluator/workload changes select their isolated verification family,
while production engine and capacity changes select only engine/backend and
performance contracts. Negative assertions prove object-catalog facts cannot
acquire RASP ownership, catalog admission selects its model/database consumers,
and saved-run lifecycle admission cannot acquire VSR archive or replay sections.
The same matrix rejects a broad security-directory owner: exact saved-run,
basemap relay, browser-response, and delivery paths must resolve only to their
corresponding security-boundary heading, with declared multiownership for the
small shared public-admission helpers.
Replay/current-geometry selector code and its regression test belong to the
Observe family, while the renderless browser telemetry emitter belongs only to
operations observability; neither path may force capability-admission or VSR UI
documentation that it does not implement.
The anonymous comment route, schema/migration, live client, and mixed boundary
regression own the blog publishing Notes section and are explicitly excluded
from the Saved runs family.

`make integration-ci` uses the tracked managed-server runner. The runner writes
the built application output to `outputs/integration/application.log`, stops and
awaits the complete server process group after success, verifier failure, early
server exit, or cancellation, and returns the verifier status. CI retains that
directory on failure. The policy regression deliberately fails a verifier,
checks that the log remains readable, and binds the same port again to prove
cleanup. This process evidence is separate from the Browser Contract runner. CI
builds the application once, then `scripts/run-browser-contracts.mjs` executes
the five Playwright projects serially with a fresh managed Wrangler/Workerd
process group for each viewport. The policy is `RUN_ALL_PROJECTS_ONCE`: all 75
cases execute without retries even after one project fails, so later-viewport
evidence is not suppressed. An external `SIGINT` or `SIGTERM` is different: it
terminates the active server and test process groups, records the interruption,
does not start later projects, and exits nonzero. Any project, server,
interruption, cleanup, or evidence-retention failure makes the aggregate command
fail. A pass requires a nonempty managed-server log and parseable Playwright JSON
bound to the expected project, exactly fifteen executed cases, and their successful
statuses. The fifteen governed case identities are exact and distinct, including
three independently isolated BVR, WVR and transition study journeys; global or
per-result errors cannot coexist with a passing status. Every governed project
entry must bind to the selected project's isolated output directory.
Browser-test failures require retained trace, screenshot, and video
attachments. Early-server/interruption and Playwright harness-startup failures
are separate closed evidence variants because browser artifacts cannot exist
before a browser test begins. Per-project evidence is retained below
`outputs/playwright/`; the deterministic aggregate is
`browser-contract-summary.json`.

This isolation boundary responds to two hosted, cross-branch late-suite
failures in which Wrangler 4.123/Miniflare reported `ProxyController: Network
connection lost` and the listener then refused requests. Exact-head reruns and
three matched local runs per branch passed, so no deterministic application-
bundle defect was claimed. Matched local server groups peaked at approximately
1.23–1.34 GiB RSS. Issue #63 owns the remaining soak, hosted-runtime diagnosis,
and broader harness acceptance; this slice limits one server group to one
viewport project and preserves evidence when the nondeterministic failure
recurs.

The later exact-head diagnosis matched Cloudflare workers-sdk issue `#14926`:
Wrangler `4.114.0` and newer can treat a ProxyWorker-to-UserWorker keep-alive
race as a fatal network loss. Upstream pull request `#15252` is still unreleased.
VECTOR therefore uses the complete last-known-good compatible set declared in
`governance/browser-toolchain-compatibility.v1.json`: Vite adapter `1.46.0`,
Wrangler `4.113.0`, and Workers types `5.20260721.1`. This is a temporary release-
infrastructure pin, not an application workaround. The five governed projects,
one worker, zero retries, evidence checks, process-group cleanup, and failure
classification remain unchanged. The pin cannot be removed until a released
upstream fix passes the record's hosted and local revalidation requirements.
Miniflare's transitive Undici `7.28.0` is overridden to patched `7.29.0`; the
browser matrix and clean-clone gates validate that security override with the
pinned runtime set.

## Framework decision

Node's built-in test runner and Cargo remain the domain and engine runners.
Vitest with React Testing Library and user-event owns component interactions.
`@playwright/test` owns built-application browser journeys, traces, screenshots,
retries and the required 390×844, 768×1024, 1366×768, 1440×900 and 1920×1080
projects. `playwright-core` remains only for the existing specialized responsive
inspection scripts and is not a test runner.

- `npm run test:component` runs component contracts.
- `npm run test:browser` builds and starts the application when `VECTOR_URL` is
  absent, or tests the supplied built application when it is present.
- `npm run test:browser:ci` builds once and gives each governed Playwright
  project its own Wrangler/Workerd lifecycle. It is the Browser Contract CI
  command and deliberately forces one worker and zero retries.
- `make browser-local` runs component tests and the isolated CI browser runner.
- The change classifier selects the Browser Contract job for app, component,
  scenario-admission, capability and runner changes. The Required PR Gate fails
  when that selected job does not pass.

The first suites prove deployment-disabled scenario presentation and direct-link
admission with semantic assertions. #62 remains open for canonical playback
selectors, real Worker author/run/scrub journeys, accessibility, visual baselines
and performance budgets.

Issue #197 adds four minimal Playwright surface baselines at the governed
1366×768 laptop viewport: exact unedited BVR matched-profile Map frames at
launch and committed effect, the WVR close-merge 3D frame, and the
transition-recommit 3D frame. The tests first
assert the canonical frame/time, committed target effect, exact profile
applicability, route/trail counts, store lifecycle and non-colour affiliation
identity; a matching screenshot alone is never acceptance evidence. Other
viewport projects run the same semantic journeys without duplicating
platform-sensitive pixel baselines.
The laptop baselines are retained independently for Darwin and Linux because
font rasterization is platform-specific; both inventories represent the same
semantically asserted frame rather than treating one platform's pixels as the
other's oracle. The longer VSR download/reopen journey has a 90-second test
lifecycle ceiling so loaded CI can finish setup and both record boundaries,
while its initial Worker completion remains bounded to 45 seconds and the
separate exact-study browser performance gate keeps the 10-second Worker-run
budget unchanged.

`lib/frontend/selectors.ts` is the first canonical selector boundary. Telemetry
uses its selected recorded frame and model time for both the marker and current
values. An entity that is absent or stowed produces a series gap and `N/A`, not
an invented zero. Map, 3D, timeline, report and the remaining telemetry selectors
still require migration before #62 can close.

## Release evidence

The release steward requires passing unit, contract, parity, migration, API, frontend, browser, visual, security, performance, observability, cancellation, recovery, load and soak evidence for the applicable release scope. Targets in [`performance-capacity.md`](performance-capacity.md) remain targets until a reproducible benchmark record marks them measured.

Release evidence must also include the exact contract-documentation declaration,
base/head/merge-base identities, affected family inventory, and the Stage 0.6
verdict. A passing policy job does not substitute for that independent result;
failure, cancellation, skip, missing PR association, or stale section evidence
must remain visible to the Required PR Gate.
