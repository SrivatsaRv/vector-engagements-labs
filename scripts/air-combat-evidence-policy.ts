import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

export type GeneratedAirCombatEvidence<TSignature> = {
  filename: string;
  byteLength: number;
  archiveBytes: Buffer;
  signature: TSignature;
};

type EvidenceInventory = {
  artifacts: Array<{ filename: string }>;
};

export function verifyAirCombatEvidenceDirectory<TSignature>({
  directory,
  inventory,
  generated,
  signatureOf,
}: {
  directory: string;
  inventory: EvidenceInventory;
  generated: GeneratedAirCombatEvidence<TSignature>[];
  signatureOf: (archiveBytes: Buffer) => TSignature;
}) {
  const trackedInventory = JSON.parse(
    readFileSync(resolve(directory, "air-combat-study-evidence.json"), "utf8"),
  ) as unknown;
  assert.deepEqual(
    trackedInventory,
    inventory,
    "Tracked issue #197 evidence inventory is missing or stale; regenerate it with --write-air-combat-evidence.",
  );
  const expectedFiles = [
    "air-combat-study-evidence.json",
    ...inventory.artifacts.map(({ filename }) => filename),
  ].sort();
  assert.deepEqual(
    readdirSync(directory).sort(),
    expectedFiles,
    "Tracked issue #197 evidence directory must contain exactly the governed inventory and four VSRs.",
  );
  for (const artifact of generated) {
    const archiveBytes = readFileSync(resolve(directory, artifact.filename));
    assert.equal(
      archiveBytes.byteLength,
      artifact.byteLength,
      `Tracked issue #197 evidence ${artifact.filename} has a stale byte length.`,
    );
    assert.deepEqual(
      signatureOf(archiveBytes),
      artifact.signature,
      `Tracked issue #197 evidence ${artifact.filename} is semantically stale.`,
    );
  }
}

export function publishOrVerifyAirCombatEvidence<TSignature>({
  trackedDirectory,
  evidenceDirectory,
  inventory,
  generated,
  signatureOf,
}: {
  trackedDirectory: string;
  evidenceDirectory?: string;
  inventory: EvidenceInventory;
  generated: GeneratedAirCombatEvidence<TSignature>[];
  signatureOf: (archiveBytes: Buffer) => TSignature;
}): "written" | "verified" {
  if (evidenceDirectory) {
    assert.notEqual(
      resolve(evidenceDirectory),
      resolve(trackedDirectory),
      "Write mode requires an explicit staging directory; replace tracked evidence only after verification.",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    assert.deepEqual(
      readdirSync(evidenceDirectory),
      [],
      "Evidence staging directory must be empty before regeneration.",
    );
    for (const artifact of generated) {
      assert.equal(artifact.archiveBytes.byteLength, artifact.byteLength);
      assert.deepEqual(signatureOf(artifact.archiveBytes), artifact.signature);
      writeFileSync(resolve(evidenceDirectory, artifact.filename), artifact.archiveBytes);
    }
    writeFileSync(
      resolve(evidenceDirectory, "air-combat-study-evidence.json"),
      `${JSON.stringify(inventory, null, 2)}\n`,
    );
    return "written";
  }
  verifyAirCombatEvidenceDirectory({
    directory: trackedDirectory,
    inventory,
    generated,
    signatureOf,
  });
  return "verified";
}
