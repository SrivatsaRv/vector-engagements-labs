# VECTOR observability contract

Status: Compose-backed and required for the local integrated stack.

## Runtime topology

- VECTOR exports OTLP/HTTP traces and error logs to the OpenTelemetry Collector.
- Prometheus scrapes VECTOR's bounded `/api/metrics` endpoint and the collector exporter.
- Tempo stores API traces.
- Loki stores OTLP logs.
- Grafana provisions Prometheus, Tempo, and Loki plus the `VECTOR Operations` and `VECTOR Browser Performance` dashboards.

The local endpoints are:

- VECTOR: `http://localhost:4317`
- Grafana: `http://localhost:4300` with `vector` / `vector`
- Prometheus: `http://localhost:9090`
- Tempo: `http://localhost:3200`
- Loki: `http://localhost:3100`
- OpenTelemetry health: `http://localhost:13133`

## Metric contract

Metrics use bounded labels. Run IDs, user-entered names, coordinates, and scenario titles are never metric labels. They belong in traces or durable run records.

Core metrics cover HTTP RED, PostgreSQL operations, scenario starts/completions/failures, compute duration, model duration, entity count, reports, map loading, browser long tasks, and navigation duration. Browser telemetry is delivered in a serialized queue so a run start cannot overtake its completion event.

The operations dashboard treats “missing completion” as starts minus completions and failures within a 15-minute observation window. That is an ingestion-health signal, not a durable job-orchestrator state. “Slow browser run” means a reported compute duration above 250 ms. The current engine is synchronous and local to the browser; if execution moves to Workers, durable queued/running/stuck state must come from that orchestration store rather than an in-process metric gauge.

## Verification

`make observability-local` starts the complete Compose topology and proves:

1. every service becomes ready;
2. browser scenario events are accepted and invalid event types are rejected;
3. Prometheus scrapes VECTOR and can query custom business metrics;
4. Grafana has all three data sources and both dashboards;
5. Tempo contains at least one VECTOR API trace.

Telemetry failure is non-blocking for the simulation path. Failed exports are bounded by a 500 ms timeout. PostGIS remains the durable source of truth for scenarios and saved runs.

`make performance-local` executes all eight validated baselines repeatedly after warm-up and reports p50, p95, maximum wall time, total generated frames, and frames per wall second. Its 75 ms p95 ceiling is a regression guard for the current development machine class, not an operational latency guarantee.
