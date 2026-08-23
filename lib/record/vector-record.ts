import { canonicalJson } from "../canonical-json.ts";
import { RUST_WASM_ENGINE_ARTIFACT } from "../engine/backend.ts";
import type {
  EngineEntityFrame,
  EngineFrame,
  EngineRun,
  SimulationEventStream,
  SimulationEventV2,
} from "../engine/contracts.ts";
import { SIMULATION_EVENT_SCHEMA } from "../engine/contracts.ts";
import { assertSimulationEventStream } from "../engine/simulation-events.ts";
import { sha256Bytes } from "../runtime/digest.ts";
import {
  buildSimulationResult,
  type PreparedSimulation,
  type RaspTrack,
  type Scenario,
  type SimulationResult,
} from "../simulation.ts";
import { attachRecordedObserverStates } from "../information-state.ts";
import {
  assertPhaseAEnvironmentPack,
  environmentPackBinding,
} from "../geospatial/environment-pack.ts";

export const VECTOR_RECORD_SCHEMA = "vector.record.v1" as const;
export const VECTOR_FRAME_SCHEMA = "vector.frames.columnar.v4" as const;
export const VECTOR_EVENT_SCHEMA = SIMULATION_EVENT_SCHEMA;
export const LEGACY_VECTOR_EVENT_SCHEMA = "vector.events.v1" as const;
export const VECTOR_PICTURE_SCHEMA = "vector.pictures.v3" as const;
export const MAX_VECTOR_RECORD_BYTES = 64 * 1024 * 1024;

const RECORD_MAGIC = new TextEncoder().encode("VECTOR1\0");
const FRAME_MAGIC = new TextEncoder().encode("VECFRM1\0");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type VectorRecordMember = {
  path: string;
  schemaVersion: string;
  mediaType: string;
  required: boolean;
  byteLength: number;
  sha256: string;
};

export type VectorRecordManifest = {
  schemaVersion: typeof VECTOR_RECORD_SCHEMA;
  recordId: string;
  contentDigest: string;
  title: string;
  createdAt: string;
  producer: {
    name: "Vector Engagement Labs";
    runtimeProtocol: "vector.browser-runtime.v1";
  };
  backend: {
    selected: "typescript" | "rust-wasm";
    engineScenarioVersion: string;
    compatibilityAbi: "typescript-batched-v1" | "rust-json-v1";
    artifactSha256?: string;
  };
  deploymentCapabilities: {
    schemaVersion: "vector.deployment-capabilities.v1";
    digest: string;
  };
  requiredViewerFeatures: string[];
  members: VectorRecordMember[];
};

export type VectorRecordEvent = SimulationEventV2;

type RecordReport = {
  schemaVersion: "vector.report.v1";
  result: {
    outcome: SimulationResult["outcome"];
    successful: boolean;
    termination: SimulationResult["termination"];
    closestApproach: number;
    timeOfFlight: number;
    endSpeed: number;
    peakDemand: number;
    reason: string;
  };
  engine: Omit<EngineRun, "scenario" | "frames" | "events">;
  limitations: string[];
};

type MemberBytes = {
  path: string;
  schemaVersion: string;
  mediaType: string;
  required: boolean;
  bytes: Uint8Array;
  sha256: string;
};

export type VectorSimulationRecord = {
  manifest: VectorRecordManifest;
  members: MemberBytes[];
};

export type OpenedVectorRecord = {
  manifest: VectorRecordManifest;
  scenario: Scenario;
  result: SimulationResult;
  events: SimulationEventStream;
  pictures: RaspTrack[];
  report: RecordReport;
};

type FrameColumn =
  | "positionX"
  | "positionY"
  | "positionZ"
  | "velocityX"
  | "velocityY"
  | "velocityZ"
  | "speedMps"
  | "headingRad"
  | "massKg"
  | "fuelKg"
  | "mach"
  | "specificEnergyJkg"
  | "dragNewtons"
  | "thrustNewtons"
  | "commandedG"
  | "availableG"
  | "storeMassKg"
  | "routePointIndex"
  | "requestedVelocityX"
  | "requestedVelocityY"
  | "requestedVelocityZ"
  | "requestedSteeringAccelerationX"
  | "requestedSteeringAccelerationY"
  | "requestedSteeringAccelerationZ"
  | "acceptedSteeringAccelerationX"
  | "acceptedSteeringAccelerationY"
  | "acceptedSteeringAccelerationZ"
  | "achievedVelocityX"
  | "achievedVelocityY"
  | "achievedVelocityZ";

