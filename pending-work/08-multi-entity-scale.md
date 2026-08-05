# Work item 08: Multi-entity scale path

Priority: P1

Depends on: Worker runtime, compiled model packs, deterministic pipeline, and recording contract

Blocks: formations, AEW support, air-defence networks, and 100-entity scenarios

## Outcome

VECTOR can declare, simulate, observe, and record 100 meaningful world entities without changing simulation semantics or blocking the UI. The scale limit is published from repeatable measurements, not intuition.

## Scaling model

### Mixed fidelity

- Selected aircraft use verified 6DOF where handling matters.
- Tactical supporting aircraft use an energy-maneuver 3DOF model.
- Distant or scripted traffic uses authored trajectories.
- Guided weapons use their own 3DOF or 5DOF fly-out.
- Static sensors, bases, and objectives do not run aircraft dynamics.

Fidelity is explicit per entity and can be promoted without changing identity or record fields.

### Multi-rate scheduler

Initial frequencies must be convergence-tested, then configured by system:

- flight dynamics: 60 to 120 Hz for selected 6DOF aircraft;
- weapon fly-out: 50 to 100 Hz;
- background 3DOF: 20 to 50 Hz;
- sensor scan and measurement: declared radar cadence;
- track filtering: measurement or prediction cadence;
- tactical decisions: approximately 2 to 10 Hz;
- recording: class and field specific;
- rendering: display refresh with interpolation.

These are starting bands, not universal constants.

### Data-oriented world

- structure-of-arrays state in WASM memory;
- stable integer IDs with generation counters;
- no per-tick object graphs, strings, or unit conversion;
- preallocated command, event, and snapshot buffers;
- deterministic sorted event commit;
- bounded history and telemetry decimation.

### Spatial filtering

100 entities create 9,900 possible directed pairs. Use a uniform grid, spatial hash, R-tree, or equivalent broad phase to build candidate sets before sensor, collision, and targeting calculations. Always retain a brute-force reference path for small deterministic verification cases.

### Rendering

- GPU symbol or custom WebGL layer for MapLibre;
- Three.js `InstancedMesh` or equivalent batches by silhouette/material class;
- dynamic shared line buffers for trails and routes;
- label collision, priority, and distance culling;
- bounded or level-of-detail trail history;
- no DOM marker per active entity at target scale.

[Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) is designed to reduce draw calls for repeated geometry. [Tacview 2's public architecture notes](https://www.tacview.net/product/tacview2/en/) also identify terrain updates and trails as major large-recording bottlenecks, reinforcing that visualization must be profiled beside physics.

## Scale matrix

Run identical deterministic families at:

- 1, 10, 25, 50, 100, 250, and 500 entities;
- 0, 1, 10, and 100 active weapons;
- sparse and dense sensor overlap;
- 1x, 4x, 10x, and unbounded batch execution;
- desktop, reference laptop, representative phone, and a low-power integrated-GPU device.

Measure:

- physics-step p50, p95, and p99;
- missed model deadlines;
- Worker-to-view snapshot latency;
- main-thread long tasks;
- bytes transferred per second;
- allocations and heap growth;
- record bytes per model minute;
- map and 3D frame time, draw calls, and visible labels;
- deterministic digest consistency;
- first-interaction and run-start latency.

## Initial budget

For the reference laptop, p95 simulation work should use no more than half of the selected fixed-tick budget. At 120 Hz that is approximately 4 ms. This is a proposed engineering budget, not a current measured result. Device-specific supported limits must come from the scale matrix.

## Acceptance criteria

- The 100-entity reference scenario completes at real time on the reference laptop with no missed model deadlines at p95.
- Map and 3D remain interactive while the simulation Worker runs.
- Sensor candidate checks grow with local density rather than blindly evaluating every pair.
- Record size follows the declared sampling policy and remains bounded.
- Results are identical between brute-force and spatially filtered paths for the verification corpus.
- A device that cannot sustain the requested fidelity receives an explicit validation error or governed fidelity plan, never silent time-step stretching.

## Tests

- Dense, sparse, crossing, formation, launch-salvo, and sensor-network scenarios.
- Entity spawn, termination, ID reuse, and reference-integrity stress.
- Spatial-index versus brute-force equivalence.
- Long-run memory plateau and buffer reuse.
- Rendering with labels and trails separately enabled to isolate bottlenecks.
- Independent Monte Carlo Worker-pool throughput and cancellation.

## Non-goals

- Premature internal multithreading of one world.
- WebGPU compute before CPU and transfer profiling identifies a real need.
- Claiming 100 detailed 6DOF aircraft if the tested configuration uses mixed fidelity.
