import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve("governance/sources/nasa-tp1538");
const sourcePath = join(root, "source/19800005879.pdf");
const metadataPath = join(root, "source/19800005879.metadata.json");
const cropDirectory = join(root, "crops");
const sourceRenderDirectory = join(root, "source-renders");
const expectedPdfSha256 = "aae0ece64474291368c0b4c816d3ab327c6100329e6eb030c2f4545d0913feb3";
const expectedMetadataSha256 = "bc15d569ade8a40525f87c1e1fb6970a03dde6c241d55fcefd3351ba061e2a89";
const rendererVersion = "pdftoppm version 26.05.0";
const upsideDownPages = new Set([53,55,56,57,59,60,61,62,64,65,71,72,73,75,76,77,79,80,81,82,83,84,86,87,88,89,90,91,92,93,94,95,96,97]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function roleFor(pdfPage) {
  if (pdfPage >= 8 && pdfPage <= 12) return "SYMBOLS_UNITS_BODY_AXES";
  if (pdfPage >= 42 && pdfPage <= 46) return "APPENDIX_B_COEFFICIENT_EQUATIONS";
  if (pdfPage === 49) return "TABLE_I_REFERENCE_DATA";
  if (pdfPage >= 51 && pdfPage <= 97) return "TABLE_III_AERODYNAMIC_DATA";
  if (pdfPage === 100) return "BODY_AXIS_FIGURE";
  throw new Error(`Unsupported TP-1538 source page ${pdfPage}.`);
}

function pngMetadata(bytes) {
  if (bytes.toString("ascii", 1, 4) !== "PNG" || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Generated crop is not a PNG with an IHDR chunk.");
  }
  const widthPx = bytes.readUInt32BE(16);
  const heightPx = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  if (bytes[24] !== 8 || colorType !== 2) {
    throw new Error(`Generated crop must be 8-bit RGB; received bit depth ${bytes[24]} and color type ${colorType}.`);
  }
  return { widthPx, heightPx };
}

const pages = [
  ...Array.from({ length: 5 }, (_, index) => index + 8),
  ...Array.from({ length: 5 }, (_, index) => index + 42),
  49,
  ...Array.from({ length: 47 }, (_, index) => index + 51),
  100,
];

const versionResult = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });
if (versionResult.error || versionResult.status !== 0) throw new Error(`Pinned renderer is unavailable: ${versionResult.error?.message ?? versionResult.stderr}.`);
const reportedVersion = `${versionResult.stdout}${versionResult.stderr}`.trim();
if (reportedVersion.split("\n")[0] !== rendererVersion) {
  throw new Error(`Pinned renderer mismatch: expected ${rendererVersion}, received ${reportedVersion.split("\n")[0]}.`);
}

const sourceBytes = readFileSync(sourcePath);
const metadataBytes = readFileSync(metadataPath);
if (sha256(sourceBytes) !== expectedPdfSha256 || sha256(metadataBytes) !== expectedMetadataSha256) {
  throw new Error("Frozen TP-1538 source or metadata digest mismatch.");
}
mkdirSync(cropDirectory, { recursive: true });
mkdirSync(sourceRenderDirectory, { recursive: true });

const pageRecords = [];
for (const pdfPage of pages) {
  const reportPage = pdfPage - 6;
  const role = roleFor(pdfPage);
  const stem = `pdf-${String(pdfPage).padStart(3, "0")}-report-${String(reportPage).padStart(3, "0")}-${role.toLowerCase().replaceAll("_", "-")}`;
  const sourceStem = join(sourceRenderDirectory, stem);
  execFileSync("pdftoppm", [
    "-f", String(pdfPage), "-l", String(pdfPage), "-r", "150", "-gray", "-png", "-singlefile", sourcePath, sourceStem,
  ]);
  const path = `crops/${stem}.png`;
  const sourceRenderAbsolutePath = `${sourceStem}.png`;
  const sourceRenderPath = `source-renders/${stem}.png`;
  const sourceRenderBytes = readFileSync(sourceRenderAbsolutePath);
  const sourceOrientationDeg = upsideDownPages.has(pdfPage) ? 180 : 0;
  const appliedDisplayRotationDeg = sourceOrientationDeg;
  if (appliedDisplayRotationDeg === 0) copyFileSync(sourceRenderAbsolutePath, join(root, path));
  else await sharp(sourceRenderAbsolutePath).rotate(appliedDisplayRotationDeg).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 }).toFile(join(root, path));
  const bytes = readFileSync(join(root, path));
  const { widthPx, heightPx } = pngMetadata(bytes);
  pageRecords.push({
    pdfPage,
    reportPage,
    role,
    path,
    mediaType: "image/png",
    byteSize: bytes.length,
    sha256: sha256(bytes),
    sourceRenderPath,
    sourceRenderSha256: sha256(sourceRenderBytes),
    widthPx,
    heightPx,
    colorspace: "RGB_8BIT",
    sourceOrientationDeg,
    appliedDisplayRotationDeg,
    cropBoundsPx: [0, 0, widthPx, heightPx],
  });
}