const FRAME_COLUMNS: FrameColumn[] = [
  "positionX",
  "positionY",
  "positionZ",
  "velocityX",
  "velocityY",
  "velocityZ",
  "speedMps",
  "headingRad",
  "massKg",
  "fuelKg",
  "mach",
  "specificEnergyJkg",
  "dragNewtons",
  "thrustNewtons",
  "commandedG",
  "availableG",
  "storeMassKg",
  "routePointIndex",
  "requestedVelocityX",
  "requestedVelocityY",
  "requestedVelocityZ",
  "requestedSteeringAccelerationX",
  "requestedSteeringAccelerationY",
  "requestedSteeringAccelerationZ",
  "acceptedSteeringAccelerationX",
  "acceptedSteeringAccelerationY",
  "acceptedSteeringAccelerationZ",
  "achievedVelocityX",
  "achievedVelocityY",
  "achievedVelocityZ",
];

type EntityMetadata = Pick<
  EngineEntityFrame,
  | "id"
  | "rddfId"
  | "designation"
  | "callsign"
  | "affiliation"
  | "kind"
  | "symbolRole"
  | "lifecycle"
  | "phase"
  | "weaponFlightState"
  | "valueState"
>;

type StoredEntityMetadata = EntityMetadata & {
  installedStoreIds: string[];
  aircraftControlLimiter?: NonNullable<
    EngineEntityFrame["aircraftControl"]
  >["limiter"];
};

type FrameHeader = {
  schemaVersion: string;
  columns: FrameColumn[];
  frames: Array<
    Omit<EngineFrame, "entities"> & { entityOffset: number; entityCount: number }
  >;
  entities: StoredEntityMetadata[];
};

function jsonBytes(value: unknown) {
  return encoder.encode(canonicalJson(value));
}

function readMagic(bytes: Uint8Array, expected: Uint8Array, label: string) {
  if (
    bytes.byteLength < expected.byteLength ||
    expected.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error(`${label} magic is invalid.`);
  }
}

function entityColumnValue(entity: EngineEntityFrame, column: FrameColumn) {
  if (column === "positionX") return entity.position.x;
  if (column === "positionY") return entity.position.y;
  if (column === "positionZ") return entity.position.z;
  if (column === "velocityX") return entity.velocity.x;
  if (column === "velocityY") return entity.velocity.y;
  if (column === "velocityZ") return entity.velocity.z;
  if (column === "routePointIndex")
    return entity.aircraftControl?.routePointIndex ?? Number.NaN;
  if (column === "requestedVelocityX")
    return entity.aircraftControl?.requestedVelocityMps.x ?? Number.NaN;
  if (column === "requestedVelocityY")
    return entity.aircraftControl?.requestedVelocityMps.y ?? Number.NaN;
  if (column === "requestedVelocityZ")
    return entity.aircraftControl?.requestedVelocityMps.z ?? Number.NaN;
  if (column === "requestedSteeringAccelerationX")
    return entity.aircraftControl?.requestedSteeringAccelerationMps2.x ?? Number.NaN;
  if (column === "requestedSteeringAccelerationY")
    return entity.aircraftControl?.requestedSteeringAccelerationMps2.y ?? Number.NaN;
  if (column === "requestedSteeringAccelerationZ")
    return entity.aircraftControl?.requestedSteeringAccelerationMps2.z ?? Number.NaN;
  if (column === "acceptedSteeringAccelerationX")
    return entity.aircraftControl?.acceptedSteeringAccelerationMps2.x ?? Number.NaN;
  if (column === "acceptedSteeringAccelerationY")
    return entity.aircraftControl?.acceptedSteeringAccelerationMps2.y ?? Number.NaN;
  if (column === "acceptedSteeringAccelerationZ")
    return entity.aircraftControl?.acceptedSteeringAccelerationMps2.z ?? Number.NaN;
  if (column === "achievedVelocityX")
    return entity.aircraftControl?.achievedVelocityMps.x ?? Number.NaN;
  if (column === "achievedVelocityY")
    return entity.aircraftControl?.achievedVelocityMps.y ?? Number.NaN;
  if (column === "achievedVelocityZ")
    return entity.aircraftControl?.achievedVelocityMps.z ?? Number.NaN;
  return entity[column];
}

