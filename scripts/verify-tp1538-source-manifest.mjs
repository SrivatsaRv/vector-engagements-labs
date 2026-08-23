import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/u;
const ROOT_KEYS = ["deploymentClass", "id", "pages", "recipe", "schemaVersion", "source", "subject", "visualQa"];
const SOURCE_KEYS = ["bibliographic", "citationUrl", "metadataPath", "metadataSha256", "metadataUrl", "pdfPath", "pdfSha256", "pdfUrl", "retrievedOn", "rights"];
const BIBLIOGRAPHIC_KEYS = ["authors", "publicationDate", "reportNumber", "title"];
const RIGHTS_KEYS = ["containsThirdPartyMaterial", "determinationType", "distribution", "ear", "exportControl", "itar"];
const RECIPE_KEYS = ["colorspace", "encoding", "ordering", "pageCrop", "png", "renderer", "rendererVersion", "resolutionDpi", "transform", "transformer", "transformerVersion"];
const PNG_RECIPE_KEYS = ["adaptiveFiltering", "compressionLevel", "effort", "palette"];
const PAGE_KEYS = ["appliedDisplayRotationDeg", "byteSize", "colorspace", "cropBoundsPx", "heightPx", "mediaType", "path", "pdfPage", "reportPage", "role", "sha256", "sourceOrientationDeg", "sourceRenderPath", "sourceRenderSha256", "widthPx"];
const VISUAL_QA_KEYS = ["pageCount", "path", "sha256", "status"];
const EXPECTED_PDF_SHA256 = "aae0ece64474291368c0b4c816d3ab327c6100329e6eb030c2f4545d0913feb3";
const EXPECTED_METADATA_SHA256 = "bc15d569ade8a40525f87c1e1fb6970a03dde6c241d55fcefd3351ba061e2a89";
const EXPECTED_SOURCE_RENDER_DIGEST = "242241355c275d2137a049a19f660fa1840abd6be9c2f0614edd082e37030530";
const EXPECTED_DISPLAY_CROP_DIGEST = "ef7a3f26374913e8fbfdccda69cfb33fdf1915f8eebe209f758facbda01801e4";
const EXPECTED_MANIFEST_SHA256 = "d4736dae888054e502c34912374b8c032dd52f84414bc7e9137b9953acbe4e6b";
const EXPECTED_BIBLIOGRAPHIC = Object.freeze({
  title: "Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability",
  reportNumber: "NASA-TP-1538",
  publicationDate: "1979-12-01",
  authors: ["Nguyen, L. T.", "Ogburn, M. E.", "Gilbert, W. P.", "Kibler, K. S.", "Brown, P. W.", "Deal, P. L."],
});
const UPSIDE_DOWN_PAGES = new Set([53,55,56,57,59,60,61,62,64,65,71,72,73,75,76,77,79,80,81,82,83,84,86,87,88,89,90,91,92,93,94,95,96,97]);

export const EXPECTED_PDF_PAGES = Object.freeze([
  ...Array.from({ length: 5 }, (_, index) => index + 8),
  ...Array.from({ length: 5 }, (_, index) => index + 42),
  49,
  ...Array.from({ length: 47 }, (_, index) => index + 51),
  100,
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object with exact keys.`);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} must have exact keys.`);
}

