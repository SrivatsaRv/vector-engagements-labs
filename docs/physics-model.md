# Physics and information-model status

## TP-1538 source boundary

The frozen NASA-TP-1538 *Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability* pages are evidence inputs only. Issue #142 admits a closed 48-table/14,705-position corpus through isolated double-entry and page-grounded adjudication, then evaluates it through separate TypeScript and Rust/WASM implementations. The exact corpus identity is `24833d23b6ba542cdda4152e9f0eeac4a5936e827c9c4367d25eb70e11a724d2`. The evaluator remains `ENGINE_VERIFICATION_ONLY`; production dynamics must not import its source, corpus, model-pack adapter, Worker or executable authority, and must not infer missing cells, propulsion, control laws, altitude dependence, Reynolds corrections, or named-aircraft fidelity.

The verification evaluator performs exact-knot lookup and bounded multilinear interpolation only inside the published axes. Appendix B assembly preserves the printed body axes and control signs. The printed one-dimensional `CN_AILERON_INCREMENT` table remains independently look-up capable but is withheld from total-`Cn` assembly because the printed Appendix B equation does not reference it. That explicit source decision cannot be relaxed by a scenario, model-pack label, or fallback equation.

The TP-1538 evidence chain is independent of the issue #148 generic sensor
source freeze. The latter cannot satisfy aerodynamic evidence, and TP-1538
cannot authorize sensor equations, parameters, execution, or adaptation. The
#148 source terms authorize repository redistribution of its exact frozen bytes
and declared derivatives only; they do not change either physics boundary.

Vector currently uses a deterministic three-dimensional point-mass reference engine intended for inspectable sensitivity research, not verified prediction of named-system performance.

## Integrated model

The Rust compiled-model-pack v2 validator checks exact schema and content
identity only. It does not admit the artifact into a run, execute model values,
change an equation or integration step, or alter TypeScript/Rust numerical
behavior.

Air mission compilation binds airborne/Mach speed, runway entry, fuel mass,
installed stores, and `vector.aircraft-ground-operation.v2`. The operation
cross-checks the exact mission/runway/environment lineage against the immutable
`vector.compiled-aircraft-ground-dynamics.v1` projection. That projection is a
generic `PUBLIC_EDUCATIONAL` `MODEL_ASSUMPTION`, not named-aircraft authority.
At release, both runtimes hold at `PARKED`/`HOLD_SHORT`; after release they
integrate thrust, atmosphere-relative drag/lift, rolling resistance, fuel and
mass through `TAKEOFF_ROLL`, `ROTATE`, `CLIMBOUT`, and `ENROUTE`. Rotation,
liftoff and climb transitions depend on achieved force/speed/height, not phase
timers, mission class, actor name, or the airborne 60 m/s floor. Stores remain
installed and cannot launch during the bounded ground/climbout slice.
Aircraft and guided-vehicle dynamics now sample sourced atmosphere and ENU wind
at entity position/time. Initial/routes below the same DEM are rejected and
guided-vehicle terrain impact terminates before invalid atmosphere lookup.
When a regional runtime projection is present, TypeScript and Rust/WASM stop at
the first terrain/atmosphere sampling request outside coverage or time validity,
over missing data, or producing an invalid physical value. Rust propagates that
condition as `InvalidScenario` through aircraft, weapon, collision and frame
paths; it never converts terrain failure to `0 m MSL` or atmosphere failure to
`NaN`. The zero reference plane and educational atmosphere below apply only to
legacy/synthetic scenarios with no regional runtime projection.

- fixed 50 ms integration step and sampled immutable frames;
- WGS84/ECEF-derived local east/north/up coordinates with an immutable scenario origin;
- educational standard atmosphere, density, speed of sound, and Mach;
- air-relative velocity with an explicit three-axis wind vector;
- launch-state inheritance;
- thrust taper, propellant mass depletion, aerodynamic drag, and gravity;
- aircraft empty, fuel, and installed-store mass; thrust demand; parasitic drag; induced drag; and load-factor-limited three-axis route steering;
- direct and commanded-loft guidance;
- proportional-navigation acceleration demand with command limits;
- deterministic execution of authored airborne route points;
- one admitted scenario-duration limit in `[0.001, 3600] s`, preserved to at
  most three authored fractional digits and consumed by the terminal-tick
  boundary without a scenario-name override;