export function encodeColumnarFrames(frames: EngineFrame[]): Uint8Array {
  const entities = frames.flatMap((frame) => frame.entities);
  let entityOffset = 0;
  const header: FrameHeader = {
    schemaVersion: VECTOR_FRAME_SCHEMA,
    columns: FRAME_COLUMNS,
    frames: frames.map((frame) => {
      const metadata = {
        t: frame.t,
        primaryWeaponId: frame.primaryWeaponId,
        primaryTargetId: frame.primaryTargetId,
        separationM: frame.separationM,
        closureRateMps: frame.closureRateMps,
        lineOfSightRateRadS: frame.lineOfSightRateRadS,
        observerStates: frame.observerStates,
        geographicPositions: frame.geographicPositions,
        entityOffset,
        entityCount: frame.entities.length,
      };
      entityOffset += frame.entities.length;
      return metadata;
    }),
    entities: entities.map((entity) => ({
      id: entity.id,
      rddfId: entity.rddfId,
      designation: entity.designation,
      callsign: entity.callsign,
      affiliation: entity.affiliation,
      kind: entity.kind,
      symbolRole: entity.symbolRole,
      lifecycle: entity.lifecycle,
      phase: entity.phase,
      ...(entity.weaponFlightState
        ? { weaponFlightState: entity.weaponFlightState }
        : {}),
      valueState: entity.valueState,
      installedStoreIds: entity.installedStoreIds,
      ...(entity.aircraftControl
        ? { aircraftControlLimiter: entity.aircraftControl.limiter }
        : {}),
    })),
  };
  const headerBytes = jsonBytes(header);
  const numericBytes = entities.length * FRAME_COLUMNS.length * Float64Array.BYTES_PER_ELEMENT;
  const bytes = new Uint8Array(12 + headerBytes.byteLength + numericBytes);
  bytes.set(FRAME_MAGIC, 0);
  new DataView(bytes.buffer).setUint32(8, headerBytes.byteLength, true);
  bytes.set(headerBytes, 12);
  const values = new DataView(bytes.buffer, 12 + headerBytes.byteLength, numericBytes);
  let index = 0;
  for (const column of FRAME_COLUMNS) {
    for (const entity of entities) {
      values.setFloat64(
        index++ * Float64Array.BYTES_PER_ELEMENT,
        entityColumnValue(entity, column),
        true,
      );
    }
  }
  return bytes;
}

