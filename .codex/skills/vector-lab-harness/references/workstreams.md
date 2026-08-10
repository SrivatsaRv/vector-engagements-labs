# Workstream routing

| Stream | Branch | Worktree | Owns | Read first | Depends on |
|---|---|---|---|---|---|
| data | `feat/runtime/object-model-packs` | `/Users/one2n/.codex/worktrees/0ba8/vector-lab` | intended-use, credibility, entity/model-pack schemas, catalog compatibility, Drizzle migrations | `docs/catalog-and-sources.md`, `docs/engine-backends.md`, `pending-work/01-intended-use-and-credibility.md`, `pending-work/02-a2a-model-pack-contract.md` | current release branch |
| geo | `feat/runtime/geospatial-environment` | `/Users/one2n/.codex/worktrees/0fad/vector-lab` | WGS84/ECEF/local frames, datums, synthetic environment, weather/terrain/LOS interfaces | `docs/physics-model.md`, `docs/vector-simulation-record.md`, `pending-work/06-geospatial-and-synthetic-environment.md` | stable entity/sensor contracts |
| browser | `feat/runtime/browser-worker` | `/Users/one2n/.codex/worktrees/37aa/vector-lab` | dedicated simulation Worker, fixed-step boundary, transferable buffers, VECTOR Simulation Record | `docs/browser-engine-architecture.md`, `docs/engine-backends.md`, `docs/vector-simulation-record.md`, `pending-work/07-browser-worker-and-recording.md` | compiled scenario/model contracts |
| release | `release/x86-runtime` | `/Users/one2n/vector-lab-worktrees/release-x86-runtime` | integration, x86 image/tag policy, release gates, grouped validation | `docs/repository-governance.md`, `docs/cloudflare-architecture.md`, `docs/performance-capacity.md` | merged feature PRs |
| server | `feat/platform/x86-runtime` | create only when assigned | native Rust worker, bounded queue, PostGIS/observability/backup topology, 100-user load harness | `docs/performance-capacity.md`, `docs/observability.md`, `pending-work/10-analysis-products-and-release-gate.md` | browser engine interface |
| ui | feature branch assigned per task | current task worktree | scenario builder, maps, playback, reports, responsive behavior | `docs/scenario-builder.md`, `docs/responsive-ui.md`, `docs/tacview-visual-subset.md` | versioned domain contracts |
| security | feature branch assigned per task | current task worktree | API admission, saved-run integrity, metrics, caching, delivery trust | `docs/security-boundaries.md`, `docs/repository-governance.md`, `docs/observability.md` | affected service contract |

For `general`, read `docs/README.md`, `docs/engineering-principles.md`, `pending-work/README.md`, then route to a narrower stream before editing.

All feature branches start from `origin/release/x86-runtime` and open PRs against that branch. Do not modify another stream's worktree.
