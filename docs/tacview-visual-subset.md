# VECTOR analysis-display visual subset

Status: mandatory product contract, version 0.2.

VECTOR implements a deliberately small Tacview-style analysis-display subset. “Tacview-style” means synchronized, time-addressable tracks with recognisable object silhouettes, altitude cues, sensor volumes, event markers, labels, and telemetry. It does **not** claim Tacview file compatibility, NATO APP-6 compliance, MIL-STD-2525 compliance, or reproduction of Tacview artwork.

## Entity marks

| Entity kind | Map and 3D mark | Appears when |
| --- | --- | --- |
| Aircraft | top-view aircraft silhouette plus affiliation frame | active in the world |
| Guided weapon | directional missile/dart silhouette | its launch lifecycle begins |
| Radar | antenna and radiating-arc glyph | declared as a scenario entity |
| Air-defence system | launcher and radar combination glyph | declared as a scenario entity |
| Surface launcher | launcher-vehicle glyph | declared as a scenario entity |
| Installation | affiliation-framed runway glyph and station label | public-reference station layer is enabled |
| Fixed objective | reticle and objective box | declared as a scenario entity |

Blue uses blue and a round frame; Red uses red and a diamond frame; neutral or unknown uses grey and a square frame. The inner silhouette communicates object kind. A label always carries callsign or designation, so color is never the only identity channel.

## Lifecycle

- **Stowed** is inventory and is not placed in the world.
- **Active** is a moving or fixed world entity.
- **Tracking** has a sensor-derived track or assigned target.
- **Engaging** is inside an active launch, guidance, or engagement phase.
- **Terminated** remains in replay history with reduced opacity and a termination mark.

A weapon therefore does not appear beside its aircraft before launch. At launch it becomes a new world entity at the launch platform’s recorded position and inherits the launch platform’s velocity.

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

## Information views

Model Truth uses the recorded engine position. IAF and PAF air-picture views replace only the observed opposing track with the selected side’s sensor-derived position and uncertainty. The truth state remains available as a separate view and is never blended into a RASP label.
