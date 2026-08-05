# Testing decision matrix

Use the smallest complete set of layers that proves the behavior. Do not run every expensive suite for every edit, but do not omit a relevant layer merely because it is inconvenient.

| Change | Required evidence |
|---|---|
| Pure math, parser, reducer, compiler or validation rule | focused unit tests, boundary/error cases, deterministic repeat |
| Schema, model pack, scenario, record or API contract | schema round-trip, malformed-input rejection, canonical digest/compatibility regression |
| Rust engine or ABI | Rust unit/integration tests, Clippy/rustdoc, TypeScript/Rust parity fixtures, WASM integrity |
| Database schema, migration, seed or repository | migration from empty database, upgrade path, seed/verifier assertions, API integration |
| API route, saved run, report or security boundary | handler/service tests, admission/error cases, live integration where persistence or bindings matter |
| React component, builder, map, playback or state interaction | component/interaction tests, keyboard/touch/error states, targeted rendered regression |
| User journey or cross-page behavior | browser end-to-end test against a built app, persisted/replayed state assertions |
| Layout, viewport, map or visual behavior | responsive contract test plus screenshot/trace evidence for changed breakpoints |
| Performance, Worker, batching or concurrency | benchmark with environment record, p95/allocation guard, cancellation/timeout/recovery tests |
| Observability or operational behavior | emitted metric/trace/log assertions and dashboard/health verification |
| Bug fix | regression test reproducing the original failure, then the smallest fix |
| Documentation or workflow command | link/command/config validation when executable behavior is affected |

## Current runners

- Keep Node's built-in `node:test` for dependency-light domain and contract tests already used under `tests/*.test.mjs`.
- Keep Rust's Cargo test, Clippy, rustdoc and parity checks for the engine.
- Keep the existing database/API, responsive, observability and benchmark scripts; they are integration contracts, not substitutes for focused unit tests.
- `make ci-local` is the required local baseline. It does not replace targeted integration, frontend, visual, observability or performance checks.

## Framework recommendation

Adopt in stages:

1. Add `@playwright/test` for browser end-to-end, trace, screenshot and multi-viewport tests. The repository currently has `playwright-core`, which is a browser library rather than a test runner.
2. Add Vitest only when component-level TypeScript/React tests need a faster shared runner, mocking, coverage and watch mode than Node's runner provides. Do not migrate stable domain tests solely for consistency.
3. Add Testing Library with Vitest for user-visible React interactions; test accessible behavior and state transitions, not implementation details.
4. Add coverage reporting and thresholds after the test inventory is stable. Start with changed-file and critical-contract thresholds; avoid a misleading global percentage target.

Do not introduce Jest, Cypress, Vitest and Playwright simultaneously. Each new dependency must arrive with one useful suite, a CI/local command, documentation, and a removal/maintenance rationale.

## Handoff test record

Every handoff lists: test layer, command, scope, result, environment, and artifact (trace, screenshot, benchmark record, migration log, or report) where applicable. List skipped layers and the reason. A red or flaky test is a blocker until fixed, quarantined with an owner and issue, or explicitly accepted by the release steward.
