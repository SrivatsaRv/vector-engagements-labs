const TILE_MAX_ZOOM = 16;

function tileCoordinate(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const z = tileCoordinate(url.searchParams.get("z"));
  const x = tileCoordinate(url.searchParams.get("x"));
  const y = tileCoordinate(url.searchParams.get("y"));
  if (z === null || x === null || y === null || z > TILE_MAX_ZOOM) {
    return Response.json({ error: "invalid tile coordinate" }, { status: 400 });
  }
  const tileLimit = 2 ** z;
  if (x >= tileLimit || y >= tileLimit) {
    return Response.json({ error: "tile coordinate outside zoom extent" }, { status: 400 });
  }

  const upstream = await fetch(
    // CARTO serves the same public tile over HTTP. Using it here avoids a
    // workerd-local CA-store failure while the browser still receives the
    // tile through VECTOR's same-origin HTTPS/HTTP boundary.
    `http://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}@2x.png`,
    { headers: { accept: "image/png" } },
  );
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "basemap tile unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "x-vector-basemap": "carto-positron",
    },
  });
}
