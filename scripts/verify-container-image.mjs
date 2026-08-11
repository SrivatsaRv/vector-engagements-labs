import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const image = process.env.VECTOR_IMAGE ?? "vector-engagement-lab:0.1.0-dev";
assert.ok(!image.endsWith(":latest"), "latest is not an admitted image tag");

const [inspection] = JSON.parse(
  execFileSync("docker", ["image", "inspect", image], { encoding: "utf8" }),
);

assert.equal(inspection.Config.User, "node", "runtime image must be non-root");
assert.deepEqual(
  inspection.Config.Cmd,
  ["node", "dist/runtime/start-production.mjs"],
  "runtime image must execute the production server directly",
);
for (const label of [
  "org.opencontainers.image.source",
  "org.opencontainers.image.version",
  "org.opencontainers.image.revision",
  "org.opencontainers.image.licenses",
]) {
  assert.ok(inspection.Config.Labels?.[label], `runtime image is missing ${label}`);
}

execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "--entrypoint",
    "node",
    image,
    "-e",
    "const f=require('node:fs');for(const p of ['dist/runtime/start-production.mjs','dist/server/node-postgres.mjs','dist/admin/migrate-db.mjs','dist/admin/seed-db.mjs'])if(!f.existsSync(p))throw Error('missing '+p);if(f.existsSync('node_modules'))throw Error('runtime node_modules must not be shipped')",
  ],
  { stdio: "inherit" },
);

process.stdout.write(
  `verified ${image} (${inspection.Os}/${inspection.Architecture}, ${inspection.Id})\n`,
);
