# Changelog

All notable changes will be documented here. The project follows Semantic Versioning and uses Keep a Changelog categories.

## Unreleased

### Added

- Governed North Punjab, Ladakh, Rajasthan, North East, Arabian Sea, and coastal
  Gujarat study-area selection backed by forward-only catalog data.
- An immutable catalog-credibility gate and a public NASA F-16 reference
  trajectory with TypeScript/Rust-WASM parity evidence and visible math-panel
  results.
- A non-root, multi-architecture production image release path with immutable
  GHCR tags, digest promotion, SBOM/provenance attestation, and Compose image
  verification.
- Versioned intended-use and credibility manifests, unit-bearing aircraft,
  weapon, sensor, propulsion, aerodynamic, loadout, and compatibility source
  schemas, plus deterministic immutable SI model-pack compilation shared by
  TypeScript and Rust.
- Scenario-local model patches with old/new values, SI units, reason,
  timestamp, author, evidence, and compiled-pack digest provenance.
- Forward-only persistence for intended uses, model-pack sources, compiled
  packs, and credibility manifests.
- Typed Rust engine states, structured admission errors, bounded WASM ABI v1,
  strict Rustfmt/Clippy/rustdoc gates, and native edge-condition coverage.
- Public repository governance, Apache-2.0 licensing, contributor guidance, security policy, CI, release automation, and guarded Cloudflare deployment workflow.
- Engineering principles for the open-source simulation-library boundary, SOLID design, twelve-factor operation, and release evidence.

### Changed

- Docker Compose now runs self-contained production, migration, and local-seed
  bundles from one `VECTOR_IMAGE`; database and telemetry values are supplied
  only at runtime and Docker Hub is not implied or configured.
- Scenario packages advance to `vector.scenario.v3` and saved runs now bind the
  intended-use identity and exact compiled model-pack digest. Unknown objects,
  missing coefficients, incompatible stores, and unsupported combinations fail
  closed instead of receiving generic fallback coefficients.
- Phone and tablet layouts now keep landing content, 3D replay controls,
  tactical labels, playback, and telemetry within the viewport. The responsive
  validation suite covers 320-pixel phones through 4K displays.
- Public landing copy now describes the user task directly: pick a scenario,
  change it, run it, and review the result.
- Rust release builds now retain overflow checks and publish explicit compute
  safety limits without changing valid scenario or replay contracts.
- Authoring and playback maps now package and load MapLibre's module worker
  from a verified same-origin production path.
- Product name standardized as Vector Engagement Labs.
- Codex Sites packaging and repository binding removed.
