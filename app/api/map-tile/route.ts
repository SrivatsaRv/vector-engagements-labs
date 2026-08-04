import { publicApiError, PublicApiError } from "@/lib/security/public-api";
import { enforceRateLimit } from "@/lib/security/runtime";

const TILE_MAX_ZOOM = 16;
const TILE_TIMEOUT_MS = 3_000;

function tileCoordinate(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function cacheMatch(request: Request) {
  try { return await (caches as CacheStorage & { default: Cache }).default.match(request); } catch { return undefined; }
}

async function cachePut(request: Request, response: Response) {
  try { await (caches as CacheStorage & { default: Cache }).default.put(request, response); } catch { /* Node/local cache is optional. */ }
}

export async function GET(request: Request) {
  try {
    await enforceRateLimit(request, "TILE_RATE_LIMITER");
    const url = new URL(request.url);
    const requestedMode = url.searchParams.get("mode") ?? "minimal";
    const mode = requestedMode === "standard" || requestedMode === "tactical" || requestedMode === "minimal"
      ? requestedMode
      : null;
    const z = tileCoordinate(url.searchParams.get("z"));
    const x = tileCoordinate(url.searchParams.get("x"));
    const y = tileCoordinate(url.searchParams.get("y"));
    if (!mode || z === null || x === null || y === null || z > TILE_MAX_ZOOM) {
      throw new PublicApiError(400, "invalid_tile_coordinate");
    }
    const tileLimit = 2 ** z;
    if (x >= tileLimit || y >= tileLimit) throw new PublicApiError(400, "invalid_tile_coordinate");

    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cacheMatch(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: new Headers(cached.headers),
      });
    }

    const upstreamUrl = mode === "standard"
      ? `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
      : `https://a.basemaps.cartocdn.com/${mode === "tactical" ? "dark_all" : "light_all"}/${z}/${x}/${y}@2x.png`;
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: "image/png,image/webp", "user-agent": "VECTOR-Engagement-Labs/0.1 (reachdefence.com)" },
      signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !upstream.body || !contentType.startsWith("image/")) {
      throw new PublicApiError(502, "basemap_tile_unavailable");
    }
    const response = new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400, s-maxage=604800",
        "x-vector-basemap": mode,
        "x-content-type-options": "nosniff",
      },
    });
    await cachePut(cacheKey, response.clone());
    return response;
  } catch (error) {
    return publicApiError(error, 502);
  }
}
