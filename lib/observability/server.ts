import {
  incrementCounter,
  observeHistogram,
} from "./metrics";

type AttributeValue = string | number | boolean;
type Attributes = Record<string, AttributeValue>;

declare const __VECTOR_OTEL_ENDPOINT__: string;

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

function nanos(value = Date.now()) {
  return `${Math.trunc(value)}000000`;
}

function otlpAttributes(attributes: Attributes) {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value:
      typeof value === "number"
        ? { doubleValue: value }
        : typeof value === "boolean"
          ? { boolValue: value }
          : { stringValue: value },
  }));
}

function collectorBaseUrl() {
  const configured =
    typeof __VECTOR_OTEL_ENDPOINT__ === "string" && __VECTOR_OTEL_ENDPOINT__
      ? __VECTOR_OTEL_ENDPOINT__
      : process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return configured?.replace(/\/$/, "") ?? "";
}

async function postOtlp(path: string, body: unknown) {
  const endpoint = collectorBaseUrl();
  if (!endpoint) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Telemetry must never make the product path unavailable.
  } finally {
    clearTimeout(timeout);
  }
}

async function exportSpan(input: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Attributes;
  status: "OK" | "ERROR";
}) {
  await postOtlp("/v1/traces", {
    resourceSpans: [
      {
        resource: {
          attributes: otlpAttributes({
            "service.name": "vector-web",
            "service.version": process.env.VECTOR_VERSION ?? "0.1.0",
            "deployment.environment": process.env.VECTOR_ENVIRONMENT ?? "local",
          }),
        },
        scopeSpans: [
          {
            scope: { name: "vector.observability", version: "1.0.0" },
            spans: [
              {
                traceId: input.traceId,
                spanId: input.spanId,
                parentSpanId: input.parentSpanId,
                name: input.name,
                kind: 2,
                startTimeUnixNano: input.startTimeUnixNano,
                endTimeUnixNano: input.endTimeUnixNano,
                attributes: otlpAttributes(input.attributes),
                status: { code: input.status === "OK" ? 1 : 2 },
              },
            ],
          },
        ],
      },
    ],
  });
}

async function exportErrorLog(traceId: string, spanId: string, message: string, attributes: Attributes) {
  await postOtlp("/v1/logs", {
    resourceLogs: [
      {
        resource: { attributes: otlpAttributes({ "service.name": "vector-web" }) },
        scopeLogs: [
          {
            scope: { name: "vector.observability", version: "1.0.0" },
            logRecords: [
              {
                timeUnixNano: nanos(),
                severityNumber: 17,
                severityText: "ERROR",
                body: { stringValue: message },
                attributes: otlpAttributes(attributes),
                traceId,
                spanId,
              },
            ],
          },
        ],
      },
    ],
  });
}

export async function withObservedRoute(
  route: string,
  request: Request,
  handler: () => Promise<Response>,
) {
  const startedAt = Date.now();
  const started = performance.now();
  const incoming = request.headers.get("traceparent")?.split("-");
  const traceId = incoming?.[1]?.length === 32 ? incoming[1] : randomHex(16);
  const parentSpanId = incoming?.[2]?.length === 16 ? incoming[2] : undefined;
  const spanId = randomHex(8);
  let response: Response;
  let errorMessage = "";
  try {
    response = await handler();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unhandled route failure";
    response = Response.json({ error: "Internal service error" }, { status: 500 });
  }
  const durationSeconds = (performance.now() - started) / 1000;
  const statusClass = `${Math.floor(response.status / 100)}xx`;
  const labels = { route, method: request.method, status_class: statusClass };
  incrementCounter("vector_http_requests_total", labels);
  observeHistogram("vector_http_request_duration_seconds", durationSeconds, labels);
  const attributes = {
    "http.request.method": request.method,
    "http.route": route,
    "http.response.status_code": response.status,
    "url.path": new URL(request.url).pathname,
  };
  await exportSpan({
    traceId,
    spanId,
    parentSpanId,
    name: `${request.method} ${route}`,
    startTimeUnixNano: nanos(startedAt),
    endTimeUnixNano: nanos(),
    attributes,
    status: response.status >= 500 ? "ERROR" : "OK",
  });
  if (response.status >= 500 || errorMessage) {
    await exportErrorLog(traceId, spanId, errorMessage || `Route returned ${response.status}`, attributes);
  }
  const headers = new Headers(response.headers);
  headers.set("server-timing", `vector;dur=${(durationSeconds * 1000).toFixed(2)}`);
  headers.set("traceparent", `00-${traceId}-${spanId}-01`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function observeDatabaseOperation<T>(operation: () => Promise<T>) {
  const started = performance.now();
  let outcome = "success";
  try {
    return await operation();
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    const labels = { operation: "transaction", outcome };
    incrementCounter("vector_database_operations_total", labels);
    observeHistogram(
      "vector_database_operation_duration_seconds",
      (performance.now() - started) / 1000,
      labels,
    );
  }
}
