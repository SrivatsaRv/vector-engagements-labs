export type VectorBasemap = "STANDARD" | "MINIMAL" | "TACTICAL";

export const VECTOR_BASEMAP_STORAGE_KEY = "vector.map.basemap.v1";

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
  const source = (mode: Lowercase<VectorBasemap>, attribution: string) => ({
    type: "raster" as const,
    tiles: [`/api/map-tile?mode=${mode}&z={z}&x={x}&y={y}`],
    tileSize: 512,
    attribution,
  });
  return {
    version: 8 as const,
    sources: {
      vectorStandard: source("standard", "© OpenStreetMap contributors"),
      vectorMinimal: source("minimal", "© OpenStreetMap contributors © CARTO"),
      vectorTactical: source("tactical", "© OpenStreetMap contributors © CARTO"),
    },
    layers: [
      {
        id: "basemap-standard",
        type: "raster" as const,
        source: "vectorStandard",
        layout: { visibility: active === "STANDARD" ? "visible" as const : "none" as const },
      },
      {
        id: "basemap-minimal",
        type: "raster" as const,
        source: "vectorMinimal",
        layout: { visibility: active === "MINIMAL" ? "visible" as const : "none" as const },
      },
      {
        id: "basemap-tactical",
        type: "raster" as const,
        source: "vectorTactical",
        layout: { visibility: active === "TACTICAL" ? "visible" as const : "none" as const },
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

