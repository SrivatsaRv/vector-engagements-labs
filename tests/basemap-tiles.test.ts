import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEMAP_TILE_MAX_BYTES,
  BASEMAP_TILE_REVISION,
  basemapTileCacheKey,
  basemapTileUpstreamUrl,
  createBoundedBasemapTileCache,
  parseCanonicalBasemapTile,
  serveBasemapTile,
  type TileCache,
} from "../lib/security/basemap-tiles";
import { PublicApiError } from "../lib/security/public-api";

class FakeCache implements TileCache {
  readonly entries = new Map<string, Response>();
  matches = 0;
  puts = 0;
  deletes = 0;
  async match(key: string) { this.matches += 1; return this.entries.get(key)?.clone(); }
  async put(key: string, response: Response) { this.puts += 1; this.entries.set(key, response.clone()); }
  async delete(key: string) { this.deletes += 1; this.entries.delete(key); }
}

function request(query: string) {
  return new Request(`https://labs.example/api/map-tile?${query}`);
}

function validRequest(query: string) {
  return request(`revision=${BASEMAP_TILE_REVISION}&${query}`);
}

function dependencies(cache = new FakeCache(), now = { value: 1_000 }) {
  let upstreamCalls = 0;
  return {
    cache,
    now,
    get upstreamCalls() { return upstreamCalls; },
    values: {
      cache,
      now: () => now.value,
      fetch: async () => {
        upstreamCalls += 1;
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png", "content-length": "3" },
        });
      },
    },
  };
}

test("equivalent tile tuples use a single cache identity regardless of parameter order", () => {
  const fields = [`revision=${BASEMAP_TILE_REVISION}`, "mode=minimal", "z=3", "x=2", "y=1"];
  const permutations = (values: string[]): string[][] => values.length === 0
    ? [[]]
    : values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]));
  const identities = new Set(permutations(fields).map((items) => basemapTileCacheKey(
    parseCanonicalBasemapTile(new URL(request(items.join("&")).url)),
  )));
  assert.deepEqual(identities, new Set(["vector-basemap-tile.v3/osm-derived-v1/3/2/1"]));
  assert.deepEqual(
    new Set(["minimal", "standard", "tactical"].map((mode) => basemapTileCacheKey(
      parseCanonicalBasemapTile(new URL(validRequest(`mode=${mode}&z=3&x=2&y=1`).url)),
    ))),
    new Set(["vector-basemap-tile.v3/osm-derived-v1/3/2/1"]),
  );
});

test("all governed presentation modes use the key-free OpenStreetMap tile authority", () => {
  for (const mode of ["standard", "minimal", "tactical"] as const) {
    const tile = parseCanonicalBasemapTile(new URL(validRequest(`mode=${mode}&z=3&x=2&y=1`).url));
    assert.equal(basemapTileUpstreamUrl(tile), "https://tile.openstreetmap.org/3/2/1.png");
  }
});

test("unknown, duplicate, encoded, empty, leading-zero, and out-of-range input rejects before cache or upstream", async () => {
  const missingRevision = dependencies();
  await assert.rejects(
    serveBasemapTile(request("mode=minimal&z=3&x=2&y=1"), missingRevision.values),
    (error: unknown) => error instanceof PublicApiError && error.code === "invalid_tile_request",
  );
  assert.equal(missingRevision.upstreamCalls, 0);
  for (const query of [
    "revision=stale&mode=minimal&z=3&x=2&y=1",
    "mode=minimal&z=3&x=2&y=1&debug=true",
    "mode=minimal&mode=tactical&z=3&x=2&y=1",
    "mode=minimal&z=3&x=2&y=1&",
    "mode=minimal&z=03&x=2&y=1",
    "mode=minimal&z=3&x=8&y=1",
    "mode=minimal&z=3&x=2&y=%31",
    "mode=&z=3&x=2&y=1",
  ]) {
    const fixture = dependencies();
    await assert.rejects(
      serveBasemapTile(query.startsWith("revision=") ? request(query) : validRequest(query), fixture.values),
      (error: unknown) => error instanceof PublicApiError && error.code === "invalid_tile_request",
    );
    assert.equal(fixture.cache.matches, 0, query);
    assert.equal(fixture.upstreamCalls, 0, query);
  }
});