export function decodeColumnarFrames(bytes: Uint8Array): EngineFrame[] {
  readMagic(bytes, FRAME_MAGIC, "VECTOR frame stream");
  const headerLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(8, true);
  if (headerLength > bytes.byteLength - 12) {
    throw new Error("VECTOR frame header length is out of bounds.");
  }
  const header = JSON.parse(
    decoder.decode(bytes.subarray(12, 12 + headerLength)),
  ) as FrameHeader;
  if (header.schemaVersion === "vector.frames.columnar.v2" || header.schemaVersion === "vector.frames.columnar.v3") {
    throw new Error(
      "VECTOR frame schema omits canonical observer state; regenerate the record with v4.",
    );
  }
  if (
    header.schemaVersion !== VECTOR_FRAME_SCHEMA ||
    canonicalJson(header.columns) !== canonicalJson(FRAME_COLUMNS)
  ) {
    throw new Error("VECTOR frame schema is unsupported.");
  }
  const valueCount = header.entities.length * FRAME_COLUMNS.length;
  const expectedLength = 12 + headerLength + valueCount * Float64Array.BYTES_PER_ELEMENT;
  if (bytes.byteLength !== expectedLength) {
    throw new Error("VECTOR frame stream length does not match its schema.");
  }
  const values = new DataView(
    bytes.buffer,
    bytes.byteOffset + 12 + headerLength,
    valueCount * Float64Array.BYTES_PER_ELEMENT,
  );
  const column = (name: FrameColumn, entityIndex: number) =>
    values.getFloat64(
      (FRAME_COLUMNS.indexOf(name) * header.entities.length + entityIndex) *
        Float64Array.BYTES_PER_ELEMENT,
      true,
    );
  const decodedEntities = header.entities.map((storedMetadata, index): EngineEntityFrame => {
    const { aircraftControlLimiter, installedStoreIds, ...metadata } = storedMetadata;
    const routePointIndex = column("routePointIndex", index);
    return {
    ...metadata,
    position: {
      x: column("positionX", index),
      y: column("positionY", index),
      z: column("positionZ", index),
    },
    velocity: {
      x: column("velocityX", index),
      y: column("velocityY", index),
      z: column("velocityZ", index),
    },
    speedMps: column("speedMps", index),
    headingRad: column("headingRad", index),
    massKg: column("massKg", index),
    fuelKg: column("fuelKg", index),
    mach: column("mach", index),
    specificEnergyJkg: column("specificEnergyJkg", index),
    dragNewtons: column("dragNewtons", index),
    thrustNewtons: column("thrustNewtons", index),
    commandedG: column("commandedG", index),
    availableG: column("availableG", index),
    storeMassKg: column("storeMassKg", index),
    installedStoreIds,
    ...(aircraftControlLimiter
      ? {
          aircraftControl: {
            routePointIndex: Number.isNaN(routePointIndex) ? null : routePointIndex,
            requestedVelocityMps: {
              x: column("requestedVelocityX", index),
              y: column("requestedVelocityY", index),
              z: column("requestedVelocityZ", index),
            },
            requestedSteeringAccelerationMps2: {
              x: column("requestedSteeringAccelerationX", index),
              y: column("requestedSteeringAccelerationY", index),
              z: column("requestedSteeringAccelerationZ", index),
            },
            acceptedSteeringAccelerationMps2: {
              x: column("acceptedSteeringAccelerationX", index),
              y: column("acceptedSteeringAccelerationY", index),
              z: column("acceptedSteeringAccelerationZ", index),
            },
            achievedVelocityMps: {
              x: column("achievedVelocityX", index),
              y: column("achievedVelocityY", index),
              z: column("achievedVelocityZ", index),
            },
            limiter: aircraftControlLimiter,
          },
        }
      : {}),
  };
  });
  return header.frames.map(({ entityOffset: offset, entityCount: count, ...frame }) => ({
    ...frame,
    entities: decodedEntities.slice(offset, offset + count),
  }));
}

async function member(
  path: string,
  schemaVersion: string,
  mediaType: string,
  required: boolean,
  bytes: Uint8Array,
): Promise<MemberBytes> {
  return {
    path,
    schemaVersion,
    mediaType,
    required,
    bytes,
    sha256: await sha256Bytes(bytes),
  };
}

