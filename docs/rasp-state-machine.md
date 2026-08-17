# VECTOR RASP State Machine

VECTOR separates the engine's model truth from each side's estimated air picture. RASP controls never move a truth entity unless this document explicitly assigns an engine effect.

## Current state contract

| Input | Availability rule | Visible consequence | Engine consequence |
| --- | --- | --- | --- |
| Onboard radar | Own radar active and opposing aircraft within the 120 km educational sensor boundary | Opposing-aircraft track, status, uncertainty, age and identification | None |
| Data link | Own tactical data link available | Injected off-board opposing-aircraft track | None; weapon-update cadence is a separate Blue Team decision |
| Airborne early warning | Own tactical data link available | Higher-quality injected off-board opposing-aircraft track | None; no AEW aircraft or sensor entity is spawned yet |
| Visual contact | Opposing aircraft inside `min(18 km, selected visibility)` | Short-range visual track | None |
| Own radar active/silent | Gates only an onboard-radar source | Track present or `NO_TRACK` | None |
| Own data link available/unavailable | Gates data-link and AEW sources | Track present or `NO_TRACK` | None |
| Opposing jammer on/off | Subtracts 17 points from VECTOR's track-quality index | Larger uncertainty and potentially degraded/coasting status | None |
| Blue Team decision | Always available | Decision appears in run and report | Changes Blue aircraft maneuver and weapon-update cadence |
| Red Team decision | Always available | Decision appears in run and report | Scales Red aircraft maneuver demand |

The current track-quality index is an educational VECTOR state variable. It is not detection probability, intelligence confidence, or a measured sensor-performance value.

The workbench does not provide a track-interruption control. The engine does not
accept a guidance-hold event. A future update-loss study must use the typed
observation, track, and weapon-support contracts owned by issues #26 and #28.

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

## Regression matrix

The automated matrix is generated in `tests/rasp-state-machine.test.mjs` and covers:

- 2 perspectives × 4 sources × 2 radar modes × 2 data-link states × 2 jammer states at far and near geometry;
- source dependency invariants for IAF and PAF independently;
- visual-acquisition boundaries immediately below, at and above selected visibility;
- radar boundary immediately below, at and above 120 km;
- 5 Blue decisions × 4 Red decisions for deterministic, finite frames and declared motion/guidance effects;
- isolation: a side's radar and data link cannot change the other side's picture; only the opposing jammer may degrade it;
- truth invariance: RASP-only controls cannot move model-truth entities or alter the engagement outcome.

Any future sensor, AEW, IADS or electronic-warfare behavior must first add an explicit state transition here, then add a failing regression row, before adding a visible control.
