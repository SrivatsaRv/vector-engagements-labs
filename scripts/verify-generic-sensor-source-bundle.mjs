#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import sharp from "sharp";

import { sha256, verifyGenericSensorSourceBundle } from "./lib/generic-sensor-source-verifier.mjs";

const root = resolve("governance/generic-sensor-verification-sources");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.v1.json"), "utf8"));
const inspection = JSON.parse(readFileSync(resolve(root, manifest.visualInspection.path), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "vector-generic-sensor-visual-"));
let verifiedPages = 0;

function fail(message) {
  throw new Error(`generic sensor machine visual verification failed: ${message}`);
}

function exactArtifact(artifact) {
  const bytes = readFileSync(resolve(root, artifact.path));
  if (bytes.length !== artifact.sizeBytes || sha256(bytes) !== artifact.sha256) fail(`artifact identity changed: ${artifact.path}`);
  return bytes;
}

const versionResult = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });
const version = `${versionResult.stdout ?? ""}${versionResult.stderr ?? ""}`;
if (versionResult.error || versionResult.status !== 0 || !version.includes(manifest.renderRecipe.sourceRender.version)) fail("pdftoppm is unavailable or has the wrong version");

try {
  for (const source of manifest.sources.filter((candidate) => candidate.publisher === "NASA")) {
    const pdf = source.artifacts.find((artifact) => artifact.role === "SOURCE_PDF");
    exactArtifact(pdf);
    for (const page of source.renderPages) {
      const prefix = join(scratch, `${source.ntrsId}-${String(page.sourcePdfPage).padStart(3, "0")}`);
      execFileSync("pdftoppm", ["-r", String(manifest.renderRecipe.sourceRender.dpi), "-gray", "-f", String(page.sourcePdfPage), "-l", String(page.sourcePdfPage), "-singlefile", "-png", resolve(root, pdf.path), prefix], { stdio: "ignore" });
      const reproduced = readFileSync(`${prefix}.png`);
      const frozen = exactArtifact(page.sourceRender);
      if (!reproduced.equals(frozen)) fail(`source render is not an exact independent reproduction: ${page.sourceRender.path}`);
      const image = sharp(frozen, { limitInputPixels: 60_000_000 });
      const [metadata, statistics] = await Promise.all([image.metadata(), image.stats()]);
      if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width * metadata.height < 100_000 || statistics.channels.every((channel) => channel.min === channel.max)) fail(`render is blank or structurally invalid: ${page.sourceRender.path}`);
      if (page.displayRender) {
        const display = await sharp(frozen).rotate(90).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
        if (!display.equals(exactArtifact(page.displayRender))) fail(`upright display render is not reproducible: ${page.displayRender.path}`);
      }
      const record = inspection.pages.find((candidate) => candidate.sourceId === source.id && candidate.sourcePdfPage === page.sourcePdfPage);
      if (!record || record.reportPage !== page.reportPage || record.purpose !== page.purpose) fail(`inspection mapping is absent or inconsistent: ${source.id}:${page.sourcePdfPage}`);
      verifiedPages += 1;
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (verifiedPages !== inspection.pages.length) fail(`verified ${verifiedPages} pages but inspection declares ${inspection.pages.length}`);
const report = {
  ...verifyGenericSensorSourceBundle(),
  machineVisual: {
    verifiedPages,
    sourceRenderRecipe: "EXACT_BYTE_REPRODUCTION",
    displayRenderRecipe: "EXACT_BYTE_REPRODUCTION",
    structuralImageResult: "NON_BLANK_VALID_PNG",
    authoritativeNumericOrEquationExtraction: false,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