export async function createVectorSimulationRecord(
  prepared: PreparedSimulation,
  result: SimulationResult,
  createdAt = new Date().toISOString(),
): Promise<VectorSimulationRecord> {
  if (
    result.engineRun.diagnostics.backend !==
    prepared.capabilityManifest.engine.id
  ) {
    throw new Error("Record backend provenance does not match the selected backend.");
  }
  const report: RecordReport = {
    schemaVersion: "vector.report.v1",
    result: {
      outcome: result.outcome,
      successful: result.successful,
      termination: result.termination,
      closestApproach: result.closestApproach,
      timeOfFlight: result.timeOfFlight,
      endSpeed: result.endSpeed,
      peakDemand: result.peakDemand,
      reason: result.reason,
    },
    engine: {
      envelopes: result.engineRun.envelopes,
      primaryWeaponId: result.engineRun.primaryWeaponId,
      primaryTargetId: result.engineRun.primaryTargetId,
      termination: result.engineRun.termination,
      closestApproachM: result.engineRun.closestApproachM,
      peakCommandG: result.engineRun.peakCommandG,
      diagnostics: result.engineRun.diagnostics,
    },
    limitations: [
      "Educational deterministic point-mass model; not verified named-system prediction.",
      "Observer state is recorded from the canonical fail-closed tick boundary.",
    ],
  };
  if (result.engineRun.events.state !== "AVAILABLE") {
    throw new Error("A new VECTOR record requires an available simulation-event stream.");
  }
  const events = result.engineRun.events.items;
  assertSimulationEventStream(
    events,
    result.engineRun.frames,
    result.engineRun.scenario,
    result.engineRun.termination,
  );
  const pictures = result.pictures;
  const nonManifest = await Promise.all([
    member("scenario.json", "vector.scenario.v2", "application/json", true, jsonBytes(prepared.scenario)),
    member(
      "compiled.json",
      "vector.compiled-adapter.v1",
      "application/json",
      true,
      jsonBytes({
        capabilityManifest: prepared.capabilityManifest,
        profileId: prepared.profileId,
        profile: prepared.profile,
        engineScenario: prepared.engineScenario,
      }),
    ),
    member("entities.json", "vector.entities.v1", "application/json", true, jsonBytes(result.entityManifest)),
    member(
      "frames.arrow",
      VECTOR_FRAME_SCHEMA,
      "application/vnd.vector.frames+columnar",
      true,
      encodeColumnarFrames(result.engineRun.frames),
    ),
    member(
      "events.jsonl",
      VECTOR_EVENT_SCHEMA,
      "application/x-ndjson",
      true,
      encoder.encode(events.map((event) => canonicalJson(event)).join("\n")),
    ),
    member(
      "pictures.jsonl",
      VECTOR_PICTURE_SCHEMA,
      "application/x-ndjson",
      true,
      encoder.encode(pictures.map((picture) => canonicalJson(picture)).join("\n")),
    ),
    member(
      "sources.json",
      "vector.sources.v1",
      "application/json",
      true,
      jsonBytes(
        prepared.engineScenario.entities.map((entity) => ({
          entityId: entity.id,
          provenance: entity.provenance,
        })),
      ),
    ),
    member("report.json", report.schemaVersion, "application/json", true, jsonBytes(report)),
  ]);
  const recordId = await sha256Bytes(
    jsonBytes(nonManifest.map(({ path, sha256 }) => ({ path, sha256 }))),
  );
  const manifestWithoutDigest: Omit<VectorRecordManifest, "contentDigest"> = {
    schemaVersion: VECTOR_RECORD_SCHEMA,
    recordId,
    title: prepared.scenario.name,
    createdAt,
    producer: {
      name: "Vector Engagement Labs",
      runtimeProtocol: "vector.browser-runtime.v1",
    },
    backend: {
      selected: prepared.capabilityManifest.engine.id,
      engineScenarioVersion: prepared.engineScenario.version,
      compatibilityAbi:
        prepared.capabilityManifest.engine.id === "rust-wasm"
          ? "rust-json-v1"
          : "typescript-batched-v1",
      ...(prepared.capabilityManifest.engine.id === "rust-wasm"
        ? { artifactSha256: RUST_WASM_ENGINE_ARTIFACT.sha256 }
        : {}),
    },
    deploymentCapabilities: {
      schemaVersion: prepared.capabilityManifest.schemaVersion,
      digest: prepared.capabilityManifest.digest,
    },
    requiredViewerFeatures: [
      VECTOR_FRAME_SCHEMA,
      VECTOR_EVENT_SCHEMA,
      VECTOR_PICTURE_SCHEMA,
      "vector.report.v1",
    ],
    members: nonManifest.map(({ bytes, ...item }) => ({
      ...item,
      byteLength: bytes.byteLength,
    })),
  };
  const contentDigest = await sha256Bytes(jsonBytes(manifestWithoutDigest));
  const manifest: VectorRecordManifest = { ...manifestWithoutDigest, contentDigest };
  const manifestMember = await member(
    "manifest.json",
    VECTOR_RECORD_SCHEMA,
    "application/json",
    true,
    jsonBytes(manifest),
  );
  return { manifest, members: [manifestMember, ...nonManifest] };
}

type ArchiveHeader = {
  schemaVersion: "vector.archive.v1";
  members: Array<VectorRecordMember & { offset: number }>;
};

