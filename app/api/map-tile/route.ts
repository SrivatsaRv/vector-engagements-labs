import { publicApiError } from "@/lib/security/public-api";
import { enforceRateLimit } from "@/lib/security/runtime";
import { runtimeBasemapTileDependencies, serveBasemapTile } from "@/lib/security/basemap-tiles";

export async function GET(request: Request) {
  try {
    await enforceRateLimit(request, "TILE_RATE_LIMITER");
    return await serveBasemapTile(request, runtimeBasemapTileDependencies());
  } catch (error) {
    return publicApiError(error, 502);
  }
}
