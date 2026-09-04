import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readBytes = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("the built Worker preserves the governed Cloudflare packaging contract", async () => {
  const config = JSON.parse(await read("dist/server/wrangler.json"));

  assert.equal(config.name, "vector-engagement-labs");
  assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
  assert.deepEqual(config.assets, {
    binding: "ASSETS",
    directory: "../client",
    not_found_handling: "none",
  });
  assert.deepEqual(config.observability, { enabled: true });
  assert.equal(config.hyperdrive?.length, 1);
  assert.equal(config.hyperdrive[0].binding, "HYPERDRIVE");
  assert.match(config.hyperdrive[0].id, /^[0-9a-f]{32}$/);
  if (process.env.CLOUDFLARE_HYPERDRIVE_ID) {
    assert.equal(config.hyperdrive[0].id, process.env.CLOUDFLARE_HYPERDRIVE_ID);
  }
  assert.deepEqual(
    config.ratelimits?.map(({ name, namespace_id }) => ({ name, namespace_id })),
    [
      { name: "PUBLIC_API_RATE_LIMITER", namespace_id: "22001" },
      { name: "BROWSER_TELEMETRY_RATE_LIMITER", namespace_id: "22003" },
      { name: "TILE_RATE_LIMITER", namespace_id: "22002" },
    ],
  );
  if (process.env.VECTOR_PRODUCTION_HOST) {
    assert.deepEqual(config.routes, [
      { pattern: process.env.VECTOR_PRODUCTION_HOST, custom_domain: true },
    ]);
    assert.equal(config.vars?.METRICS_BEARER_TOKEN, undefined);
  } else {
    assert.ok(
      config.routes?.every((route) => route.custom_domain === true),
      "every emitted route must remain a custom-domain route",
    );
  }

  for (const asset of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
    assert.deepEqual(
      await readBytes(`dist/client/vendor/maplibre/${asset}`),
      await readBytes(`node_modules/maplibre-gl/dist/${asset}`),
      `${asset} must be prepared before Vinext's internal deploy build`,
    );
  }
});
