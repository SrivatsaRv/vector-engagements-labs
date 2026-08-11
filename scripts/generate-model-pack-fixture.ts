import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileModelPack } from "../lib/model-pack.ts";
import { createCurrentModelPackSource } from "../lib/reference-model-pack.ts";

const outputPath = resolve("fixtures/model-packs/vector-scalar-study-v0.6.compiled.json");
const bundle = await compileModelPack(createCurrentModelPackSource());
const output = `${JSON.stringify(bundle, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== output) throw new Error(`Generated model-pack fixture is stale: ${outputPath}`);
  process.stdout.write(`verified ${bundle.pack.digest}\n`);
} else {
  await mkdir(resolve("fixtures/model-packs"), { recursive: true });
  await writeFile(outputPath, output);
  process.stdout.write(`generated ${bundle.pack.digest}\n`);
}
