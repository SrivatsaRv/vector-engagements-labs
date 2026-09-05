import { canonicalJson, sha256Hex } from "./canonical-json.ts";

export const SCENARIO_DRAFT_ADMISSION_SCHEMA_VERSION = "vector.scenario-draft-admission.v1" as const;

export type ScenarioDraftAdmissionReceipt = Readonly<{
  schemaVersion: typeof SCENARIO_DRAFT_ADMISSION_SCHEMA_VERSION;
  requestId: string;
  draftDigest: string;
}>;

export type ScenarioDraftAdmissionIssueCode =
  | "DRAFT_ADMISSION_INVALID"
  | "DRAFT_ADMISSION_STALE_REQUEST"
  | "DRAFT_ADMISSION_STALE_DRAFT";

export class ScenarioDraftAdmissionError extends Error {
  readonly code: ScenarioDraftAdmissionIssueCode;
  readonly fieldPath: string;
  readonly stage = "LATEST_DRAFT" as const;
  readonly severity = "BLOCKING" as const;
  readonly correctiveGuidance: string;

  constructor(
    code: ScenarioDraftAdmissionIssueCode,
    fieldPath: string,
    message: string,
    correctiveGuidance: string,
  ) {
    super(message);
    this.name = "ScenarioDraftAdmissionError";
    this.code = code;
    this.fieldPath = fieldPath;
    this.correctiveGuidance = correctiveGuidance;
  }
}

const STABLE_REQUEST_ID = /^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function validateScenarioDraftAdmissionReceipt(
  value: unknown,
): ScenarioDraftAdmissionReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_INVALID",
      "$receipt",
      "Draft admission receipt must be an object.",
      "Start a new admission from the current scenario draft.",
    );
  }
  const receipt = value as Record<string, unknown>;
  if (canonicalJson(Object.keys(receipt).sort()) !== canonicalJson(["draftDigest", "requestId", "schemaVersion"])) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_INVALID",
      "$receipt",
      "Draft admission receipt has unsupported or missing fields.",
      "Start a new admission from the current scenario draft.",
    );
  }
  if (
    receipt.schemaVersion !== SCENARIO_DRAFT_ADMISSION_SCHEMA_VERSION
    || typeof receipt.requestId !== "string"
    || receipt.requestId.length > 128
    || !STABLE_REQUEST_ID.test(receipt.requestId)
    || typeof receipt.draftDigest !== "string"
    || !SHA256.test(receipt.draftDigest)
  ) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_INVALID",
      "$receipt",
      "Draft admission receipt identity is invalid.",
      "Start a new admission from the current scenario draft.",
    );
  }
  return Object.freeze(structuredClone(value) as ScenarioDraftAdmissionReceipt);
}

export async function createScenarioDraftAdmissionReceipt(
  draft: unknown,
  requestId: string,
): Promise<ScenarioDraftAdmissionReceipt> {
  if (requestId.length > 128 || !STABLE_REQUEST_ID.test(requestId)) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_INVALID",
      "$.requestId",
      "Draft admission request ID must be a stable identifier.",
      "Generate a lowercase request identifier before starting admission.",
    );
  }
  return Object.freeze({
    schemaVersion: SCENARIO_DRAFT_ADMISSION_SCHEMA_VERSION,
    requestId,
    draftDigest: await sha256Hex(draft),
  });
}

export async function admitScenarioDraftReceipt(
  receiptInput: unknown,
  draft: unknown,
): Promise<ScenarioDraftAdmissionReceipt> {
  const receipt = validateScenarioDraftAdmissionReceipt(receiptInput);
  if ((await sha256Hex(draft)) !== receipt.draftDigest) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_STALE_DRAFT",
      "$.draftDigest",
      "The scenario draft does not match its admission receipt.",
      "Discard this response and run the current scenario draft again.",
    );
  }
  return receipt;
}

export function assertMatchingScenarioDraftAdmissionReceipt(
  expectedInput: unknown,
  actualInput: unknown,
): ScenarioDraftAdmissionReceipt {
  const expected = validateScenarioDraftAdmissionReceipt(expectedInput);
  const actual = validateScenarioDraftAdmissionReceipt(actualInput);
  if (actual.requestId !== expected.requestId) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_STALE_REQUEST",
      "$.requestId",
      "The admission response belongs to a different request.",
      "Discard this response and run the current scenario draft again.",
    );
  }
  if (actual.draftDigest !== expected.draftDigest) {
    throw new ScenarioDraftAdmissionError(
      "DRAFT_ADMISSION_STALE_DRAFT",
      "$.draftDigest",
      "The admission response belongs to a different scenario draft.",
      "Discard this response and run the current scenario draft again.",
    );
  }
  return actual;
}

/** Owns one in-flight admission. Editing or cancellation invalidates its generation. */
export class ScenarioDraftAdmissionTracker {
  private generation = 0;
  private active: ScenarioDraftAdmissionReceipt | null = null;

  async begin(draft: unknown, requestId: string): Promise<ScenarioDraftAdmissionReceipt> {
    const generation = this.generation;
    const receipt = await createScenarioDraftAdmissionReceipt(draft, requestId);
    if (generation !== this.generation) {
      throw new ScenarioDraftAdmissionError(
        "DRAFT_ADMISSION_STALE_REQUEST",
        "$.requestId",
        "The draft changed while admission was being prepared.",
        "Discard this request and run the current scenario draft again.",
      );
    }
    this.active = receipt;
    return receipt;
  }

  invalidate() {
    this.generation += 1;
    this.active = null;
  }

  async accept(receiptInput: unknown, currentDraft: unknown): Promise<ScenarioDraftAdmissionReceipt> {
    const receipt = validateScenarioDraftAdmissionReceipt(receiptInput);
    const generation = this.generation;
    if (!this.active || this.active.requestId !== receipt.requestId || this.active.draftDigest !== receipt.draftDigest) {
      throw new ScenarioDraftAdmissionError(
        "DRAFT_ADMISSION_STALE_REQUEST",
        "$.requestId",
        "The run response does not belong to the active draft admission.",
        "Discard this response and run the current scenario draft again.",
      );
    }
    const admitted = await admitScenarioDraftReceipt(receipt, currentDraft);
    if (generation !== this.generation || !this.active || this.active.requestId !== receipt.requestId) {
      throw new ScenarioDraftAdmissionError(
        "DRAFT_ADMISSION_STALE_REQUEST",
        "$.requestId",
        "The run response was superseded while its draft was being checked.",
        "Discard this response and run the current scenario draft again.",
      );
    }
    this.active = null;
    return admitted;
  }
}

/** Revoke publication authority synchronously before cancellation crosses an async boundary. */
export function cancelActiveDraftAdmission(
  tracker: ScenarioDraftAdmissionTracker,
  cancel: () => void | Promise<void>,
): Promise<void> {
  tracker.invalidate();
  return Promise.resolve(cancel());
}