test("concurrent identical cache misses use one bounded upstream request", async () => {
  const fixture = dependencies();
  const startedAt = performance.now();
  const modes = Array.from({ length: 128 }, (_, index) =>
    (["minimal", "standard", "tactical"] as const)[index % 3]);
  const responses = await Promise.all(modes.map((mode) =>
    serveBasemapTile(validRequest(`mode=${mode}&z=3&x=2&y=1`), fixture.values)));
  assert.equal(fixture.upstreamCalls, 1);
  assert.equal(fixture.cache.puts, 1);
  assert.ok(performance.now() - startedAt < 1_000, "coalesced local load remains bounded");
  await Promise.all(responses.map(async (response, index) => {
    assert.equal(response.headers.get("x-vector-basemap"), modes[index]);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  }));
});

test("cache expiry uses the declared clock and a cache schema key", async () => {
  const fixture = dependencies();
  await serveBasemapTile(validRequest("mode=standard&z=3&x=2&y=1"), fixture.values);
  await serveBasemapTile(validRequest("y=1&mode=standard&x=2&z=3"), fixture.values);
  assert.equal(fixture.upstreamCalls, 1);
  fixture.now.value += 24 * 60 * 60 * 1000;
  await serveBasemapTile(validRequest("mode=standard&z=3&x=2&y=1"), fixture.values);
  assert.equal(fixture.cache.deletes, 1);
  assert.equal(fixture.upstreamCalls, 2);
});

test("non-images, oversized content, failed upstreams, and timeouts do not enter cache", async () => {
  const cases: Array<Response | Error> = [
    new Response("html", { headers: { "content-type": "text/html" } }),
    new Response(new Uint8Array([1]), { headers: { "content-type": "image/png", "content-length": String(BASEMAP_TILE_MAX_BYTES + 1) } }),
    new Response("failed", { status: 502, headers: { "content-type": "image/png" } }),
    new Error("timed out"),
  ];
  for (const result of cases) {
    const cache = new FakeCache();
    await assert.rejects(
      serveBasemapTile(validRequest("mode=minimal&z=3&x=2&y=1"), {
        cache,
        now: () => 1_000,
        fetch: async () => {
          if (result instanceof Error) throw result;
          return result;
        },
      }),
      (error: unknown) => error instanceof PublicApiError && error.code === "basemap_tile_unavailable",
    );
    assert.equal(cache.puts, 0);
  }
});

test("cache adapters preserve the same response contract in Node and Worker-shaped runtimes", async () => {
  for (const cache of [new FakeCache(), new FakeCache()]) {
    const fixture = dependencies(cache);
    const response = await serveBasemapTile(validRequest("mode=minimal&z=3&x=2&y=1"), fixture.values);
    assert.equal(response.headers.get("x-vector-cache-schema"), "vector-basemap-tile.v3");
    assert.equal(response.headers.get("x-vector-basemap"), "minimal");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
});

test("a failing cache adapter does not bypass canonical bounds or block a valid bounded upstream response", async () => {
  const unavailableCache: TileCache = {
    match: async () => { throw new Error("cache unavailable"); },
    put: async () => { throw new Error("cache unavailable"); },
    delete: async () => { throw new Error("cache unavailable"); },
  };
  let upstreamCalls = 0;
  const values = {
    cache: unavailableCache,
    now: () => 1_000,
    fetch: async () => {
      upstreamCalls += 1;
      return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
    },
  };
  const response = await serveBasemapTile(validRequest("mode=minimal&z=3&x=2&y=1"), values);
  assert.equal(response.status, 200);
  assert.equal(upstreamCalls, 1);
  await assert.rejects(serveBasemapTile(validRequest("mode=minimal&z=3&x=2&y=1&extra=1"), values));
  assert.equal(upstreamCalls, 1);
});

test("the Node cache has a declared bounded capacity", async () => {
  const cache = createBoundedBasemapTileCache(3);
  for (const key of ["first", "second", "third", "fourth"]) {
    await cache.put(key, new Response(key, { headers: { "x-vector-cache-expires-at": "999999" } }));
  }
  assert.equal(await cache.match("first"), undefined);
  assert.equal(await (await cache.match("fourth"))?.text(), "fourth");
  assert.throws(() => createBoundedBasemapTileCache(513), /invalid basemap cache capacity/);
});
