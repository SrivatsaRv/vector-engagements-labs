import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const personas = [
  {
    name: "vector-staff-engineer",
    authority: "architecture",
  },
  {
    name: "vector-simulation-systems-engineer",
    authority: "causal",
  },
  {
    name: "vector-3d-frontend-engineer",
    authority: "canonical",
  },
  {
    name: "vector-verification-performance-engineer",
    authority: "independent",
  },
];

for (const persona of personas) {
  test(`${persona.name} has a valid project contract and explicit invocation`, async () => {
    const root = new URL(`../.codex/skills/${persona.name}/`, import.meta.url);
    const skill = await readFile(new URL("SKILL.md", root), "utf8");
    const metadata = await readFile(new URL("agents/openai.yaml", root), "utf8");

    assert.match(skill, new RegExp(`^---\\nname: ${persona.name}\\n`, "m"));
    assert.match(skill, /^description: .+Use for .+\.$/m);
    assert.match(skill, /\[\$vector-lab-harness\]/);
    assert.match(skill.toLowerCase(), new RegExp(persona.authority));
    assert.doesNotMatch(skill, /\[TODO|Structuring This Skill/);
    assert.match(metadata, new RegExp(`\\$${persona.name}\\b`));
    assert.match(metadata, /display_name: "VECTOR /);
  });
}

test("the harness routes all personas and does not pin a retired release train", async () => {
  const harness = await readFile(
    new URL("../.codex/skills/vector-lab-harness/SKILL.md", import.meta.url),
    "utf8",
  );
  const integration = await readFile(
    new URL(
      "../.codex/skills/vector-lab-harness/references/integration.md",
      import.meta.url,
    ),
    "utf8",
  );

  for (const persona of personas) {
    assert.match(harness, new RegExp(`\\$${persona.name}\\b`));
  }

  assert.doesNotMatch(harness, /release\/x86-runtime/);
  assert.doesNotMatch(integration, /release\/x86-runtime/);
  assert.match(integration, /Use `main` when no active release train is declared/);
});
