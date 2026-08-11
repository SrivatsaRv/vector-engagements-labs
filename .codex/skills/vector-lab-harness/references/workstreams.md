# Workstream routing

| Stream | Owning issues | Owns | Read first | Depends on |
|---|---|---|---|---|---|
| data | #31, #27 | intended use, credibility, model-pack schemas, catalog compatibility, migrations | `docs/catalog-and-sources.md`, `docs/model-pack-contract.md`, `docs/engine-backends.md` | current integration branch |
| physics | #33, #28 | object dynamics, guidance, control, weapon fly-out, numerical validation and parity | `docs/physics-model.md`, `docs/model-pack-contract.md`, `docs/engine-backends.md` | executable model-pack and geospatial primitives |
| information | #26 | observations, sensors, tracks, datalinks, uncertainty and side-owned state | `docs/rasp-state-machine.md`, `docs/physics-model.md`, `docs/vector-simulation-record.md` | stable object and weapon state |
| geo | #29 | frames, datums, synthetic environment, weather/terrain/LOS interfaces | `docs/geospatial-environment.md`, `docs/physics-model.md`, `docs/vector-simulation-record.md` | stable entity/sensor contracts |
| browser | #34 | simulation Worker, fixed-step boundary, transferable buffers and VSR | `docs/browser-engine-architecture.md`, `docs/engine-backends.md`, `docs/vector-simulation-record.md` | compiled scenario/model contracts |
| behavior | #38 | missions, tasks, pursuit/defence policies and bounded control commands | `docs/scenario-builder.md`, `docs/rasp-state-machine.md`, `docs/physics-model.md` | side-owned information and dynamics contracts |
| visualization | #41 | canonical 2D/3D/timeline/replay presentation and causal acceptance | `docs/tacview-visual-subset.md`, `docs/vector-simulation-record.md`, `docs/responsive-ui.md` | dynamics, information and behavior runtime |
| release | #47, #39, #32 | integration, image/tag policy, release gates and grouped validation | `docs/repository-governance.md`, `docs/cloudflare-architecture.md`, `docs/performance-capacity.md` | merged feature PRs |
| server | #25, #32 | bounded queue, PostGIS/observability/backup topology and scale harness | `docs/performance-capacity.md`, `docs/observability.md` | browser engine interface |
| ui | #40, #41 | scenario workspace, maps, playback, reports and responsive behavior | `docs/scenario-builder.md`, `docs/responsive-ui.md`, `docs/tacview-visual-subset.md` | versioned domain contracts |
| security | #31, #32 | API admission, saved-run integrity, metrics, caching and delivery trust | `docs/security-boundaries.md`, `docs/repository-governance.md`, `docs/observability.md` | affected service contract |

For `general`, read `docs/README.md`, `docs/engineering-principles.md`, and epic #47, then route to a narrower stream before editing.

Create a dedicated branch/worktree from the protected integration branch declared by the owning issue. Use `origin/main` when no active release train is declared. Do not modify another stream's worktree.
