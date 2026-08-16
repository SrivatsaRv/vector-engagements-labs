# Deployment capability admission

Status: foundation implemented for issues #67 and #62. Diagnostics and full
optional-subsystem propagation remain open in #67.

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
- Rust/WASM is the selected production engine. TypeScript remains available only
  through an explicitly named verification manifest for parity tests and
  non-authoritative server-rendered preview frames.
- Terrain, causal sensors, data link, AEW and EW are not admitted. Their deeper
  runtime removal and diagnostics are tracked by #67 and the #66 ledger.

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

