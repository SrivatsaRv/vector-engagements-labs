import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = "governance/environment-sources/nasa-power-hourly-20200115";
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.v1.json"), "utf8"));

if (manifest.schemaVersion !== "vector.environment-source-manifest.v1") {
  throw new Error("Unsupported environment source manifest schema.");
}
if (manifest.coverage?.kind !== "POINT_ONLY" || manifest.coverage?.areaAdmission !== "INELIGIBLE") {
  throw new Error("Committed point source must remain ineligible for an area environment pack.");
}
if (manifest.verticalDatum !== "UNDECLARED") {
  throw new Error("Committed POWER point source must not invent a vertical datum.");
}
for (const artifact of manifest.artifacts ?? []) {
  const bytes = readFileSync(resolve(directory, artifact.path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== artifact.sha256) {
    throw new Error(`Environment source artifact ${artifact.id} digest mismatch: expected ${artifact.sha256}, received ${actual}.`);
  }
  const response = JSON.parse(bytes.toString("utf8"));
  if (response.header?.time_standard !== "UTC" || response.header?.api?.version !== manifest.request.apiVersion) {
    throw new Error(`Environment source artifact ${artifact.id} metadata differs from its manifest.`);
  }
}
process.stdout.write(JSON.stringify({ id: manifest.id, version: manifest.version, artifacts: manifest.artifacts.length, coverage: manifest.coverage.kind }) + "\n");