- causal generic runway hold, roll, rotation and climbout with recorded
  requested/accepted/achieved movement, limiter, fuel/mass/store continuity,
  transition events, and stable fuel/force/overrun failures;
- one generic public-educational airborne RELEASE/JETTISON boundary after an
  achieved airborne state: exact store mass and installed drag are removed
  once, fuel is unchanged, and the spawned store inherits the retained launcher
  position/velocity; operational rejection records typed limiter/cause without
mutation;
- G2G commanded cruise altitude, with a terminal blend to objective elevation for direct paths and a higher commanded apex for lofted paths;
- governed wind-shift events;
- engine-owned between-step closest approach; verification-only geometric
  intercept; energy miss; flight-time expiry; terrain failure;
  target-unavailable and run-time termination; non-finite-state checks; and
  dry-mass margin diagnostics.

Canonical store-transfer events publish the installed-drag scalar as the same
named non-negative six-decimal SI value in TypeScript and Rust/WASM. The event
rounding is a record/parity boundary only: both integrators retain full `f64`
precision for force and trajectory calculations.

Installed store drag for that transfer uses an authored/model-assumption SI
area admitted only in the inclusive `[0.001, 1] m²` interval. This bounded
generic discontinuity is not ejector force, safe separation, named carriage,
named store aerodynamics or weapon-effectiveness fidelity.

Weapon frames carry a closed achieved flight-state value: `STOWED`, `BOOST`,
`COAST`, `TERMINAL_GUIDANCE`, `INTERCEPT`, `MISS`, `EXPIRED`, `FAILED`,
`SELF_DESTRUCT`, or `TARGET_UNAVAILABLE`. `SELF_DESTRUCT` is reserved by the
closed state contract but has no achieved transition in this slice. The engine
derives every other state from launch/lifecycle, propulsion/guidance and the
compiled termination authority, and replay preserves it unchanged. These are
not seeker, target-track, data-link, support, fuze, damage or kill claims.
Typed seeker and support state remains blocked on the #26/#28 interface and
must fail closed rather than being inferred from a weapon name or truth.
The current compiled weapon admissions explicitly record `UNAVAILABLE` seeker
and support requirements plus `SCHEDULED_TEST_ONLY` launch authorization. The
existing deterministic fly-out remains a bounded educational trajectory test;
it does not claim operational seeker acquisition, data-link support, warning,
or support loss/recovery.

Every compiled weapon now binds `vector.weapon-termination-model.v1` with
`ENGINE_VERIFICATION_ONLY` intended use, a
`GEOMETRIC_CLOSEST_APPROACH` criterion, positive SI intercept radius and
positive SI maximum flight time. All three categorical discriminators must be
present explicitly in source; compilation never supplies a missing authority
value. The compact runtime model-pack projection now carries every weapon's
effective termination authority and includes it in `runtimeDigest`; governed
scenario patches are applied to that projection before hashing. Both engines
require each entity's model ID, model version, radius and lifetime to match the
projection exactly before integration. The current run/result/event contract owns one primary weapon, so
pre-engine admission allows at most one scheduled guided release. Additional
stores may remain installed inventory, and an explicit `JETTISON` remains an
unpowered store-transfer event, but a second guided release is rejected instead
of being integrated without its own closest-approach and terminal-event
authority. The current assumption values are 25 m and 180 s. Each fixed step
minimizes the linearly interpolated relative-position segment, so a crossing
between retained samples cannot be missed. The fixed
precedence is target unavailable, geometric intercept during the admitted
flight lifetime, exact flight-time expiry, terrain impact, then energy-depleted
miss. The flight lifetime starts at the achieved world-entry boundary: the
first fixed-step boundary at or after the requested launch time. An off-grid
request therefore does not consume lifetime while the weapon remains stowed.
When expiry falls inside a fixed step, closest approach is evaluated only
over the pre-expiry subsegment; later geometry cannot become an intercept or
reduce the recorded closest approach. A terminal result ends the
weapon lifecycle and emits one typed event at the exact retained boundary; the
event may carry a within-step occurrence time and always carries the cumulative
minimum separation achieved from the admitted launch boundary through
termination, excluding every stowed/pre-launch separation and not merely using
the terminal step's separation. The old scenario
`completion.distanceMeters` field remains a legacy profile boundary and cannot
terminate a released weapon. Map/3D proximity is presentation-only.

