import { canonicalJson } from "./canonical-json.ts";
import { sha256Utf8HexSync } from "./geospatial/digest.ts";
import {
  projectScenarioKernel,
  type CompiledScenarioKernel,
  type ScenarioKernelSurface,
} from "./scenario-kernel.ts";

export const SCENARIO_KERNEL_REQUEST_SCHEMA_VERSION = "vector.scenario-kernel-request.v1" as const;
export const SCENARIO_KERNEL_RESPONSE_SCHEMA_VERSION = "vector.scenario-kernel-response.v1" as const;

export type ScenarioKernelRequestToken = {
  schemaVersion: typeof SCENARIO_KERNEL_REQUEST_SCHEMA_VERSION;
  requestId: string;
  draftDigest: string;
  perspectiveId: string;
  perspectivePolicyDigest: string;
  surface: ScenarioKernelSurface;
  projectionDigest: string;
  tokenDigest: string;
};

export type ScenarioKernelResponse<T> = {
  schemaVersion: typeof SCENARIO_KERNEL_RESPONSE_SCHEMA_VERSION;
  requestId: string;
  tokenDigest: string;
  payload: T;
};

export type ScenarioKernelRequestIssueCode =
  | "KERNEL_REQUEST_INVALID"
  | "KERNEL_REQUEST_ID_MISMATCH"
  | "KERNEL_REQUEST_STALE_DRAFT"
  | "KERNEL_REQUEST_STALE_PERSPECTIVE"
  | "KERNEL_REQUEST_STALE_SURFACE";

export class ScenarioKernelRequestError extends Error {
  readonly code: ScenarioKernelRequestIssueCode;
  readonly path: string;

  constructor(code: ScenarioKernelRequestIssueCode, path: string, message: string) {
    super(message);
    this.name = "ScenarioKernelRequestError";
    this.code = code;
    this.path = path;
  }
}

const STABLE_ID = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const DIGEST = /^[0-9a-f]{64}$/;
const SURFACES: ScenarioKernelSurface[] = [
  "CONSTRUCT", "OBSERVE", "EXPLAIN", "COMPARE", "REPLAY", "EXPORT",
];

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const pending: object[] = [value];
  const seen = new WeakSet<object>();
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const candidate = pending[cursor];
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    for (const nested of Object.values(candidate)) {
      if (nested && typeof nested === "object") pending.push(nested);
    }
    Object.freeze(candidate);
  }
  return value;
}

function record(value: unknown, path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_INVALID", path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string) {
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_INVALID", path, `${path} has unsupported or missing fields.`);
  }
}

function tokenMaterial(token: Omit<ScenarioKernelRequestToken, "tokenDigest">) {
  return token;
}

function validateToken(input: unknown): ScenarioKernelRequestToken {
  const token = record(input, "$token");
  exactKeys(token, [
    "schemaVersion", "requestId", "draftDigest", "perspectiveId", "perspectivePolicyDigest",
    "surface", "projectionDigest", "tokenDigest",
  ], "$token");
  if (token.schemaVersion !== SCENARIO_KERNEL_REQUEST_SCHEMA_VERSION
    || typeof token.requestId !== "string" || token.requestId.length > 128 || !STABLE_ID.test(token.requestId)
    || typeof token.perspectiveId !== "string" || token.perspectiveId.length > 128 || !STABLE_ID.test(token.perspectiveId)
    || typeof token.draftDigest !== "string" || !DIGEST.test(token.draftDigest)
    || typeof token.perspectivePolicyDigest !== "string" || !DIGEST.test(token.perspectivePolicyDigest)
    || typeof token.projectionDigest !== "string" || !DIGEST.test(token.projectionDigest)
    || typeof token.tokenDigest !== "string" || !DIGEST.test(token.tokenDigest)
    || typeof token.surface !== "string" || !SURFACES.includes(token.surface as ScenarioKernelSurface)) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_INVALID", "$token", "Request token fields are invalid.");
  }
  const typed = structuredClone(input) as ScenarioKernelRequestToken;
  const { tokenDigest, ...material } = typed;
  if (sha256Utf8HexSync(canonicalJson(material)) !== tokenDigest) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_INVALID", "$token.tokenDigest", "Request token digest does not match its canonical context.");
  }
  return typed;
}

export function createScenarioKernelRequestToken(
  kernel: CompiledScenarioKernel,
  perspectiveId: string,
  surface: ScenarioKernelSurface,
  requestId: string,
): ScenarioKernelRequestToken {
  if (requestId.length > 128 || !STABLE_ID.test(requestId)) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_INVALID", "$.requestId", "Request ID must be a stable identifier.");
  }
  const projection = projectScenarioKernel(kernel, perspectiveId, surface);
  const material = tokenMaterial({
    schemaVersion: SCENARIO_KERNEL_REQUEST_SCHEMA_VERSION,
    requestId,
    draftDigest: kernel.digest,
    perspectiveId,
    perspectivePolicyDigest: projection.perspective.policyDigest,
    surface,
    projectionDigest: projection.digest,
  });
  return deepFreeze({
    ...material,
    tokenDigest: sha256Utf8HexSync(canonicalJson(material)),
  });
}

export function acceptScenarioKernelResponse<T>(
  kernel: CompiledScenarioKernel,
  perspectiveId: string,
  surface: ScenarioKernelSurface,
  tokenInput: unknown,
  responseInput: unknown,
): ScenarioKernelResponse<T> {
  const token = validateToken(tokenInput);
  if (token.perspectiveId !== perspectiveId) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_STALE_PERSPECTIVE", "$.perspectiveId", "The active perspective changed while the request was in flight.");
  }
  if (token.surface !== surface) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_STALE_SURFACE", "$.surface", "The active surface changed while the request was in flight.");
  }
  if (token.draftDigest !== kernel.digest) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_STALE_DRAFT", "$.draftDigest", "The scenario draft changed while the request was in flight.");
  }
  const current = createScenarioKernelRequestToken(kernel, perspectiveId, surface, token.requestId);
  if (token.perspectivePolicyDigest !== current.perspectivePolicyDigest
    || token.projectionDigest !== current.projectionDigest) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_STALE_PERSPECTIVE", "$.perspectivePolicyDigest", "The active perspective policy changed while the request was in flight.");
  }

  const response = record(responseInput, "$response");
  exactKeys(response, ["schemaVersion", "requestId", "tokenDigest", "payload"], "$response");
  if (response.schemaVersion !== SCENARIO_KERNEL_RESPONSE_SCHEMA_VERSION) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_INVALID", "$response.schemaVersion", "Response schema is unsupported.");
  }
  if (response.requestId !== token.requestId) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_ID_MISMATCH", "$response.requestId", "Response request ID does not match its request token.");
  }
  if (response.tokenDigest !== token.tokenDigest) {
    throw new ScenarioKernelRequestError("KERNEL_REQUEST_ID_MISMATCH", "$response.tokenDigest", "Response token digest does not match its request token.");
  }
  return deepFreeze(structuredClone(responseInput) as ScenarioKernelResponse<T>);
}