export function serializeVectorRecord(
  record: VectorSimulationRecord,
  reusable?: ArrayBuffer,
): { buffer: ArrayBuffer; byteLength: number } {
  let offset = 0;
  const entries = record.members.map((item) => {
    const entry = {
      path: item.path,
      schemaVersion: item.schemaVersion,
      mediaType: item.mediaType,
      required: item.required,
      byteLength: item.bytes.byteLength,
      sha256: item.sha256,
      offset,
    };
    offset += item.bytes.byteLength;
    return entry;
  });
  const headerBytes = jsonBytes({
    schemaVersion: "vector.archive.v1",
    members: entries,
  } satisfies ArchiveHeader);
  const byteLength = 12 + headerBytes.byteLength + offset;
  if (byteLength > MAX_VECTOR_RECORD_BYTES) {
    throw new Error(
      `VECTOR record is ${byteLength} bytes; the browser transport maximum is ${MAX_VECTOR_RECORD_BYTES} bytes.`,
    );
  }
  const buffer =
    reusable && reusable.byteLength >= byteLength
      ? reusable
      : new ArrayBuffer(2 ** Math.ceil(Math.log2(Math.max(1024, byteLength))));
  const bytes = new Uint8Array(buffer);
  bytes.fill(0, 0, byteLength);
  bytes.set(RECORD_MAGIC, 0);
  new DataView(buffer).setUint32(8, headerBytes.byteLength, true);
  bytes.set(headerBytes, 12);
  let payloadOffset = 12 + headerBytes.byteLength;
  for (const item of record.members) {
    bytes.set(item.bytes, payloadOffset);
    payloadOffset += item.bytes.byteLength;
  }
  return { buffer, byteLength };
}