`INTERCEPT` means only that the verification trajectory entered the admitted
geometric radius. The termination event therefore continues to record
`targetEffect: NOT_MODELLED`. Without a separately admitted target-effect
authority the target remains `ACTIVE`, preserving byte-compatible legacy
behavior. A current public-educational Air compilation may separately bind the
generic `MODEL_ASSUMPTION` authority described in
[`target-effect-model.md`](target-effect-model.md). Its causal effect event may
change target lifecycle; the geometric termination alone never does. No current
equation claims named-weapon terminal performance, probability of kill, or
operational damage fidelity.

If an admitted weapon's assigned target is already terminated or becomes
terminated, both engines set its achieved state to `TARGET_UNAVAILABLE`,
terminate that weapon, and end the run with `target_unavailable` in the same
fixed step. They do not continue toward a substitute, cached, or truth-derived
target state. This is a typed lifecycle boundary, not seeker or support
modelling.

The current scalar source assumptions remain in versioned `simulation_models` rows for
catalog delivery and are compiled into the immutable
`vector.compiled-model-pack.v1` regression fixture. Public source assertions,
unit-bearing model sources, compiled SI data, and credibility evidence remain
separate. Every engine entity records the exact model ID, version, value state,
and pack digest. This foundation does not add flight dynamics or increase the
fidelity claim.

An isolated public-aircraft verification runner now admits NASA NESC 2015
Atmospheric Case 11 with content hashes and SI-normalized checkpoints. It
reproduces the published subsonic trim flyout in TypeScript and Rust/WASM within
declared position, velocity, attitude, angular-rate, force, moment, Mach,
dynamic-pressure, energy and trim-residual tolerances. This is a validation of
the trim-propagation and evidence pipeline, not an upgrade to the operational
scenario flight model. See [`public-aircraft-reference.md`](public-aircraft-reference.md).

The separate governed aircraft-evidence registry hashes the committed NASA
derivative, records its source/validation ancestry, and requires exact
per-capability subject coverage before a named-aircraft admission can be
compiled. Registry v2 currently blocks IAF Su-30MKI, PAF F-16C Block 52 Peace
Drive I, and catalog-only PAF F-16D Block 52 Peace Drive I performance claims.
Categorical associations remain outside the equations. See
[`aircraft-evidence-registry.md`](aircraft-evidence-registry.md).

### Historical F-16 external-store source-only boundary

The NASA historical F-16 external-store source freeze adds no equation or
runtime input. It records exact source/page/render lineage for historical
layout, decoupler-pylon, and configuration-bounded flutter observations. It
does not supply complete 3D station geometry, installed mass/CG/inertia, store
drag, compatibility, separation dynamics, a release envelope, or modern F-16
applicability. Pinned NASA source terms authorize internal verification use and
redistribution of the exact source bytes and declared full-page renders only.
The separately bound `RELEASE_OWNER_REVIEW` is a non-legal technical inspection
of all 16 page/report/anchor mappings; it records no numeric or equation
transcription. Adaptation, execution, model admission and runtime permissions
remain false, so the source cannot be compiled or executed.

### Generic mission-policy Stage-0 evidence boundary

The issue #151 manifest freezes only civil research/training source identity,
page-role and nonclaim evidence. It adds no equation, state, transition,
parameter, scheduler, controller, command, route, fuel rule, termination,
sensor/track/support state, weapon authority, doctrine, tactics or rules of
engagement to either engine. The NASA papers are preliminary architecture,
challenge and future-research context; one explicitly reports that the full
autonomous capability does not exist. The FAA pages are human general-aviation
automation and decision-making training, not an autonomous specification.

All raw and rendered source bytes remain external because the source terms do
not establish redistribution or adaptation permission. Exact offline
verification and a non-legal `RELEASE_OWNER_REVIEW` bind the selected pages and
limitations without transcribing a numeric value or equation. Every possible
runtime quantity remains a value-less `MODEL_ASSUMPTION`, and production
TypeScript, Rust/WASM, backend, Worker and browser bundles must contain neither
the manifest schema nor its source subjects.

### Aircraft motion

