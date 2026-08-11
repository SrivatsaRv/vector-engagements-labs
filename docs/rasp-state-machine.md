# VECTOR RASP State Machine

VECTOR separates the engine's model truth from each side's estimated air picture. RASP controls never move a truth entity unless this document explicitly assigns an engine effect.

## Current state contract

| Input | Availability rule | Visible consequence | Engine consequence |
| --- | --- | --- | --- |
| Onboard radar | Own radar active and opposing aircraft within the 120 km educational sensor boundary | Opposing-aircraft track, status, uncertainty, age and identification | Can enable radar-supported Blue launch/support and create Red warning |
| Data link | Own tactical data link available | Injected off-board opposing-aircraft track | Can provide coarse track custody for launch/awareness when the selected posture permits it |
| Airborne early warning | Own tactical data link available | Higher-quality injected off-board opposing-aircraft track | Can provide early awareness; no AEW aircraft or sensor-volume entity is spawned yet |
| Visual contact | Opposing aircraft inside `min(18 km, selected visibility)` | Short-range visual track | Can authorize IR/EO close-range posture; it does not create radar mid-course support |
| Own radar active/silent | Gates onboard-radar source | Track present or `NO_TRACK` | Gates radar-supported BVR launch/support |
| Own data link available/unavailable | Gates data-link and AEW sources | Track present or `NO_TRACK` | Gates off-board custody before onboard lock |
| Opposing jammer on/off | Subtracts 17 points from VECTOR's track-quality index | Larger uncertainty and potentially degraded/coasting status | Can deny radar-supported mid-course support in the current educational state machine |
| Blue Team decision | Always available | Decision appears in run and report | Changes Blue aircraft maneuver and weapon-update cadence |
| Red Team decision | Always available | Decision appears in run and report | Scales Red aircraft maneuver demand |
| Blue intercept intent | Always available for A2A aircraft | Current phase appears in 3D state strip | Commands target-aware pure pursuit, lead pursuit, stern conversion, support hold or extension |
| Red tactical intent | Requires modeled awareness except unaware transit | Current phase appears in 3D state strip | Commands unaware transit, beam, defensive break, extension or recommit |
| Blue weapon posture | Always available | Weapon posture and lifecycle appear in run state | Gates radar-supported BVR, IR/EO close-range or hold-fire launch behavior |
| Track-information interruption | Event applied during a run | IAF track ages and its quality/uncertainty deteriorate | Blue weapon holds its last guidance command for the declared duration |

The current track-quality index is an educational VECTOR state variable. It is not detection probability, intelligence confidence, or a measured sensor-performance value.

## Source state transitions

```text
SOURCE SELECTED
  ├─ required entity absent ───────────────> NO_TRACK / NO_OBSERVED_ENTITY
  ├─ onboard radar + radar silent ─────────> NO_TRACK / RADAR_SILENT
  ├─ onboard radar + range > 120 km ───────> NO_TRACK / RADAR_OUT_OF_RANGE
  ├─ data link or AEW + link unavailable ──> NO_TRACK / DATALINK_UNAVAILABLE
  ├─ visual + beyond visibility boundary ──> NO_TRACK / BEYOND_VISUAL_RANGE
  └─ source available
       ├─ quality >= 60 ───────────────────> TRACKING
       ├─ quality >= 30 ───────────────────> DEGRADED
       └─ quality < 30 ────────────────────> COASTING
```

Interruption boundaries are half-open: the event is active at `start <= t < start + duration`. The exact end time returns to the source-derived state.

## Regression matrix

The automated matrix is generated in `tests/rasp-state-machine.test.mjs` and covers:

- 2 perspectives × 4 sources × 2 radar modes × 2 data-link states × 2 jammer states at far and near geometry;
- source dependency invariants for IAF and PAF independently;
- visual-acquisition boundaries immediately below, at and above selected visibility;
- radar boundary immediately below, at and above 120 km;
- interruption before, at start, during, at exact end and after the event;
- Blue intent, Red intent and weapon-posture combinations for deterministic, finite frames and declared motion/guidance effects;
- isolation: a side's radar and data link cannot change the other side's picture; only the opposing jammer may degrade it;
- causal boundary: picture controls alter truth only through declared launch/support/awareness rules, never through renderer state.

Any future sensor, AEW, IADS or electronic-warfare behavior must first add an explicit state transition here, then add a failing regression row, before adding a visible control.
