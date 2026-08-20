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

## Current admitted surface

- A2A and the `TACTICAL_INTERCEPT` / `AIRBORNE` foundation are enabled.
- A2G, G2A and G2G are disabled by deployment. Their library entries remain
  visible as future study material, but they have no Run link.
- A disabled or unknown direct link shows an unavailable state. It never opens
  the default A2A scenario.
- TypeScript is the selected production engine for the current Cloudflare
  deployment. Rust/WASM remains independently executable for parity verification
  and can replace TypeScript only through a reviewed manifest change after its
  server packaging is admitted.
- The bounded TypeScript SensorState → Observation → TrackState model and its
  compatible radar-jamming measurement effect are admitted. Saved records carry
  observer pictures. Data link and AEW remain disabled because no admitted
  sender-side observation/message path exists; they fail closed rather than
  injecting a track. Terrain interaction remains disabled.
- Tactical policy is not admitted. The product does not expose defensive-turn,
  g-demand, or team-decision controls; authored route following remains the
  admitted aircraft-motion authority.
- The compiler ignores legacy tactical-decision fields and uses only the
  versioned weapon model's guidance parameters. This prevents a label from
  changing a run while the virtual-pilot contract is unavailable.

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