Aircraft motion uses the same standard atmosphere and wind field as a launched vehicle. Each fixed step consumes identity-bearing, compiled one-dimensional tables for zero-lift drag by Mach, induced drag at the admitted reference angle of attack, thrust by throttle, and fuel-flow coefficient by throttle. The TypeScript and Rust engines linearly interpolate only within an ordered table's declared coverage; an invalid table, missing full-throttle value, or an out-of-coverage input rejects the run instead of extrapolating or falling back to a compiler scalar. The present tables are still versioned model assumptions, not named-aircraft fidelity data. The engine resolves dynamic pressure, load-factor lift demand, drag, available thrust, fuel flow, mass, and the steering limit on every fixed step. Aircraft admission requires initial mass to equal admitted empty mass, initial fuel, and the launch mass of every linked stowed store. Fuel burn cannot reduce mass below empty mass plus installed-store mass. Release removes the store identity and its declared launch mass once, and the weapon inherits launcher position, velocity, and heading. The engine steers the velocity vector towards the next authored three-dimensional route point. `vector.route-plan.v1` supplies a typed fly-by acceptance radius in metres for each waypoint after the start. The route controller changes to the next leg only after entering that declared capture distance (or the fixed-step travel guard); this transition is executed by both engines and is visible in the recorded route-point index and trajectory. It records the requested velocity and steering acceleration, controller-accepted steering acceleration, achieved velocity, active route-point index, load-factor limiter state, store mass, and installed-store identities. The requested steering acceleration is the controller's instantaneous route-change demand before limiting; it is not an aerodynamic capability, pilot input, or named-aircraft performance claim. It does not use the scenario intent label to invent a turn or a permanent circular path. An aircraft without an admitted aircraft model is rejected. This is an educational point-mass route executor, not a flight-manual or manufacturer engine deck.

## Generic configuration-contrast evidence

The frozen #190 high-energy crossing challenge and its 46 km control are a termination
contrast: one enters the compiled 25 m radius at 131.9 s and the other reaches
140 s at 530.164926 m. Varying the legacy completion distance does not change
the terminal result, proving that field is not causal authority.

Target-effect contrast uses the same termination/target input under two
independently digested generic threshold packs and requires different committed
results. Separate below/equal/above boundary oracles cover every band, while
the archived #190 package remains a governed `NO_EFFECT` control at 21.836104 m.
Labels, side and scenario title are varied independently and cannot change the
commit.

`tests/aircraft-configuration-contrast.test.mjs` executes one identical
three-dimensional route and controller request with three deliberately distinct,
compatible generic aircraft configurations. It independently checks the declared
table points, then requires recorded turn trajectory, climb, acceleration, and
fuel-burn differences in TypeScript. Rust/WASM must reproduce every reported
metric and final position within the declared parity tolerance. The configurations
are test-only model assumptions; they are not source packs, do not identify an
aircraft, and do not establish a named-aircraft performance claim. This proves
that the current table/control boundary is materially consumed rather than only
labelled. It does not replace the #64 external-reference, nonlinear-table,
ground-lifecycle, store-aerodynamic, Worker, browser, or independent-validation
requirements.

The runtime accepts only the governed wind-shift event. The removed guidance-hold
experiment cannot enter TypeScript, Rust/WASM, saved-run, RASP, report, or browser
state. Information loss will return only through the typed #26/#28 support path.

The legacy `maneuver`, `targetG`, and side tactical-decision controls are retired.
They were admitted and presented even though compilation discarded them and neither
engine could consume them. Saved-run admission now rejects a record that carries
one of these fields with `SCENARIO_RETIRED_BEHAVIOR_CONTROL` and its exact field
path. The compiled TypeScript/Rust entity contract contains no unused `behavior`
wire. Aircraft therefore continue only through their admitted authored routes until
#38 has a versioned policy pack, an in-tick side-picture interface, inventory and
achieved-state guards, and a bounded-command consumer.

Sensor and air-defence envelopes are scenario-declared volumes and are explicitly
labeled `DECLARED`. Detection, tracking, engagement, and minimum-range rings
remain separate, carry their own altitude bounds and value state, and follow
their owning entity in playback. A bounded geometric terrain-LOS port and
synthetic fixtures now exist, but the current engine does not feed LOS into
sensor state or infer radii from transmitter power, radar cross-section,
terrain, propagation, or electronic attack.

The #26 observer boundary is tick-owned and fail closed. The deployed
reference pack contains only a zero-range `DECLARED_ENVELOPE`, so each side
records `UNSUPPORTED` with zero observations and no track or position. It does
not derive measurements, covariance, radar range, or jamming effects from
truth frames. The engine retains a bounded `vector.observer-sensor-admission.v1`
path for a future compiled positive-range `RADAR`, `INFRARED`, or `VISUAL`
model: it binds every admission field exactly to the compiler-produced
observer-sensor projection carried in the run binding, then uses only the
declared scan/range/FOV inputs and produces a non-positional PLOT. An
entity-level caller cannot add a sensor beside a valid pack digest. The binding
transport itself remains governed by STUB-07.