function jsonLines<T>(bytes: Uint8Array): T[] {
  const text = decoder.decode(bytes).trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

export async function openVectorSimulationRecord(
  buffer: ArrayBuffer,
  byteLength = buffer.byteLength,
): Promise<OpenedVectorRecord> {
  if (byteLength > buffer.byteLength || byteLength < 12) {
    throw new Error("VECTOR record length is out of bounds.");
  }
  const archiveBytes = new Uint8Array(buffer, 0, byteLength);
  readMagic(archiveBytes, RECORD_MAGIC, "VECTOR record");
  const headerLength = new DataView(buffer).getUint32(8, true);
  if (headerLength > byteLength - 12) throw new Error("VECTOR record header is truncated.");
  const header = JSON.parse(
    decoder.decode(archiveBytes.subarray(12, 12 + headerLength)),
  ) as ArchiveHeader;
  if (header.schemaVersion !== "vector.archive.v1") {
    throw new Error("VECTOR archive schema is unsupported.");
  }
  const payloadStart = 12 + headerLength;
  const members = new Map<string, Uint8Array>();
  for (const item of header.members) {
    const start = payloadStart + item.offset;
    const end = start + item.byteLength;
    if (start < payloadStart || end > byteLength) {
      throw new Error(`VECTOR record member ${item.path} is truncated.`);
    }
    const bytes = archiveBytes.subarray(start, end);
    if ((await sha256Bytes(bytes)) !== item.sha256) {
      throw new Error(`VECTOR record member ${item.path} failed SHA-256 verification.`);
    }
    if (members.has(item.path)) throw new Error(`Duplicate VECTOR record member ${item.path}.`);
    members.set(item.path, bytes);
  }
  const required = (path: string) => {
    const value = members.get(path);
    if (!value) throw new Error(`Required VECTOR record member ${path} is missing.`);
    return value;
  };
  const manifest = JSON.parse(decoder.decode(required("manifest.json"))) as VectorRecordManifest;
  if (manifest.schemaVersion !== VECTOR_RECORD_SCHEMA) {
    throw new Error("VECTOR record schema is unsupported.");
  }
  const { contentDigest, ...manifestWithoutDigest } = manifest;
  if ((await sha256Bytes(jsonBytes(manifestWithoutDigest))) !== contentDigest) {
    throw new Error("VECTOR record manifest content digest is invalid.");
  }
  for (const item of manifest.members.filter((candidate) => candidate.required)) {
    const archiveItem = header.members.find((candidate) => candidate.path === item.path);
    if (!archiveItem || archiveItem.sha256 !== item.sha256) {
      throw new Error(`Required VECTOR record member ${item.path} does not match its manifest.`);
    }
  }
  const pictureMember = header.members.find((candidate) => candidate.path === "pictures.jsonl");
  if (
    !pictureMember ||
    pictureMember.schemaVersion !== VECTOR_PICTURE_SCHEMA ||
    !manifest.requiredViewerFeatures.includes(VECTOR_PICTURE_SCHEMA)
  ) {
    throw new Error("VECTOR record does not admit the required observer-picture schema.");
  }
  const eventMember = header.members.find((candidate) => candidate.path === "events.jsonl");
  if (
    !eventMember ||
    (eventMember.schemaVersion !== VECTOR_EVENT_SCHEMA &&
      eventMember.schemaVersion !== LEGACY_VECTOR_EVENT_SCHEMA) ||
    !manifest.requiredViewerFeatures.includes(eventMember.schemaVersion)
  ) {
    throw new Error("VECTOR record does not admit a supported simulation-event schema.");
  }
  const scenario = JSON.parse(decoder.decode(required("scenario.json"))) as Scenario;
  const compiled = JSON.parse(decoder.decode(required("compiled.json"))) as Omit<
    PreparedSimulation,
    "scenario"
  >;
  const environmentPack = compiled.engineScenario.geospatial?.environmentPack;
  if (!environmentPack) {
    throw new Error("VECTOR record has no admitted environment pack.");
  }
  assertPhaseAEnvironmentPack(environmentPack);
  const environmentBinding = environmentPackBinding(environmentPack);
  const recordedBinding = compiled.engineScenario.environment?.environmentPack;
  if (
    !recordedBinding ||
    recordedBinding.schemaVersion !== environmentBinding.schemaVersion ||
    recordedBinding.id !== environmentBinding.id ||
    recordedBinding.version !== environmentBinding.version ||
    recordedBinding.digest !== environmentBinding.digest
  ) {
    throw new Error("VECTOR record environment-pack binding is inconsistent.");
  }
  const report = JSON.parse(decoder.decode(required("report.json"))) as RecordReport;
  if (report.schemaVersion !== "vector.report.v1") throw new Error("VECTOR report schema is unsupported.");
  const decodedFrames = decodeColumnarFrames(required("frames.arrow"));
  const pictures = jsonLines<RaspTrack>(required("pictures.jsonl"));
  const events: SimulationEventStream = eventMember.schemaVersion === VECTOR_EVENT_SCHEMA
    ? {
        state: "AVAILABLE",
        schemaVersion: VECTOR_EVENT_SCHEMA,
        items: jsonLines<SimulationEventV2>(required("events.jsonl")),
      }
    : {
        state: "UNAVAILABLE",
        sourceSchemaVersion: LEGACY_VECTOR_EVENT_SCHEMA,
        reason: "LEGACY_EVENT_SCHEMA",
      };
  if (events.state === "AVAILABLE") {
    assertSimulationEventStream(
      events.items,
      decodedFrames,
      compiled.engineScenario,
      report.engine.termination,
    );
  }
  const engineRun: EngineRun = {
    scenario: compiled.engineScenario,
    frames: attachRecordedObserverStates(decodedFrames, pictures),
    events,
    ...report.engine,
  };
  if (
    engineRun.diagnostics.backend !== manifest.backend.selected ||
    compiled.capabilityManifest.engine.id !== manifest.backend.selected ||
    compiled.capabilityManifest.digest !== manifest.deploymentCapabilities.digest
  ) {
    throw new Error("VECTOR record backend provenance is inconsistent.");
  }
  const prepared: PreparedSimulation = { scenario, ...compiled };
  const result = buildSimulationResult(prepared, engineRun, pictures);
  if (
    result.termination !== report.result.termination ||
    result.timeOfFlight !== report.result.timeOfFlight
  ) {
    throw new Error("VECTOR frozen report does not match its recorded frames.");
  }
  return {
    manifest,
    scenario,
    result,
    events,
    pictures,
    report,
  };
}
