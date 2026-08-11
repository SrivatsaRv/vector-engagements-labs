import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("agent harness has one durable workflow authority", async () => {
  const skill = await read(".codex/skills/vector-lab-harness/SKILL.md");

  assert.match(skill, /origin\/main/);
  assert.match(skill, /feat\//);
  assert.match(skill, /stacked/i);
  assert.doesNotMatch(skill, /defect-first review/i);
  assert.doesNotMatch(skill, /git merge-base/);
  assert.doesNotMatch(skill, /release\/x86-runtime/);
  assert.doesNotMatch(skill, /declared integration branch/);

  for (const obsoletePath of [
    ".codex/skills/vector-lab-harness/references/integration.md",
    ".codex/skills/vector-lab-harness/references/testing.md",
    ".codex/skills/vector-lab-harness/references/workstreams.md",
    ".codex/skills/vector-lab-harness/scripts/context-slice.sh",
  ]) {
    await assert.rejects(access(new URL(obsoletePath, root)), { code: "ENOENT" });
  }
});

test("agent harness preserves hot reload and scopes container cleanup", async () => {
  const skill = await read(".codex/skills/vector-lab-harness/SKILL.md");

  assert.match(skill, /hot reload/i);
  assert.match(skill, /docker compose.*--remove-orphans/i);
  assert.match(skill, /docker image ls/i);
  assert.match(skill, /Never run `docker system prune`/);
});
