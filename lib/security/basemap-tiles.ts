import { incrementCounter, observeHistogram } from "@/lib/observability/metrics";
import { PublicApiError } from "./public-api";

export const BASEMAP_TILE_CACHE_SCHEMA = "vector-basemap-tile.v2";
export const BASEMAP_TILE_REVISION = "osm-derived-v1";
export const BASEMAP_TILE_TTL_MS = 24 * 60 * 60 * 1000;
export const BASEMAP_TILE_TIMEOUT_MS = 3_000;
export const BASEMAP_TILE_MAX_BYTES = 4 * 1024 * 1024;
export const BASEMAP_TILE_MAX_ENTRIES = 512;
export const BASEMAP_TILE_MAX_ZOOM = 16;

export type BasemapTileMode = "minimal" | "standard" | "tactical";

export type CanonicalBasemapTile = Readonly<{
  schema: typeof BASEMAP_TILE_CACHE_SCHEMA;
  revision: typeof BASEMAP_TILE_REVISION;
  mode: BasemapTileMode;
  z: number;
  x: number;
  y: number;
}>;

export type TileCache = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<void>;
};

export type BasemapTileDependencies = {
  cache: TileCache;
  fetch: typeof fetch;
  now: () => number;
};

const allowedKeys = new Set(["revision", "mode", "z", "x", "y"]);
const allowedModes = new Set<BasemapTileMode>(["minimal", "standard", "tactical"]);
const inFlight = new Map<string, Promise<Response>>();

function invalidTile() {
  return new PublicApiError(400, "invalid_tile_request");
}

function strictInteger(value: string | undefined) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) throw invalidTile();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidTile();
  return parsed;
}

/** Parse the public query boundary once; no URL spelling becomes cache identity. */
export function parseCanonicalBasemapTile(url: URL): CanonicalBasemapTile {
  // Percent-encoded keys or values are not an alternate public serialization.
  if (url.search.includes("%")) throw invalidTile();
  const rawFields = url.search.slice(1).split("&");
  if (rawFields.length !== allowedKeys.size || rawFields.some((field) => !/^[a-z]+=[^=&]+$/.test(field))) {
    throw invalidTile();
  }
  const values = new Map<string, string>();
  for (const [key, value] of url.searchParams) {
    if (!allowedKeys.has(key) || value.length === 0 || values.has(key)) throw invalidTile();
    values.set(key, value);
  }
  if (values.size !== allowedKeys.size) throw invalidTile();
  if (values.get("revision") !== BASEMAP_TILE_REVISION) throw invalidTile();
  const mode = values.get("mode");
  if (!mode || !allowedModes.has(mode as BasemapTileMode)) throw invalidTile();
  const z = strictInteger(values.get("z"));
  const x = strictInteger(values.get("x"));
  const y = strictInteger(values.get("y"));
  const coordinateLimit = 2 ** z;
  if (z > BASEMAP_TILE_MAX_ZOOM || x >= coordinateLimit || y >= coordinateLimit) throw invalidTile();
  return {
    schema: BASEMAP_TILE_CACHE_SCHEMA,
    revision: BASEMAP_TILE_REVISION,
    mode: mode as BasemapTileMode,
    z,
    x,
    y,
  };
}

export function basemapTileCacheKey(tile: CanonicalBasemapTile) {
  return `${tile.schema}/${tile.revision}/${tile.mode}/${tile.z}/${tile.x}/${tile.y}`;
}

