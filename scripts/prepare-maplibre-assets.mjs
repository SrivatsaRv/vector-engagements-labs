import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(repositoryRoot, "node_modules/maplibre-gl/dist");
const outputDirectory = resolve(repositoryRoot, "public/vendor/maplibre");
const assets = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(outputDirectory, { recursive: true });

for (const asset of assets) {
  copyFileSync(resolve(sourceDirectory, asset), resolve(outputDirectory, asset));
}

console.log(`prepared ${assets.length} MapLibre worker assets`);
