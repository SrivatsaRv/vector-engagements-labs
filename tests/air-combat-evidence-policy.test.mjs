import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { publishOrVerifyAirCombatEvidence } from "../scripts/air-combat-evidence-policy.ts";

const signatureOf = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("explicit evidence staging bypasses stale tracked equality while normal verification stays strict", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "vector-air-combat-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const trackedDirectory = join(root, "tracked");
  const stagingDirectory = join(root, "staging");
  await mkdir(trackedDirectory);
  const archiveBytes = Buffer.from("generated governed VSR bytes");
  const inventory = {
    schemaVersion: "vector.air-combat-study-evidence.v1",
    artifacts: [{ filename: "study.vector", recordId: "a".repeat(64) }],
  };
  const generated = [{
    filename: "study.vector",
    byteLength: archiveBytes.byteLength,
    archiveBytes,
    signature: signatureOf(archiveBytes),
  }];
  await writeFile(
    join(trackedDirectory, "air-combat-study-evidence.json"),
    `${JSON.stringify({ schemaVersion: inventory.schemaVersion, artifacts: [] })}\n`,
  );
  await writeFile(join(trackedDirectory, "study.vector"), "stale");

  assert.throws(
    () => publishOrVerifyAirCombatEvidence({
      trackedDirectory,
      inventory,
      generated,
      signatureOf,
    }),
    /inventory is missing or stale/,
  );

  assert.equal(
    publishOrVerifyAirCombatEvidence({
      trackedDirectory,
      evidenceDirectory: stagingDirectory,
      inventory,
      generated,
      signatureOf,
    }),
    "written",
  );
  assert.equal(
    publishOrVerifyAirCombatEvidence({
      trackedDirectory: stagingDirectory,
      inventory,
      generated,
      signatureOf,
    }),
    "verified",
  );
  assert.throws(
    () => publishOrVerifyAirCombatEvidence({
      trackedDirectory,
      evidenceDirectory: trackedDirectory,
      inventory,
      generated,
      signatureOf,
    }),
    /explicit staging directory/,
  );

  await copyFile(
    join(stagingDirectory, "air-combat-study-evidence.json"),
    join(trackedDirectory, "air-combat-study-evidence.json"),
  );
  await copyFile(
    join(stagingDirectory, "study.vector"),
    join(trackedDirectory, "study.vector"),
  );
  assert.equal(
    publishOrVerifyAirCombatEvidence({
      trackedDirectory,
      inventory,
      generated,
      signatureOf,
    }),
    "verified",
  );
});
