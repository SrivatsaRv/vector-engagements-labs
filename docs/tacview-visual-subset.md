# VECTOR analysis-display visual subset

Status: mandatory product contract, version 0.4.

VECTOR implements a deliberately small Tacview-style analysis-display subset. “Tacview-style” means synchronized, time-addressable tracks with recognisable object silhouettes, altitude cues, sensor volumes, event markers, labels, and telemetry. It does **not** claim Tacview file compatibility, NATO APP-6 compliance, MIL-STD-2525 compliance, or reproduction of Tacview artwork.

The display consumes a [`vector.record.v1`](vector-simulation-record.md) recording. It does not read mutable builder state and it does not own physics. An ACMI exporter is an interoperability adapter, not the internal record format.

## Silhouette source and attribution

VECTOR uses a curated subset of [Game Icons](https://game-icons.net/) under
CC BY 3.0. The build-time generator reads `@iconify-json/game-icons`, verifies
the approved icon names, and emits only the selected SVG bodies. The browser
does not download the full collection. The source icon and author remain in
the symbol registry and on the hosted symbol reference page.

The library supplies the inner silhouette. VECTOR supplies affiliation frame,
color, lifecycle, heading, label, altitude stem, trail, sensor coverage, and
engagement envelope. These meanings are governed by scenario and engine state.

## Entity marks

| Entity kind | Map and 3D mark | Appears when |
| --- | --- | --- |
| Fighter | jet-fighter silhouette plus affiliation frame | active in the world |
| Bomber | flying-wing silhouette | active in the world |
| Transport | transport-aircraft silhouette | active in the world |
| AEW&C | transport silhouette with a radome mark | active and contributing to the scenario |
| Tanker | transport silhouette with refuelling-boom mark | active and contributing to the scenario |
| Helicopter | rotary-wing silhouette | active in the world |
| UAV | uncrewed-aircraft silhouette | active in the world |
| Guided weapon | directional missile/dart silhouette | its launch lifecycle begins |
| Radar | antenna and radiating-arc glyph | declared as a scenario entity |
| Air-defence system | launcher and radar combination glyph | declared as a scenario entity |
| Surface launcher | launcher-vehicle glyph | declared as a scenario entity |
| Installation | affiliation-framed control-tower silhouette and station label | public-reference station layer is enabled |
| Fixed objective | objective-flag silhouette | declared as a scenario entity |

Blue uses blue and a round frame; Red uses red and a diamond frame; neutral or unknown uses grey and a square frame. The inner silhouette communicates object kind. A label always carries callsign or designation, so color is never the only identity channel.

## Typed presentation grammar

The shared `tactical-symbol-contract.ts` grammar is the presentation adapter
used by the engagement map, scenario-authoring map, entity legend and
3D-adjacent legend. It accepts an already canonical entity/frame value and
emits either an available display mark or an explicit unavailable mark. It
never accepts raw map coordinates, creates an entity, creates a track, or
derives an outcome.

The grammar carries affiliation, supported kind/role pair, lifecycle, optional
recorded heading, selection and one source state: `WORLD`, `OBSERVED_TRACK`,
`ESTIMATED`, or `UNSUPPORTED`. Unsupported source state, an incompatible
kind/role, an absent required orientation, and an absent designation each yield
an unavailable mark with a machine-readable reason. Stowed inventory remains
explicit but is not renderable as a world marker.

Label decluttering is deterministic and presentation-only: selected entity,
then engaging entity, then guided weapon, then aircraft, with stable entity ID
as the tie-breaker. The first label is visible, the next two are compact, and
the remainder are hidden until selection. The map then compares those label
boxes in its projected CSS-pixel surface: a lower-priority collision is hidden;
the selected marker keeps a full label and keyboard focus can select it. The
projection is a render-only input. This policy changes DOM visibility only; it
does not alter a frame, record, entity lifecycle or playback state.

MapLibre marks are created only after the map style is ready. If the basemap
transport is loading or unavailable, the surface reports that state and does
not claim that a map marker is present. The selection and unavailable grammar
remains independently testable in the entity legend and component contract;
tests must not require a MapLibre marker from a fixture that deliberately
aborts the tile transport.

Basemap choice uses the application transient Select, while layer, study-area,
aircraft-evidence, and weapon-evidence content uses persistent Disclosures.
Their open or closed state is presentation-only: it cannot select a canonical
frame, create an observation, change lifecycle, or mutate the VSR.

## Lifecycle

- **Stowed** is inventory and is not placed in the world.
- **Active** is a moving or fixed world entity.
- **Tracking** has a sensor-derived track or assigned target.
- **Engaging** is inside an active launch, guidance, or engagement phase.
- **Terminated** remains in replay history with reduced opacity and a termination mark.

A weapon therefore does not appear beside its aircraft before launch. At launch it becomes a new world entity at the launch platform’s recorded position and inherits the launch platform’s velocity.

The catalog owns `symbolRole`; the compiler copies it to the immutable engine
scenario; every engine frame preserves it. Map, 3D, legend, and report render
that same value. A known catalog object may not fall back to a generic dot.

## Geometry and time layers

- Declared routes are thin dashed lines.
- Recorded trajectories are solid lines and grow with playback time.
- Direction vectors extend from the current entity state.
- Launches are time-labelled circular event marks.
- The 3D surface adds ground projections, altitude stems, and altitude curtains.
- Detection, tracking, and engagement volumes have distinct colors and labels.
- A minimum-range limitation is a separate inner band, never implied by the engagement ring.
- Study-area boundaries are low-contrast dashed polygons.

Every layer is generated from the saved engine scenario or its recorded frames. No tactical layer may be painted from unrelated page state.
All playback surfaces consume the same selected recorded-frame identity; an
in-between scrub request cannot make the Map, 3D surface, telemetry, or visible
model time disagree about the displayed state.

The **Route transition** inspector consumes the immutable compiled route plan
and the selected aircraft frame's recorded `routePointIndex`. It shows the
active waypoint and its `FLY_BY` or `FLY_OVER` declaration, without advancing a
route or estimating a turn. A fly-by shows only its compiled capture radius. A
fly-over shows its pass-through semantics rather than an invented radius. A
persisted `vector.route-plan.v1` record explicitly states its all-fly-by legacy
semantics. Missing compiled route, control, point, or transition data is
unavailable; the presentation does not silently guess from positions.

The **Current geometry** inspector carries that same frame identity. When the
selected frame contains the launched primary weapon, its range, closure,
line-of-sight rate, speed, Mach, and flight state are the engine-recorded
weapon-to-target values. Before launch, it instead derives only the
aircraft-to-target range, closure, and line-of-sight rate from the
selected recorded aircraft states. Weapon speed, Mach, and flight state then
show **Not launched**; a missing target, launcher, or non-finite recorded value
shows an explicit unavailable state. The presentation layer never substitutes a
weapon aggregate, zero value, or decorative relative-position diagram.

## Information views

Model Truth uses the recorded engine position. IAF and PAF air-picture views replace only the observed opposing track with the selected side’s sensor-derived position and uncertainty. The truth state remains available as a separate view and is never blended into a RASP label.

The selection-driven **Selected track state** inspector consumes one
`pictures.jsonl` sample whose `modelTimeSeconds` exactly matches the selected
display frame. An observer-state v3 sample lists every retained opaque track
with its independent lifecycle, freshness and uncertainty; it never selects
the first track as a side-wide summary. It also shows the observer-picture
owner, scan state and retained/visible counts. If the sample is absent
or it has no admitted visible position, the inspector states that condition and
does not invent a position, confidence, or zero uncertainty. Its IAF/PAF
selector changes browser presentation only; it cannot change a run or record.

This first inspector intentionally does not render radar volumes, seeker state,
weapon support, or inferred observations. Those require the remaining #26 and
#28 contracts.

## Situation Log contract

The Observe workspace reserves an edge-panel **Situation Log** for concise,
time-addressed operational messages. It is distinct from diagnostic telemetry,
model provenance, compiler admission, and Explain inspectors. A Situation Log
message is a presentation projection from one authoritative
`vector.simulation-event.v2` event at the selected observer boundary; it is not
itself simulation truth and it may not mutate playback or engine state.

The canonical event carries identities, exact committed model-time frame,
versioned typed payload, lifecycle phase, canonical participants, and causal
references. The presentation
adapter owns wording, severity, grouping, icon, filtering, and localization.
This split permits one simulation event to produce different messages for Model
Truth, IAF, or PAF only when the selected view is allowed to know it. A hidden
truth event must not leak through a message, count, search result, or tooltip.

The current engine foundation produces only run and entity-lifecycle events.
The Situation Log UI, observer-safe message projection, sensor/track messages,
launch/guidance/support messages, selection/scrub interaction, and dense-log
performance remain follow-up #41 slices gated by their owning #26, #28, and #38
contracts. Until those slices land, the product must show an explicit
unavailable or empty state rather than synthesize a combat narrative from
frames.
