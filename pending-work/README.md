# A2A simulation research backlog

Status: proposed work, ordered by dependency.

VECTOR currently serves A2A, A2G, G2A, and G2G studies. This backlog focuses on A2A first because it exercises the reusable foundations needed by the other three families: flight dynamics, guided weapons, sensing, track state, geodesy, recording, analysis, and scale.

The north star is a deterministic engagement-analysis system that runs entirely in a modern browser. The application may download immutable model and terrain packages, but a normal single run must not require a server-side physics process.

## Causal order

| Order | Work item | Why it comes here |
| --- | --- | --- |
| 0 | [Current state and research findings](00-current-state-and-research.md) | Establishes what exists, what is approximate, and what the research supports. |
| 1 | [Intended use and credibility contract](01-intended-use-and-credibility.md) | A model cannot be called accurate without a stated question, operating envelope, and validation target. |
| 2 | [Compiled A2A model-pack contract](02-a2a-model-pack-contract.md) | Defines the data the engine can execute and the evidence attached to it. |
| 3 | [Reference aircraft flight model](03-reference-aircraft-flight-model.md) | Proves one aircraft can be integrated and verified before adding a fleet. |
| 4 | [Guided-weapon fly-out model](04-guided-weapon-flyout-model.md) | Adds launch, guidance, energy, closest approach, and termination on top of verified motion. |
| 5 | [Sensors, tracks, datalinks, and decisions](05-sensors-tracks-and-decisions.md) | Makes the two air pictures consequences of simulated systems instead of display controls. |
| 6 | [Geospatial and synthetic-environment contract](06-geospatial-and-synthetic-environment.md) | Makes location, altitude, terrain, line of sight, weather, and map playback consistent. |
| 7 | [Browser worker and simulation record](07-browser-worker-and-recording.md) | Moves compute away from interaction rendering and creates one lossless replay contract. |
| 8 | [Multi-entity scale path](08-multi-entity-scale.md) | Adds multi-rate scheduling, spatial filtering, batched rendering, and real load tests. |
| 9 | [ACMI interoperability and debrief](09-acmi-and-debrief.md) | Adds exchange and debrief only after VECTOR has a stable native record. |
| 10 | [A2A analysis products and release gate](10-analysis-products-and-release-gate.md) | Exposes useful outcomes and blocks unsupported claims before release. |

## Delivery rule

Each work item must land as an end-to-end slice with its contract, implementation, fixtures, documentation, and performance or correctness evidence. A later item may start as a research spike, but it must not become a second runtime contract.

## Fidelity rule

There is no universal "perfect object." A model is credible only for a declared intended use and tested operating envelope. VECTOR should describe exactly what a result supports, then show the evidence and limits beside that result.
