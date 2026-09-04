import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checkOnly = process.argv.includes("--check");
const write = process.argv.includes("--write");
if (checkOnly === write) throw new Error("Pass exactly one of --write or --check.");
if (process.argv.slice(2).some((argument) => !["--check", "--write"].includes(argument))) {
  throw new Error("Unknown argument.");
}

// Migration 017 is published history. Later scenario-library versions must be
// introduced by a forward migration and may never regenerate these bytes.
const migrationPath = resolve("db/migrations/017_weapon_termination_model.sql");
const frozenDigest = "85813006e7990bfcd993bcb3502decfc17770433c34a6bbb5b6dd82763d66d99";
const actualDigest = createHash("sha256")
  .update(readFileSync(migrationPath))
  .digest("hex");
if (actualDigest !== frozenDigest) {
  throw new Error(`Frozen migration 017 identity drifted: ${actualDigest}.`);
}
if (write) {
  throw new Error("Migration 017 is frozen; publish scenario changes in a forward migration.");
}
process.stdout.write(`verified frozen weapon termination migration ${actualDigest}\n`);
