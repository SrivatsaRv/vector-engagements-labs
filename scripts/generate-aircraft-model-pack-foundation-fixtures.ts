import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  InMemoryModelPackRepository,
  compileGovernedModelPack,
} from "../lib/model-pack.ts";
import { createAnonymousGovernedPublication } from "./lib/anonymous-model-pack-foundation.ts";

const check = process.argv.includes("--check");
const definitions = [
  { id: "anonymous-pack-alpha", thrustDelta: 0 },
  { id: "anonymous-pack-bravo", thrustDelta: 25 },
] as const;

for (const definition of definitions) {
  const input = await createAnonymousGovernedPublication(definition.id, definition.thrustDelta);
  const bundle = await compileGovernedModelPack(input);
  const repository = new InMemoryModelPackRepository();
  await repository.publishBatch([{ ...input, bundle }]);
  const archive = await repository.exportResearch([{
    id: bundle.pack.id,
    version: bundle.pack.version,
    digest: bundle.pack.digest,
  }]);
  const output = `${JSON.stringify(archive, null, 2)}\n`;
  const path = resolve(`fixtures/model-packs/${definition.id}.governed.v2.json`);
  if (check) {
    const existing = await readFile(path, "utf8");
    if (existing !== output) throw new Error(`Generated anonymous governed pack fixture is stale: ${path}`);
  } else {
    await writeFile(path, output);
  }
  process.stdout.write(`${check ? "verified" : "wrote"} ${path} ${bundle.pack.digest}\n`);
}
