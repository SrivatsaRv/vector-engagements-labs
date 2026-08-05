# Simulation performance and capacity contract

This document defines how Vector Engagement Labs measures simulation performance and what a single x86-64 deployment must be able to handle. Every number below is a target until a reproducible benchmark record marks it as measured. A target must never be presented as an achieved result.

## Four independent clocks

VECTOR is an analysis simulator, not a first-person shooter. Network latency and display refresh must not determine the physics result.

| Clock | Responsibility |
| --- | --- |
| Model time | Advances the deterministic engine by a fixed simulation step. It is authoritative for physics, events, and termination. |
| Playback time | Controls pause, step, seek, and playback speed. It may run slower or faster than wall time. |
| Render time | Uses `requestAnimationFrame` to sample or interpolate recorded model frames. A skipped display frame must not alter the simulation. |
| Wall time | Measures queueing, execution, storage, and delivery latency. It is operational telemetry, never a physics input. |

An interactive run may calculate ahead and then play at 0.5x, 1x, 2x, or 4x. An offline variation batch advances as quickly as compute permits. Given the same validated scenario package, fixed step, seed, engine version, object-model versions, and coefficient hashes, replay identity must not depend on machine speed or display frame rate.

## Evidence labels

Performance records use only these labels:

- **Target:** an acceptance objective that has not yet been demonstrated on the named workload.
- **Measured:** a result with a committed benchmark definition and a complete environment record.
- **Regression gate:** a measured boundary enforced by automated verification on a controlled runner.

Every measured result records the CPU model and architecture, physical and logical core count, memory, operating system, browser or runtime, engine commit and backend, compiler flags, entity mix, fixed step, scenario duration, warm-up count, sample count, and scenario and object-model hashes.

The existing `performance:verify` command is an engine microbenchmark and TypeScript/Rust parity guard. It is not proof of browser rendering performance, multi-user capacity, database latency, or production throughput.

## North-star benchmark targets

| Area | Target | Required evidence |
| --- | --- | --- |
| Engine allocation | Zero heap allocations during the steady simulation tick | Allocation profile after initialization and entity spawn |
| Engine tick | 100 active entities updated within an 8 ms Worker budget | p50, p95, p99, and maximum tick time by entity mix |
| Visible UI frame | Main-thread rendering below 16.7 ms | Browser trace at supported desktop viewports |
| Simulation isolation | No database or network access during simulation | Architecture test and network trace |
| Catalog delivery | Cached catalog response below 30 ms p95 at the edge or origin cache | Warm-cache load test with cache-hit ratio |
| Map interaction | Above 55 visible FPS while panning, zooming, and rotating | Browser trace with representative tracks, labels, and coverage layers |
| Memory | Bounded trails, labels, sensor contacts, event history, and frame history | Long-run and high-entity memory plateau |
| Backend parity | Identical deterministic result hash for TypeScript and Rust reference runs | Cross-backend scenario corpus |

Proposed operational targets are a queue-wait p95 below 2 seconds under the nominal workload, no unbounded job, explicit cancellation within one scheduling interval, and less than 1 percent failed runs excluding invalid user input. These remain targets until the production workload is measured.

## Capacity workload for about 100 daily users

Daily users are not the same as simultaneous simulations. Initial sizing uses this conservative workload envelope:

- 100 distinct users during a day;
- 10 simultaneous interactive browser sessions;
- up to 100 active entities in one interactive scenario;
- 4 concurrent native server jobs for large runs or variation batches;
- a burst queue of 20 native jobs with bounded admission and cancellation;
- up to 30 minutes of model time per interactive run;
- recorded frames decimated or summarized according to the playback contract rather than retained without limit.

Interactive physics remains in a browser Worker by default. The server delivers the application, catalog, scenario packages, saved-run metadata, and reports. A native Rust worker handles explicitly selected large runs and variation batches. This split means 100 daily users do not imply 100 continuously occupied server cores.

This workload is a load-test definition, not a verified capacity claim. A candidate machine is accepted only after the complete test matrix passes on that machine.

## Single-machine capability profile

The initial self-hosted production machine should provide:

- x86-64 Linux with a current LTS kernel and container runtime;
- at least 8 modern physical CPU cores, with 16 hardware threads preferred;
- AVX2 and FMA support for optimized native numerical code;
- 32 GB ECC memory preferred, with 16 GB accepted only for a constrained proof of concept;
- at least 500 GB local NVMe, with 1 TB preferred for database growth, recordings, build artifacts, and operational headroom;
- sustained random I/O suitable for PostgreSQL and WAL rather than network-attached low-tier storage;
- a 1 Gbit/s network interface;
- independent encrypted backups or object storage;
- no GPU requirement for the initial engine and analysis UI.

Dedicated or predictably scheduled CPU is more important than a large advertised shared-vCPU count. Container limits reserve capacity for the operating system and web/API process, PostgreSQL/PostGIS, and native simulation workers. A starting allocation is one to two cores for the web and operating system, two cores for PostgreSQL, and the remaining cores for a bounded native-worker pool. Measurements, not this initial split, determine the final limits.

Running the complete stack on one machine provides native x86-64 PostgreSQL, local NVMe, no application-to-database network hop, a shared kernel page cache, controllable PostGIS memory, and fast native model compilation. It does not permit the simulation tick to query the database.

## Runtime boundaries

- The Rust `engine-core` remains the common implementation for native and WebAssembly execution.
- Browser execution is the default and continues when native batch compute is unavailable.
- Native jobs enter a bounded queue with concurrency limits, per-job time and memory limits, cancellation, and backpressure.
- The database stores catalog data, scenario packages, hashes, run metadata, and report indexes. It is never part of the model tick.
- Large immutable simulation records belong in bounded file or object storage. PostgreSQL stores their identity, checksum, and location.
- Cloudflare may remain the DNS, TLS, cache, and proxy layer for `labs.reachdefence.com`. It is not required to execute physics.
- The simulation backend is selected through the existing engine boundary, so browser TypeScript, browser Rust/WASM, and native Rust can be compared without changing scenario or frame consumers.

The first deployment remains a modular monolith. A distributed control plane is not required for this workload.

## Required performance test matrix

| Test | Purpose |
| --- | --- |
| Engine microbenchmark | Fixed-step cost, allocations, and TypeScript/Rust parity |
| 100-entity scenario | Tick budget, memory bounds, and lifecycle cost |
| Browser analysis view | Map and 3D FPS, frame time, labels, trails, and telemetry cost |
| Deterministic corpus | Identical hashes across repeats, machines, and supported backends |
| Four native jobs | CPU saturation, queue behavior, cancellation, and isolation |
| Ten interactive sessions plus burst queue | API, catalog, save, and report behavior under the nominal workload |
| Cache cold and warm | Catalog p50, p95, p99, and cache-hit ratio |
| 60-minute soak | Memory plateau, history bounds, file growth, and handle cleanup |
| Failure and recovery | Invalid packages, timeouts, worker crashes, database restart, and retry boundaries |

The load harness records model-time throughput, tick duration, allocation count, process RSS, CPU utilization, queue depth and wait, active and failed jobs, cancellation latency, visible dropped frames, database latency, cache hit ratio, and simulation-record bytes.

## Explicit non-claims

- The repository does not yet claim that one server has verified capacity for 100 daily users.
- The north-star targets are not achieved merely because a microbenchmark passes.
- Physics does not need a 60 Hz network or display loop.
- A slow display frame does not change the model result.
- Interactive browser users do not require server-side physics.
- Machine selection is not final until the candidate x86-64 host passes this contract's workload and soak tests.
