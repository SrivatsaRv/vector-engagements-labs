import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MIGRATION_NAME = /^(\d{3})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export async function loadMigrationManifest(directory) {
  const root = resolve(directory);
  const names = (await readdir(root))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  invariant(names.length > 0, "The repository migration manifest is empty.");
  const manifest = [];
  for (const [index, name] of names.entries()) {
    const match = name.match(MIGRATION_NAME);
    invariant(match, `Migration ${name} does not use the required NNN_name.sql format.`);
    const expectedOrdinal = index + 1;
    invariant(
      Number(match[1]) === expectedOrdinal,
      `Migration ${name} is out of sequence; expected ordinal ${String(expectedOrdinal).padStart(3, "0")}.`,
    );
    const body = await readFile(resolve(root, name));
    manifest.push({
      name,
      checksum: createHash("sha256").update(body).digest("hex"),
    });
  }
  return manifest;
}

export function verifyMigrationLedger(expectedMigrations, appliedMigrations) {
  invariant(Array.isArray(expectedMigrations), "Expected migrations must be an array.");
  invariant(Array.isArray(appliedMigrations), "Applied migrations must be an array.");
  invariant(expectedMigrations.length > 0, "The repository migration manifest is empty.");
  invariant(
    appliedMigrations.length <= expectedMigrations.length,
    `The database migration ledger has ${appliedMigrations.length} entries, but the admitted revision knows only ${expectedMigrations.length}.`,
  );

  const expectedNames = new Set();
  for (const [index, migration] of expectedMigrations.entries()) {
    invariant(typeof migration?.name === "string" && MIGRATION_NAME.test(migration.name), `Expected migration at index ${index} has an invalid name.`);
    invariant(typeof migration?.checksum === "string" && SHA256.test(migration.checksum), `Expected migration ${migration?.name ?? index} has an invalid checksum.`);
    invariant(!expectedNames.has(migration.name), `Expected migration ${migration.name} is duplicated.`);
    const ordinal = Number(migration.name.slice(0, 3));
    invariant(
      ordinal === index + 1,
      `Expected migration ${migration.name} is out of sequence at position ${index + 1}.`,
    );
    expectedNames.add(migration.name);
  }

  const appliedNames = new Set();
  for (const [index, applied] of appliedMigrations.entries()) {
    invariant(typeof applied?.name === "string", `Applied migration at index ${index} has no name.`);
    invariant(typeof applied?.checksum === "string", `Applied migration ${applied?.name ?? index} has no checksum.`);
    invariant(SHA256.test(applied.checksum), `Applied migration ${applied.name} has an invalid checksum.`);
    invariant(!appliedNames.has(applied.name), `Applied migration ${applied.name} is duplicated.`);
    appliedNames.add(applied.name);

    const expected = expectedMigrations[index];
    if (!expectedNames.has(applied.name)) {
      throw new Error(`The database migration ledger contains unknown migration ${applied.name}.`);
    }
    if (applied.name !== expected.name) {
      throw new Error(
        `The database migration ledger is not a contiguous prefix: expected ${expected.name} at position ${index + 1}, found ${applied.name}.`,
      );
    }
    if (applied.checksum !== expected.checksum) {
      throw new Error(`Applied migration ${applied.name} checksum does not match the admitted revision.`);
    }
  }

  const pendingMigrations = expectedMigrations.slice(appliedMigrations.length).map(({ name }) => name);
  return {
    state: "COMPATIBLE",
    appliedCount: appliedMigrations.length,
    pendingCount: pendingMigrations.length,
    lastApplied: appliedMigrations.at(-1)?.name ?? null,
    nextPending: pendingMigrations[0] ?? null,
  };
}
