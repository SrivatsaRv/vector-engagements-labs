export type VectorBasemap = "STANDARD" | "MINIMAL" | "TACTICAL";

export const VECTOR_BASEMAP_STORAGE_KEY = "vector.map.basemap.v1";
export const VECTOR_BASEMAP_TILE_REVISION = "osm-derived-v1";

export function readVectorBasemap(): VectorBasemap {
  if (typeof window === "undefined") return "MINIMAL";
  const stored = window.localStorage.getItem(VECTOR_BASEMAP_STORAGE_KEY);
  return stored === "STANDARD" || stored === "TACTICAL" || stored === "MINIMAL"
    ? stored
    : "MINIMAL";
}

export function writeVectorBasemap(value: VectorBasemap) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VECTOR_BASEMAP_STORAGE_KEY, value);
  }
}

export function buildVectorMapStyle(active: VectorBasemap) {
  const source = (mode: Lowercase<VectorBasemap>) => ({
    type: "raster" as const,
    tiles: [`/api/map-tile?revision=${VECTOR_BASEMAP_TILE_REVISION}&mode=${mode}&z={z}&x={x}&y={y}`],
    tileSize: 256,
    attribution: "© OpenStreetMap contributors",
  });
  return {
    version: 8 as const,
    sources: {
      vectorStandard: source("standard"),
      vectorMinimal: source("minimal"),
      vectorTactical: source("tactical"),
    },
    layers: [
      {
        id: "basemap-standard",
        type: "raster" as const,
        source: "vectorStandard",
        layout: { visibility: active === "STANDARD" ? "visible" as const : "none" as const },
        paint: { "raster-opacity": 1 },
      },
      {
        id: "basemap-minimal",
        type: "raster" as const,
        source: "vectorMinimal",
        layout: { visibility: active === "MINIMAL" ? "visible" as const : "none" as const },
        paint: {
          "raster-saturation": -0.72,
          "raster-contrast": -0.14,
          "raster-brightness-min": 0.12,
          "raster-brightness-max": 0.96,
          "raster-opacity": 0.84,
        },
      },
      {
        id: "basemap-tactical",
        type: "raster" as const,
        source: "vectorTactical",
        layout: { visibility: active === "TACTICAL" ? "visible" as const : "none" as const },
        paint: {
          "raster-saturation": -0.82,
          "raster-contrast": 0.2,
          "raster-brightness-min": 0.02,
          "raster-brightness-max": 0.48,
          "raster-opacity": 0.9,
        },
      },
    ],
  };
}

export function setVectorBasemapVisibility(
  map: import("maplibre-gl").Map,
  active: VectorBasemap,
) {
  for (const mode of ["STANDARD", "MINIMAL", "TACTICAL"] as const) {
    const id = `basemap-${mode.toLowerCase()}`;
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", active === mode ? "visible" : "none");
    }
  }
}
