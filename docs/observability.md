# VECTOR observability contract

Status: Compose-backed and required for the local integrated stack.

## Runtime topology

- VECTOR exports OTLP/HTTP traces and error logs to the OpenTelemetry Collector.
- Prometheus scrapes VECTOR's bounded, bearer-protected `/api/metrics` endpoint and the collector exporter.
- Tempo stores API traces.
- Loki stores OTLP logs.
- Grafana provisions Prometheus, Tempo, and Loki plus the `VECTOR Operations` and `VECTOR Browser Performance` dashboards.

The local endpoints are:

- VECTOR: `http://localhost:4317`
- Grafana: `http://localhost:4300` with `vector` / `vector-local-only` unless overridden
- Prometheus: `http://localhost:9090`
- Tempo: `http://localhost:3200`
- Loki: `http://localhost:3100`
- OpenTelemetry health: `http://localhost:13133`

## Metric contract

Metrics use bounded labels. Run IDs, user-entered names, coordinates, and scenario titles are never metric labels. They belong in traces or durable run records.

Core metrics cover HTTP RED, PostgreSQL operations, verified scenario starts/completions/failures, compute duration, model duration, entity count, reports, map loading, browser long tasks, and navigation duration. Anonymous browser telemetry can write only bounded map and performance events. Run and report metrics are emitted by server-owned verification and persistence paths.

The browser publishes at most one long-task sample in each ten-second window per
document. Navigation and map events retain their existing bounded event shapes.
This sampling is an observability boundary: it prevents instrumentation from
exhausting anonymous admission or competing with navigation and simulation work,
and it never changes model state, playback, or a saved record.

Browser events use the independent `BROWSER_TELEMETRY_RATE_LIMITER` budget of
60 requests per minute. They cannot spend the public API budget used by catalog
and saved-run work. Rejection drops best-effort telemetry only; it cannot delay
or change a simulation request.

Admission adds bounded outcome counters for saved-run acceptance, quota/capacity
rejection, unavailable enforcement, and retention cleanup. IP addresses,
actor hashes, run IDs, and lease IDs are never labels or structured-log values.

`/api/health` includes non-secret admission readback: policy version, runtime,
limiter adapter identity, and readiness. It returns HTTP 503 when the declared
Node limiter store or either Cloudflare rate-limit binding is absent. This is a
deployment configuration check; the following database readiness query verifies
the configured Node store is reachable.

Unexpected public API failures emit the bounded JSON event
`public_api_request_failed` with a request ID and error class. Exception text,
connection strings, actor identities, request bodies, and limiter keys are not
logged or returned to the public response.

Production metrics return 404 unless `METRICS_BEARER_TOKEN` is configured as a Worker secret and presented as a Bearer token. Compose uses a local scrape token and every endpoint is bound to loopback.

Compose runs the application through Wrangler's development proxy. The local
application service restarts automatically if that proxy exits; deployed
Cloudflare Workers do not use this development proxy.

The operations dashboard treats “missing completion” as starts minus completions and failures within a 15-minute observation window. That is an ingestion-health signal, not a durable job-orchestrator state. “Slow browser run” means a reported compute duration above 250 ms. Interactive execution now uses an in-browser Worker with explicit ephemeral states. Those states and bounded progress are UI/runtime diagnostics, not durable orchestration state; a future batch queue must publish durable queued/running/stuck state from its own store.

Worker progress is capped at 20 messages per wall second by default. Run IDs,
scenario names, model-pack digests, and record IDs are not metric labels. Worker
crash, timeout, cancellation latency, compute duration, model duration, backend,
entity-count bucket, record bytes, and boundary-call count are the intended
bounded telemetry dimensions. Telemetry export remains non-blocking and cannot
change model time or completion.

## Verification

`make observability-local` starts the complete Compose topology and proves:

1. every service becomes ready;
2. bounded browser performance events are accepted and authoritative event types are rejected;
3. Prometheus scrapes VECTOR and can query custom business metrics;
4. Grafana has all three data sources and both dashboards;
5. Tempo contains at least one VECTOR API trace.

Telemetry failure is non-blocking for the simulation path. Failed exports are bounded by a 500 ms timeout. PostGIS remains the durable source of truth for scenarios and saved runs.

`make performance-local` executes all eight validated baselines repeatedly after warm-up and reports p50, p95, maximum wall time, total generated frames, and frames per wall second. Its 75 ms p95 ceiling is a regression guard for the current development machine class, not an operational latency guarantee.
