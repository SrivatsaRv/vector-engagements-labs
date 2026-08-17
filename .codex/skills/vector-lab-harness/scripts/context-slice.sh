#!/usr/bin/env bash
set -euo pipefail

stream="${1:-general}"
root="$(git rev-parse --show-toplevel)"
cd "$root"

case "$stream" in
  data) issues=(31 27); docs=(docs/README.md docs/engineering-principles.md docs/catalog-and-sources.md docs/model-pack-contract.md docs/engine-backends.md docs/scenario-builder.md); paths=(lib/object-catalog.ts lib/simulation-models.ts lib/scenario-package.ts lib/scenario-draft.ts lib/engine/contracts.ts lib/engine/compiler.ts db/schema.ts db/migrations engine-rust/src tests);;
  physics) issues=(64 28); docs=(docs/README.md docs/engineering-principles.md docs/model-pack-contract.md docs/physics-model.md docs/engine-backends.md docs/vector-simulation-record.md); paths=(lib/engine lib/simulation.ts engine-rust/src tests);;
  information) issues=(26); docs=(docs/README.md docs/rasp-state-machine.md docs/physics-model.md docs/scenario-builder.md docs/vector-simulation-record.md); paths=(lib/engine lib/simulation.ts components tests);;
  geo) issues=(61 29); docs=(docs/README.md docs/engineering-principles.md docs/physics-model.md docs/geospatial-environment.md docs/vector-simulation-record.md docs/scenario-builder.md docs/catalog-and-sources.md); paths=(lib/scenario-spatial.ts lib/study-areas.ts lib/vector-map.ts lib/map-layer-contracts.ts lib/engine engine-rust/src components tests);;
  browser) issues=(34); docs=(docs/README.md docs/engineering-principles.md docs/browser-engine-architecture.md docs/engine-backends.md docs/vector-simulation-record.md docs/performance-capacity.md docs/observability.md); paths=(lib/engine lib/simulation.ts engine-rust/src scripts/benchmark-engine.ts components tests);;
  behavior) issues=(38 64); docs=(docs/README.md docs/scenario-builder.md docs/rasp-state-machine.md docs/physics-model.md docs/vector-simulation-record.md); paths=(lib/engine lib/scenario-package.ts lib/scenario-draft.ts components tests);;
  mission) issues=(60); docs=(docs/README.md docs/engineering-principles.md docs/scenario-builder.md docs/geospatial-environment.md docs/vector-simulation-record.md docs/catalog-and-sources.md); paths=(lib/scenario-package.ts lib/scenario-draft.ts lib/scenario-validation.ts lib/study-areas.ts lib/security/saved-run.ts app/lab components tests);;
  visualization) issues=(41); docs=(docs/README.md docs/scenario-builder.md docs/responsive-ui.md docs/tacview-visual-subset.md docs/vector-simulation-record.md docs/regression-matrix.md); paths=(app components lib tests);;
  release) issues=(47 39 32); docs=(docs/README.md docs/repository-governance.md docs/cloudflare-architecture.md docs/performance-capacity.md docs/observability.md docs/security-boundaries.md); paths=(.github Makefile Dockerfile* docker-compose*.yml scripts tests);;
  server) issues=(25 32); docs=(docs/README.md docs/engineering-principles.md docs/cloudflare-architecture.md docs/performance-capacity.md docs/observability.md); paths=(engine-rust db observability scripts tests);;
  ui) issues=(40 41); docs=(docs/README.md docs/scenario-builder.md docs/responsive-ui.md docs/tacview-visual-subset.md docs/vector-simulation-record.md); paths=(app components lib tests);;
  security) issues=(31 32); docs=(docs/README.md docs/security-boundaries.md docs/repository-governance.md docs/observability.md); paths=(app/api lib/security worker .github tests);;
  general) issues=(47); docs=(docs/README.md docs/engineering-principles.md); paths=(app components lib db engine-rust worker tests);;
  *) echo "unknown stream: $stream" >&2; exit 2;;
esac

echo "STREAM: $stream"
git status --short --branch
echo
echo "OWNING GITHUB ISSUES:"
printf '  https://github.com/SrivatsaRv/vector-engagements-labs/issues/%s\n' "${issues[@]}"
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