const cards = pageRecords.map((page) => `<figure><img src="${page.path}" alt="PDF ${page.pdfPage}, report ${page.reportPage}, ${page.role}"><figcaption>PDF ${page.pdfPage} · report ${page.reportPage} · ${page.role} · source ${page.sourceOrientationDeg}° · applied ${page.appliedDisplayRotationDeg}°</figcaption></figure>`).join("\n");
const visualQaHtml = `<!doctype html>\n<meta charset="utf-8">\n<title>NASA TP-1538 crop visual QA</title>\n<style>body{font:14px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}figure{margin:0;border:1px solid #999;padding:8px}img{width:100%;height:auto}figcaption{margin-top:6px}</style>\n<h1>NASA TP-1538 governed source crops</h1>\n<p>59 full-page lossless crops, ordered by PDF page. Numeric transcription is outside this artifact.</p>\n<main>${cards}</main>\n`;
writeFileSync(join(root, "visual-qa.html"), visualQaHtml);

const manifest = {
  schemaVersion: "vector.tp1538-source-manifest.v1",
  id: "nasa-tp1538-generic-f16-aero-source",
  subject: "NASA_GENERIC_F16",
  deploymentClass: "ENGINE_VERIFICATION_ONLY",
  source: {
    bibliographic: {
      title: "Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability",
      reportNumber: "NASA-TP-1538",
      publicationDate: "1979-12-01",
      authors: ["Nguyen, L. T.", "Ogburn, M. E.", "Gilbert, W. P.", "Kibler, K. S.", "Brown, P. W.", "Deal, P. L."],
    },
    citationUrl: "https://ntrs.nasa.gov/citations/19800005879",
    pdfUrl: "https://ntrs.nasa.gov/api/citations/19800005879/downloads/19800005879.pdf",
    pdfPath: "source/19800005879.pdf",
    pdfSha256: expectedPdfSha256,
    metadataUrl: "https://ntrs.nasa.gov/api/citations/19800005879",
    metadataPath: "source/19800005879.metadata.json",
    metadataSha256: expectedMetadataSha256,
    retrievedOn: "2026-08-24",
    rights: {
      distribution: "PUBLIC",
      determinationType: "GOV_PUBLIC_USE_PERMITTED",
      containsThirdPartyMaterial: false,
      exportControl: "NO",
      ear: "NO",
      itar: "NO",
    },
  },
  recipe: {
    renderer: "poppler-pdftoppm",
    rendererVersion,
    resolutionDpi: 150,
    encoding: "LOSSLESS_PNG",
    colorspace: "RGB_8BIT",
    pageCrop: "FULL_PAGE",
    ordering: "PDF_PAGE_ASCENDING",
    transformer: "sharp",
    transformerVersion: "0.35.0",
    transform: "LOSSLESS_QUARTER_TURN_PIXEL_REINDEX",
    png: {
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
      effort: 10,
    },
  },
  visualQa: {
    path: "visual-qa.html",
    sha256: sha256(Buffer.from(visualQaHtml)),
    pageCount: 59,
    status: "REQUIRES_INDEPENDENT_REVIEW",
  },
  pages: pageRecords,
};

writeFileSync(join(root, "manifest.v1.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(JSON.stringify({ source: basename(sourcePath), pages: pageRecords.length, rendererVersion, sourceRenderDigest: sha256(Buffer.from(pageRecords.map((page) => page.sourceRenderSha256).join("\n"))), displayCropDigest: sha256(Buffer.from(pageRecords.map((page) => page.sha256).join("\n"))) }) + "\n");