function exactDirectoryEntries(root, relativePath, expected, label) {
  const directory = resolve(root, relativePath);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink directory.`);
  const actual = readdirSync(directory).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`${label} does not match the exact governed file inventory.`);
}

function governedFile(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes("..")) {
    throw new Error(`${label} path must remain relative to the governed root.`);
  }
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Governed TP-1538 root must be a regular non-symlink directory.");
  const rootReal = realpathSync(root);
  const path = resolve(root, relativePath);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file.`);
  let cursor = dirname(path);
  while (cursor !== resolve(root)) {
    const ancestor = lstatSync(cursor);
    if (!ancestor.isDirectory() || ancestor.isSymbolicLink()) throw new Error(`${label} ancestor must be a regular non-symlink directory.`);
    cursor = dirname(cursor);
  }
  const fileReal = realpathSync(path);
  const rel = relative(rootReal, fileReal);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes the governed root.`);
  return readFileSync(path);
}

function roleFor(pdfPage) {
  if (pdfPage >= 8 && pdfPage <= 12) return "SYMBOLS_UNITS_BODY_AXES";
  if (pdfPage >= 42 && pdfPage <= 46) return "APPENDIX_B_COEFFICIENT_EQUATIONS";
  if (pdfPage === 49) return "TABLE_I_REFERENCE_DATA";
  if (pdfPage >= 51 && pdfPage <= 97) return "TABLE_III_AERODYNAMIC_DATA";
  if (pdfPage === 100) return "BODY_AXIS_FIGURE";
  throw new Error("Unexpected page inventory entry.");
}

function pngDimensions(bytes) {
  if (bytes.toString("ascii", 1, 4) !== "PNG" || bytes.toString("ascii", 12, 16) !== "IHDR" || bytes[24] !== 8 || bytes[25] !== 2) {
    throw new Error("Crop media type, colorspace, or bit depth mismatch.");
  }
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

export function verifyTp1538SourceManifest(manifest, rootDirectory) {
  const root = resolve(rootDirectory);
  exactKeys(manifest, ROOT_KEYS, "TP-1538 manifest");
  exactKeys(manifest.source, SOURCE_KEYS, "TP-1538 source");
  exactKeys(manifest.source.bibliographic, BIBLIOGRAPHIC_KEYS, "TP-1538 bibliographic identity");
  exactKeys(manifest.source.rights, RIGHTS_KEYS, "TP-1538 rights");
  exactKeys(manifest.recipe, RECIPE_KEYS, "TP-1538 recipe");
  exactKeys(manifest.recipe.png, PNG_RECIPE_KEYS, "TP-1538 PNG recipe");
  exactKeys(manifest.visualQa, VISUAL_QA_KEYS, "TP-1538 visual QA");
  if (manifest.schemaVersion !== "vector.tp1538-source-manifest.v1" || manifest.id !== "nasa-tp1538-generic-f16-aero-source" || manifest.subject !== "NASA_GENERIC_F16" || manifest.deploymentClass !== "ENGINE_VERIFICATION_ONLY") {
    throw new Error("TP-1538 manifest identity or verification-only boundary mismatch.");
  }
  if (manifest.source.citationUrl !== "https://ntrs.nasa.gov/citations/19800005879" || manifest.source.pdfUrl !== "https://ntrs.nasa.gov/api/citations/19800005879/downloads/19800005879.pdf" || manifest.source.metadataUrl !== "https://ntrs.nasa.gov/api/citations/19800005879" || manifest.source.pdfPath !== "source/19800005879.pdf" || manifest.source.metadataPath !== "source/19800005879.metadata.json" || manifest.source.pdfSha256 !== EXPECTED_PDF_SHA256 || manifest.source.metadataSha256 !== EXPECTED_METADATA_SHA256 || manifest.source.retrievedOn !== "2026-08-24") {
    throw new Error("TP-1538 official source identity or digest mismatch.");
  }
  if (JSON.stringify(manifest.source.bibliographic) !== JSON.stringify(EXPECTED_BIBLIOGRAPHIC)) throw new Error("TP-1538 bibliographic identity mismatch.");
  const rights = manifest.source.rights;
  if (rights.distribution !== "PUBLIC" || rights.determinationType !== "GOV_PUBLIC_USE_PERMITTED" || rights.containsThirdPartyMaterial !== false || rights.exportControl !== "NO" || rights.ear !== "NO" || rights.itar !== "NO") {
    throw new Error("TP-1538 rights and export decision mismatch.");
  }
  if (manifest.recipe.renderer !== "poppler-pdftoppm" || manifest.recipe.rendererVersion !== "pdftoppm version 26.05.0" || manifest.recipe.resolutionDpi !== 150 || manifest.recipe.encoding !== "LOSSLESS_PNG" || manifest.recipe.colorspace !== "RGB_8BIT" || manifest.recipe.pageCrop !== "FULL_PAGE" || manifest.recipe.ordering !== "PDF_PAGE_ASCENDING" || manifest.recipe.transformer !== "sharp" || manifest.recipe.transformerVersion !== "0.35.0" || manifest.recipe.transform !== "LOSSLESS_QUARTER_TURN_PIXEL_REINDEX" || manifest.recipe.png.compressionLevel !== 9 || manifest.recipe.png.adaptiveFiltering !== false || manifest.recipe.png.palette !== false || manifest.recipe.png.effort !== 10) {
    throw new Error("TP-1538 deterministic crop recipe mismatch.");
  }
  for (const field of ["pdfSha256", "metadataSha256"]) if (!SHA256.test(manifest.source[field])) throw new Error(`Invalid ${field}.`);
  const pdf = governedFile(root, manifest.source.pdfPath, "Frozen PDF");
  const metadataBytes = governedFile(root, manifest.source.metadataPath, "Frozen metadata");
  if (sha256(pdf) !== manifest.source.pdfSha256 || sha256(metadataBytes) !== manifest.source.metadataSha256) throw new Error("Frozen source digest mismatch.");
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  if (metadata.id !== 19800005879 || metadata.distribution !== rights.distribution || metadata.copyright?.determinationType !== rights.determinationType || metadata.copyright?.containsThirdPartyMaterial !== rights.containsThirdPartyMaterial || metadata.exportControl?.isExportControl !== rights.exportControl || metadata.exportControl?.ear !== rights.ear || metadata.exportControl?.itar !== rights.itar) {
    throw new Error("Frozen metadata differs from the governed rights and export decision.");
  }
  const metadataAuthors = [...(metadata.authorAffiliations ?? [])].sort((left, right) => left.sequence - right.sequence).map((entry) => entry.meta?.author?.name);
  if (metadata.title !== EXPECTED_BIBLIOGRAPHIC.title || !(metadata.otherReportNumbers ?? []).includes(EXPECTED_BIBLIOGRAPHIC.reportNumber) || metadata.publications?.[0]?.publicationDate?.slice(0, 10) !== EXPECTED_BIBLIOGRAPHIC.publicationDate || JSON.stringify(metadataAuthors) !== JSON.stringify(EXPECTED_BIBLIOGRAPHIC.authors)) {
    throw new Error("Frozen metadata does not match the governed TP-1538 bibliographic identity.");
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== EXPECTED_PDF_PAGES.length || JSON.stringify(manifest.pages.map((page) => page.pdfPage)) !== JSON.stringify(EXPECTED_PDF_PAGES)) {
    throw new Error("Corrected 59-page inventory is missing, duplicated, reordered, or swapped.");
  }
  const expectedNames = manifest.pages.map((page) => page.path.split("/").at(-1));
  const expectedSourceRenderNames = manifest.pages.map((page) => page.sourceRenderPath.split("/").at(-1));
  exactDirectoryEntries(root, ".", ["README.md", "crops", "manifest.v1.json", "source", "source-renders", "visual-qa.html"], "TP-1538 root");
  exactDirectoryEntries(root, "source", ["19800005879.metadata.json", "19800005879.pdf"], "TP-1538 source directory");
  exactDirectoryEntries(root, "crops", expectedNames, "TP-1538 crop directory");
  exactDirectoryEntries(root, "source-renders", expectedSourceRenderNames, "TP-1538 source-render directory");
  const paths = new Set();
  for (let index = 0; index < manifest.pages.length; index += 1) {
    const page = manifest.pages[index];
    exactKeys(page, PAGE_KEYS, `TP-1538 page ${index}`);
    const expectedPage = EXPECTED_PDF_PAGES[index];
    if (page.pdfPage !== expectedPage || page.reportPage !== expectedPage - 6 || page.role !== roleFor(expectedPage)) throw new Error("TP-1538 page inventory mapping or role mismatch.");
    const expectedStem = `pdf-${String(expectedPage).padStart(3, "0")}-report-${String(expectedPage - 6).padStart(3, "0")}-${roleFor(expectedPage).toLowerCase().replaceAll("_", "-")}.png`;
    if (page.path !== `crops/${expectedStem}`) throw new Error("TP-1538 crop path does not match its governed page identity.");
    if (page.sourceRenderPath !== `source-renders/${expectedStem}`) throw new Error("TP-1538 source-render path does not match its governed page identity.");
    if (paths.has(page.path)) throw new Error("TP-1538 crop path is duplicated.");
    paths.add(page.path);
    const expectedOrientation = UPSIDE_DOWN_PAGES.has(expectedPage) ? 180 : 0;
    if (page.sourceOrientationDeg !== expectedOrientation || page.appliedDisplayRotationDeg !== expectedOrientation || ![0, 90, 180, 270].includes(page.sourceOrientationDeg) || ![0, 90, 180, 270].includes(page.appliedDisplayRotationDeg)) throw new Error("TP-1538 source orientation or applied display rotation mismatch.");
    if (page.mediaType !== "image/png" || page.colorspace !== "RGB_8BIT" || !Number.isSafeInteger(page.byteSize) || page.byteSize <= 0 || !SHA256.test(page.sha256) || !SHA256.test(page.sourceRenderSha256)) throw new Error("TP-1538 crop descriptor is malformed.");
    const bytes = governedFile(root, page.path, `TP-1538 crop ${page.pdfPage}`);
    const sourceRenderBytes = governedFile(root, page.sourceRenderPath, `TP-1538 source render ${page.pdfPage}`);
    if (sha256(sourceRenderBytes) !== page.sourceRenderSha256) throw new Error(`TP-1538 source render ${page.pdfPage} digest mismatch.`);
    if (bytes.length !== page.byteSize || sha256(bytes) !== page.sha256) throw new Error(`TP-1538 crop ${page.pdfPage} digest mismatch.`);
    const [width, height] = pngDimensions(bytes);
    const [sourceWidth, sourceHeight] = pngDimensions(sourceRenderBytes);
    const swapsAxes = page.appliedDisplayRotationDeg === 90 || page.appliedDisplayRotationDeg === 270;
    if (width !== (swapsAxes ? sourceHeight : sourceWidth) || height !== (swapsAxes ? sourceWidth : sourceHeight)) throw new Error(`TP-1538 source-to-display dimensions mismatch for page ${page.pdfPage}.`);
    if ((page.appliedDisplayRotationDeg === 0) !== (page.sha256 === page.sourceRenderSha256)) throw new Error(`TP-1538 source-to-display rotation lineage mismatch for page ${page.pdfPage}.`);
    if (page.widthPx !== width || page.heightPx !== height || JSON.stringify(page.cropBoundsPx) !== JSON.stringify([0, 0, width, height])) throw new Error(`TP-1538 crop ${page.pdfPage} dimensions or bounds mismatch.`);
  }
  const sourceRenderDigest = sha256(Buffer.from(manifest.pages.map((page) => page.sourceRenderSha256).join("\n")));
  const displayCropDigest = sha256(Buffer.from(manifest.pages.map((page) => page.sha256).join("\n")));
  if (sourceRenderDigest !== EXPECTED_SOURCE_RENDER_DIGEST || displayCropDigest !== EXPECTED_DISPLAY_CROP_DIGEST) throw new Error("TP-1538 source-render or display-crop set identity mismatch.");
  if (manifest.visualQa.path !== "visual-qa.html" || manifest.visualQa.pageCount !== 59 || manifest.visualQa.status !== "REQUIRES_INDEPENDENT_REVIEW" || !SHA256.test(manifest.visualQa.sha256)) throw new Error("TP-1538 visual QA descriptor mismatch.");
  const visualQaBytes = governedFile(root, manifest.visualQa.path, "Visual QA index");
  if (sha256(visualQaBytes) !== manifest.visualQa.sha256) throw new Error("TP-1538 visual QA digest mismatch.");
  const visualQa = visualQaBytes.toString("utf8");
  for (const page of manifest.pages) {
    if (!visualQa.includes(`src="${page.path}"`) || !visualQa.includes(`source ${page.sourceOrientationDeg}° · applied ${page.appliedDisplayRotationDeg}°`)) throw new Error(`Visual QA omits TP-1538 crop or orientation ${page.pdfPage}.`);
  }
  if ((visualQa.match(/<figure>/gu) ?? []).length !== 59) throw new Error("Visual QA must contain exactly 59 governed crop figures.");
  const canonicalManifestDigest = sha256(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  if (canonicalManifestDigest !== EXPECTED_MANIFEST_SHA256) throw new Error("TP-1538 manifest byte identity mismatch.");
  return { manifest, verifiedCrops: manifest.pages.length };
}

export function verifyTp1538ProductionIsolation(repositoryRoot = process.cwd()) {
  const forbidden = ["nasa-tp1538-generic-f16-aero-source", "governance/sources/nasa-tp1538"];
  const roots = ["app", "components", "lib", "server", "worker", "engine-rust/src", "public", "dist"].map((path) => resolve(repositoryRoot, path));
  const examined = [];
  for (const root of roots) {
    try {
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        examined.push(path);
        const bytes = readFileSync(path);
        if (forbidden.some((needle) => bytes.includes(Buffer.from(needle)))) throw new Error(`Production source or bundle ${relative(repositoryRoot, path)} imports TP-1538 verification evidence.`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return examined.length;
}

export function loadAndVerifyTp1538Source(rootDirectory = resolve("governance/sources/nasa-tp1538")) {
  const bytes = governedFile(rootDirectory, "manifest.v1.json", "TP-1538 manifest");
  if (sha256(bytes) !== EXPECTED_MANIFEST_SHA256) throw new Error("TP-1538 manifest byte identity mismatch.");
  return verifyTp1538SourceManifest(JSON.parse(bytes.toString("utf8")), rootDirectory);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = loadAndVerifyTp1538Source();
  const productionFilesScanned = verifyTp1538ProductionIsolation();
  process.stdout.write(`${JSON.stringify({ schemaVersion: result.manifest.schemaVersion, verifiedCrops: result.verifiedCrops, subject: result.manifest.subject, productionFilesScanned })}\n`);
}
