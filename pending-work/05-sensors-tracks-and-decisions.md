# Work item 05: Sensors, tracks, datalinks, and decisions

Priority: P0

Depends on: aircraft and weapon state contracts

Blocks: genuine IAF/PAF air pictures and BVR analysis

## Outcome

Model Truth, sensor observations, track stores, tactical decisions, and presentation become separate typed states. IAF and PAF views are generated from simulated observing systems and communication paths.

## Current gap

The existing RASP controls produce an estimated display track from a formula. Onboard radar, datalink, airborne early warning, visual contact, jammer state, and several decisions do not consistently affect the physical engagement. An airborne early-warning source can exist without an AEW aircraft or sensor entity. This is useful UI scaffolding but not yet a simulated air picture.

## Required state machine

```text
TRUTH ENTITY
  -> SENSOR SEARCH VOLUME
  -> MEASUREMENT OR NO MEASUREMENT
  -> PLOT
  -> TENTATIVE TRACK
  -> CONFIRMED TRACK
  -> CLASSIFIED / IDENTIFIED
  -> FIRE-CONTROL QUALITY
  -> COASTING
  -> DROPPED
```

Each side owns its own observation and track store. A datalink message carries a track estimate, timestamp, source, covariance or uncertainty representation, classification, and identity state. It never grants direct access to the truth entity.

## Sensor model progression

### Stage 1: geometry and scan state

- field of regard and scan sector;
- range and altitude geometry;
- update rate and dwell schedule;
- emission mode;
- line of sight;
- deterministic detection threshold for a declared reference target.

### Stage 2: measurement and track processing

- measurement error and timestamp;
- association and track initiation;
- filter prediction and update;
- track age, covariance, confirmation, coasting, and drop;
- identification and classification rules.

### Stage 3: environment and contest

- target signature by aspect and configuration;
- clutter and look-up/look-down context;
- jammer and countermeasure effects;
- communication delay, loss, and source conflict;
- terrain masking from the geospatial work item.

Sensor coverage on the map must identify which stage produced it. A declared educational volume remains visibly distinct from a computed line-of-sight or detection volume.

## Decision interface

Behavior code receives only the side's track store, aircraft state available to that side, mission objective, inventory, and doctrine. It emits bounded commands:

- continue or change flight path;
- search or change emission mode;
- support a weapon;
- turn for position;
- defend;
- employ jammer or countermeasure;
- disengage;
- request or share a track.

The flight-control and guidance systems decide what is physically achievable. A UI decision cannot teleport heading or directly write engine position.

Behavior trees are a practical deterministic first implementation. Later rule engines, scripted agents, or learned policies must use the same observation and action interface.

## Useful A2A information outcomes

- first detection, first confirmed track, first identification, and first fire-control-quality time;
- track source, age, uncertainty, conflict, loss, and reacquisition timeline;
- ownship emissions and exposure time;
- datalink latency, interruption, and source path;
- first valid launch opportunity and reason it opened or closed;
- weapon support duration and terminal acquisition;
- the difference between Model Truth and what each side knew at every decision.

## Acceptance criteria

- No RASP view can access an opposing truth position except through an observation function.
- Onboard radar requires a sensor entity, emission state, scan geometry, line of sight, and update opportunity.
- Airborne early warning requires an AEW sensor source and a valid communication path.
- Visual contact uses distance, field of regard, lighting or visibility policy, and an explicit identification rule.
- Datalink loss affects received tracks and weapon support only through declared links.
- Every decision records its observation input, selected action, and physical command result.
- The report explains confidence as a track-state quantity with units or calibration, not a generic percentage.

## Regression matrix

The matrix must cover at least:

- active versus silent radar;
- in-volume versus out-of-volume target;
- line of sight versus terrain blocked;
- datalink available, delayed, interrupted, and unavailable;
- AEW present versus absent;
- visual inside versus outside the weather/geometry limit;
- jammer off versus on at ineffective and effective geometry;
- track confirmation, coasting, reacquisition, and drop;
- conflicting onboard and off-board tracks;
- every Blue and Red decision at each valid track state;
- weapon support continued, reduced, interrupted, and terminated.

Each case asserts state transition, timestamp, map/3D presentation, telemetry, event log, report copy, and deterministic replay.

## References

- [BVR Gym](https://arxiv.org/abs/2403.17533)
- [IEEE DIS protocol families](https://standards.ieee.org/ieee/1278.1/10646/)
- [USAF Distributed Mission Operations Center](https://www.kirtland.af.mil/Units/Distributed-Mission-Operations-Center/)
