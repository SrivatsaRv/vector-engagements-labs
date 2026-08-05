#!/usr/bin/env bash
set -euo pipefail

stream="${1:-general}"
root="$(git rev-parse --show-toplevel)"
cd "$root"

case "$stream" in
  data) docs=(docs/README.md docs/engineering-principles.md docs/catalog-and-sources.md docs/engine-backends.md docs/scenario-builder.md pending-work/00-current-state-and-research.md pending-work/01-intended-use-and-credibility.md pending-work/02-a2a-model-pack-contract.md); paths=(lib/object-catalog.ts lib/simulation-models.ts lib/scenario-package.ts lib/scenario-draft.ts lib/engine/contracts.ts lib/engine/compiler.ts db/schema.ts db/migrations engine-rust/src tests);;
  geo) docs=(docs/README.md docs/engineering-principles.md docs/physics-model.md docs/vector-simulation-record.md docs/scenario-builder.md docs/catalog-and-sources.md pending-work/06-geospatial-and-synthetic-environment.md); paths=(lib/scenario-spatial.ts lib/study-areas.ts lib/vector-map.ts lib/map-layer-contracts.ts lib/engine engine-rust/src components tests);;
  browser) docs=(docs/README.md docs/engineering-principles.md docs/browser-engine-architecture.md docs/engine-backends.md docs/vector-simulation-record.md docs/performance-capacity.md docs/observability.md pending-work/07-browser-worker-and-recording.md); paths=(lib/engine lib/simulation.ts engine-rust/src scripts/benchmark-engine.ts components tests);;
  release) docs=(docs/README.md docs/repository-governance.md docs/cloudflare-architecture.md docs/performance-capacity.md docs/observability.md docs/security-boundaries.md pending-work/10-analysis-products-and-release-gate.md); paths=(.github Makefile Dockerfile* docker-compose*.yml scripts tests);;
  server) docs=(docs/README.md docs/engineering-principles.md docs/cloudflare-architecture.md docs/performance-capacity.md docs/observability.md pending-work/08-multi-entity-scale.md pending-work/10-analysis-products-and-release-gate.md); paths=(engine-rust db observability scripts tests);;
  ui) docs=(docs/README.md docs/scenario-builder.md docs/responsive-ui.md docs/tacview-visual-subset.md docs/vector-simulation-record.md); paths=(app components lib tests);;
  security) docs=(docs/README.md docs/security-boundaries.md docs/repository-governance.md docs/observability.md); paths=(app/api lib/security worker .github tests);;
  general) docs=(docs/README.md docs/engineering-principles.md pending-work/README.md); paths=(app components lib db engine-rust worker tests);;
  *) echo "unknown stream: $stream" >&2; exit 2;;
esac

echo "STREAM: $stream"
git status --short --branch
echo
echo "READ THESE FILES FIRST:"
printf '  %s\n' "${docs[@]}"
echo
echo "INSPECT THESE PATHS:"
printf '  %s\n' "${paths[@]}"
echo
echo "HEADINGS ONLY (use the listed files for focused context):"
for file in "${docs[@]}"; do
  if [[ -f "$file" ]]; then
    echo "--- $file"
    rg -n '^#{1,3} ' "$file" || true
  fi
done