export function basemapTileUpstreamUrl(tile: CanonicalBasemapTile) {
  return `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
}

function freshCachedResponse(cached: Response, now: number) {
  const expiresAt = Number(cached.headers.get("x-vector-cache-expires-at"));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return undefined;
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: new Headers(cached.headers) });
}

async function readBoundedImage(response: Response) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const declaredLength = Number(response.headers.get("content-length"));
  if (!response.ok || !response.body || (contentType !== "image/png" && contentType !== "image/webp") ||
      (Number.isFinite(declaredLength) && declaredLength > BASEMAP_TILE_MAX_BYTES)) {
    throw new PublicApiError(502, "basemap_tile_unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BASEMAP_TILE_MAX_BYTES) throw new PublicApiError(502, "basemap_tile_unavailable");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, contentType };
}

function responseFor(tile: CanonicalBasemapTile, body: Uint8Array, contentType: string, now: number) {
  return new Response(new Uint8Array(body).buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, s-maxage=86400",
      "x-vector-basemap": tile.mode,
      "x-vector-cache-schema": tile.schema,
      "x-vector-cache-expires-at": String(now + BASEMAP_TILE_TTL_MS),
      "x-content-type-options": "nosniff",
    },
  });
}

async function loadMiss(tile: CanonicalBasemapTile, key: string, dependencies: BasemapTileDependencies) {
  try {
    const upstream = await dependencies.fetch(basemapTileUpstreamUrl(tile), {
      headers: { accept: "image/png,image/webp", "user-agent": "VECTOR-Engagement-Labs/0.1 (reachdefence.com)" },
      signal: AbortSignal.timeout(BASEMAP_TILE_TIMEOUT_MS),
    });
    const { body, contentType } = await readBoundedImage(upstream);
    const response = responseFor(tile, body, contentType, dependencies.now());
    // Cache is an optimization. Rate limiting, canonical admission, and upstream
    // bounds remain authoritative when an edge cache adapter is unavailable.
    try { await dependencies.cache.put(key, response.clone()); } catch { /* bounded uncached response */ }
    return response;
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(502, "basemap_tile_unavailable");
  }
}

/** Fetch a tile through a bounded, versioned cache identity. */
export async function serveBasemapTile(request: Request, dependencies: BasemapTileDependencies) {
  const startedAt = dependencies.now();
  let outcome: "hit" | "miss" | "rejected" | "error" = "error";
  try {
    const tile = parseCanonicalBasemapTile(new URL(request.url));
    const key = basemapTileCacheKey(tile);
    let cached: Response | undefined;
    try { cached = await dependencies.cache.match(key); } catch { cached = undefined; }
    const fresh = cached && freshCachedResponse(cached, dependencies.now());
    if (fresh) {
      outcome = "hit";
      return fresh;
    }
    if (cached) {
      try { await dependencies.cache.delete(key); } catch { /* stale cache cannot block bounded relay */ }
    }
    outcome = "miss";
    const pending = inFlight.get(key) ?? loadMiss(tile, key, dependencies);
    inFlight.set(key, pending);
    try {
      const response = await pending;
      return response.clone();
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 400) outcome = "rejected";
    throw error;
  } finally {
    incrementCounter("vector_basemap_tile_requests_total", { outcome });
    observeHistogram("vector_basemap_tile_duration_seconds", Math.max(0, dependencies.now() - startedAt) / 1000, { outcome });
  }
}

class MemoryTileCache implements TileCache {
  private readonly entries = new Map<string, Response>();

  constructor(private readonly maximumEntries: number) {}

  async match(key: string) { return this.entries.get(key)?.clone(); }
  async put(key: string, response: Response) {
    this.entries.delete(key);
    this.entries.set(key, response.clone());
    while (this.entries.size > this.maximumEntries) this.entries.delete(this.entries.keys().next().value!);
  }
  async delete(key: string) { this.entries.delete(key); }
}

export function createBoundedBasemapTileCache(maximumEntries = BASEMAP_TILE_MAX_ENTRIES): TileCache {
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > BASEMAP_TILE_MAX_ENTRIES) {
    throw new RangeError("invalid basemap cache capacity");
  }
  return new MemoryTileCache(maximumEntries);
}

const nodeCache = createBoundedBasemapTileCache();

function cloudflareCache(): TileCache | null {
  try {
    const cache = (caches as CacheStorage & { default: Cache }).default;
    return {
      match: async (key) => cache.match(new Request(`https://vector-cache.invalid/${key}`)),
      put: async (key, response) => cache.put(new Request(`https://vector-cache.invalid/${key}`), response),
      delete: async (key) => { await cache.delete(new Request(`https://vector-cache.invalid/${key}`)); },
    };
  } catch { return null; }
}

export function runtimeBasemapTileDependencies(): BasemapTileDependencies {
  return { cache: cloudflareCache() ?? nodeCache, fetch, now: Date.now };
}
