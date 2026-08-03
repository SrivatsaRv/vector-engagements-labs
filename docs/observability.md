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

Core metrics cover HTTP RED, PostgreSQL operations, scenario starts/completions/failures, active runs, compute duration, model duration, entity count, reports, map loading, browser long tasks, and navigation duration.

## Verification

`make observability-local` starts the complete Compose topology and proves:

1. every service becomes ready;
2. browser scenario events are accepted and invalid event types are rejected;
3. Prometheus scrapes VECTOR and can query custom business metrics;
4. Grafana has all three data sources and both dashboards;
5. Tempo contains at least one VECTOR API trace.

Telemetry failure is non-blocking for the simulation path. Failed exports are bounded by a 500 ms timeout. PostGIS remains the durable source of truth for scenarios and saved runs.