A distinct source-authored `ENGINE_VERIFICATION_ONLY` pack now admits
`vector.observer-sensor-admission.v2` with an explicit generic measurement and
track model. It drives side-owned observations, uncertainty, confirmation,
coasting, loss, and reacquisition in both engines and emits typed transition
facts through the shared event journal. Production Worker admission rejects
this pack. It is mechanism and parity evidence, not Su-30MKI/F-16 sensor
fidelity. Datalink, AEW, EW, named-sensor behavior, association of multiple
contacts, and weapon support remain unavailable until their typed interfaces
and admitted model data exist.

Positive sensor compilation now also requires a separate source/independent-
validation artifact pair and explicit validation of every runtime bound,
uncertainty, and target applicability field. It is intentionally stricter than
the current PLOT mechanism: incomplete research data is represented as
unavailable, not converted into a range-only detector.

## Presentation truth

Every movement trail is reconstructed only from recorded engine frames. The 3D surface adds a ground projection, vertical altitude stem, and translucent altitude curtain; these are views of the same position samples, not newly generated trajectories. A weapon does not appear before its launch lifecycle event.

Model Truth remains separate from IAF and PAF RASP state. Today both RASP
views are `UNSUPPORTED` because the deployed pack has no admitted measurement
model. The engine-verification fixture can show its generic side-owned estimate
only in verification tests; it does not identify the opposing aircraft, classify it,
apply jamming, link it, or support a weapon. An unavailable path yields
`NO_TRACK` and removes the opposing marker instead of falling back to truth.

## Still outside the fidelity claim

Complete nonlinear aircraft coefficient-table and engine-map execution; store drag, station moments, jettison, and other store-consumption events; maneuvering 6DOF attitude/control transients; pilot decision logic; take-off, landing, and runway operations; detailed seeker/autopilot/fuze/warhead behavior; production terrain ingestion or terrain-aware sensor state; waveform-level EW and countermeasures; probability of kill; validated operational routes or current force disposition.

## Rust/WASM gate

The gate now includes exact terminal-state/event parity, malformed termination-
model rejection and between-step closest-approach agreement for all nine
canonical scenarios. Raw Rust/WASM also binds weapon termination to the exact
compiler-owned retained-pack identity and projection. The optimized artifact
also includes strict target-effect authority, evaluation, event and lifecycle
parity. Its verification-owned regression ceiling is below 620,000 bytes and
is coupled to compressed-size, production-Worker growth, interleaved baseline/
candidate Chromium initialization and unchanged initial-memory gates; see
`performance-capacity.md`.

The Rust integrator may replace the TypeScript numerical loop only after deterministic parity, numerical-tolerance, malformed-package, extreme-condition, lifecycle, and benchmark tests pass. JavaScript remains responsible for product state and rendering; batches will use a browser Worker.

## Generic sensor source-only boundary

The frozen generic radar, measurement, filtering, and association references
under `governance/generic-sensor-verification-sources/` are verification-source
locations only. This Stage-0 record executes no reference implementation,
transcribes no equation or coefficient, generates no vector, and changes no
tick. It does not supply detection or minimum range, RCS, antenna, power, loss,
noise, covariance, probability, false-alarm, clutter, scan, gate, assignment,
filter, CFAR, EW, or track behavior.

The CR-160557 record is negative-scope evidence only; no threshold model or
detection consequence is admitted from it. Rendered pages and extracted text
are non-authoritative navigation aids. Future numerical work remains blocked by
the exact frozen-source machine-verification gate, the manifest-bound non-legal
`RELEASE_OWNER_REVIEW`, an approved human
reference-execution decision,
an externally rooted detached attestation for that exact decision/evidence,
resolution of the exact signed evidence bytes through the pinned external
authority policy,
independent expected values, and its owning model/admission contracts. Source
availability never creates a generic or named production radar. Pinned NASA
public-use and Stone Soup open/MIT terms authorize redistribution of the exact
frozen records and declared derivatives only; that state admits no equation,
parameter, executable reference, adaptation, or runtime behavior.
