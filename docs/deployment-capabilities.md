# Deployment capability admission

Status: #67 is in progress. Domain admission and deployment-only backend
selection are implemented. Structured diagnostics, stale-manifest recovery, and
future subsystem admission remain open.

`config/deployment-capabilities.json` is the deployment-owned source for the
domain, engine, model-pack and optional-capability admission boundary. The build
embeds it in the application. `lib/runtime/deployment-capabilities.ts` validates
the closed enums, required explanations, current model-pack identity and selected
engine, then derives the canonical SHA-256 digest.

The production scenario contract does not contain an engine choice. A scenario
that supplies `engineBackend` is rejected with `SCENARIO_ENGINE_FORBIDDEN`.
The compiler and browser Worker receive the validated manifest once and use its
engine identity. The VSR records the complete manifest in `compiled.json` and
binds its schema and digest in `manifest.json`.

## Worker admission boundary

The browser Worker re-hashes the complete structured-cloned capability manifest
inside every compiled model-pack adapter before it stores the adapter. It also
requires that verified digest to equal the deployment manifest embedded in that
Worker. A stale, modified, or different-deployment manifest receives the stable
`capability-manifest-stale` protocol failure and cannot reach engine execution.
The failure contains no scenario payload or environment configuration.

The browser client constructs the simulation Worker with the bundler-recognized
module-Worker expression. The production build emits a same-origin JavaScript
asset rather than serving the source TypeScript file as media. A normal admitted
browser run is therefore a regression check on both manifest admission and
production Worker loading.

This check is an admission guard, not a complete structured-diagnostics system:
it does not yet emit correlated compile, persistence, replay, cancellation, or
recovery events, and it does not introduce a logging sink. Those #67 acceptance
criteria remain open.

## Current admitted surface

- A2A plus Tactical Intercept, Combat Air Patrol, Fighter Sweep, Escort and the
  `AIRBORNE`, `PARKING`, `RUNWAY`, and `GROUND_ALERT_QRA` start postures are
  admitted through `vector.air-mission.v1`. A ground start still requires an
  exact installation/source identity and content-addressed runway evidence;
  the capability list is not permission to invent either.
- A2G, G2A and G2G are disabled by deployment. Their library entries remain
  visible as future study material, but they have no Run link.
- A disabled or unknown direct link shows an unavailable state. It never opens
  the default A2A scenario.
- TypeScript is the selected production engine for the current Cloudflare
  deployment. Rust/WASM remains independently executable for parity verification
  and can replace TypeScript only through a reviewed manifest change after its
  server packaging is admitted.
- Production sensors are `UNSUPPORTED_BY_MODEL_PACK`; deployed runs emit
  `SENSOR_MODEL_UNAVAILABLE` and cannot synthesize a track. A source-authored
  generic Observation → TrackStore fixture exists only under
  `ENGINE_VERIFICATION_ONLY`. The production Worker rejects its distinct
  capability manifest and model-pack digest. No radar-jamming measurement
  effect is admitted. Data link, AEW, EW, and terrain interaction remain
  disabled and cannot inject a track or support state.
- Mission emission/weapon/completion/abort/recovery policy is authored,
  compiled, and recorded. Autonomous virtual-pilot policy execution remains
  outside this deployment; the product still exposes no decorative
  defensive-turn, g-demand, or team-decision controls. Authored route following,
  ground/airborne entry, fuel, and installed stores remain the current motion
  and mass authorities.
- The compiler ignores legacy tactical-decision fields and uses only the
  versioned weapon model's guidance parameters. This prevents a label from
  changing a run while the virtual-pilot contract is unavailable.
- Capability-filtered aircraft and weapon identities are presented through the
  shared application Select. That presentation preserves an unavailable
  authored identity for correction and never substitutes the first admitted
  option; it does not broaden or recompute deployment admission.

## Change and rollback

1. Edit `config/deployment-capabilities.json`. Use only declared enum values and
   an exact admitted model-pack digest.
2. Run `npm run typecheck`, `npm run test:component`, `npm run test:browser`, and
   `make ci-local`.
3. Build a new immutable image. The configuration is not changed inside a
   running image.
4. Read the VSR manifest or diagnostics surface to confirm the admitted digest.
5. Roll back by promoting the prior immutable image. Do not edit a running
   container or use an unrecorded environment override.

Ticks do not read files, environment variables, databases or networks. A future
service-side configuration loader must produce this same manifest and digest;
it must not add a second capability authority.
