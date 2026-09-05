const JSON_CONTENT_TYPE = "application/json";

export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers?: HeadersInit;
  /** Internal field address for deterministic admission/replay handling. */
  readonly fieldPath?: string;

  constructor(
    status: number,
    code: string,
    message = code,
    headers?: HeadersInit,
    fieldPath?: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.fieldPath = fieldPath;
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== JSON_CONTENT_TYPE) {
    throw new PublicApiError(415, "unsupported_media_type");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PublicApiError(413, "request_too_large");
  }
  if (!request.body) throw new PublicApiError(400, "request_body_required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel("request too large");
      throw new PublicApiError(413, "request_too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new PublicApiError(400, "invalid_json");
  }
}

export function publicApiError(error: unknown, fallbackStatus = 500) {
  if (error instanceof PublicApiError) {
    return Response.json({
      error: error.code,
      ...(error.fieldPath ? { fieldPath: error.fieldPath } : {}),
    }, {
      status: error.status,
      headers: error.headers,
    });
  }
  const requestId = crypto.randomUUID();
  // Keep failure logs parseable without reflecting exception text, which can
  // contain connection details or user-controlled values. The request ID is
  // returned to the caller and can be joined with this bounded event.
  console.error(JSON.stringify({
    event: "public_api_request_failed",
    requestId,
    errorType: error instanceof Error ? error.name : "unknown",
  }));
  return Response.json(
    { error: "service_unavailable", requestId },
    { status: fallbackStatus },
  );
}

export function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new PublicApiError(400, `invalid_${field}`);
  }
  return value;
}

export function shortString(value: unknown, maximum: number, field: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new PublicApiError(400, `invalid_${field}`);
  }
  return value;
}

export function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return process.env.VECTOR_ENVIRONMENT === "local" &&
    (host === "127.0.0.1" || host === "localhost" || host === "::1");
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

export function timingSafeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
