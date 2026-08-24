import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const MANIFEST_PATH = resolve(
  "governance/nasa-historical-f16-store-source/manifest.v1.json",
);

// This is an external anchor for the immutable manifest bytes. Contract changes
// require both the governed record and this verifier constant to be reviewed.
const EXPECTED_CANONICAL_DIGEST = "89907ccba7b91487fb7fc3a150062dec7c4695218fc5d33a556ec6d492dfe4f1";
const SHA256 = /^[a-f0-9]{64}$/;
const ROTATIONS = new Set([0, 90, 180, 270]);
const BANNED_PROMOTION = /\b(?:PAF|Block[ -]?52|Peace Drive|Su-30|stationCompatibility|loadout|dragCoefficient|modelPackParameter|runtimeCapability)\b/i;

const TOP_LEVEL_KEYS = [
  "accessDate",
  "ancestry",
  "artifacts",
  "availabilityStates",
  "canonicalDigest",
  "conversionPolicy",
  "coordinateConcepts",
  "decisions",
  "id",
  "intendedUse",
  "nonclaims",
  "renderRecipe",
  "schemaVersion",
  "version",
];

const DECISION_KEYS = [
  "authorityBasis",
  "decisionDate",
  "evidenceDigest",
  "reviewer",
  "scope",
  "value",
];

const ARTIFACT_KEYS = [
  "authors",
  "citationId",
  "eligibleClaims",
  "id",
  "ineligibleInferences",
  "metadata",
  "pageMaps",
  "pdf",
  "publicationDate",
  "reportNumbers",
  "rightsFacts",
  "role",
  "subject",
  "title",
];

const PAGE_KEYS = [
  "anchor",
  "appliedDisplayRotationDeg",
  "coordinateSemantics",
  "eligibleClaim",
  "id",
  "ineligibleInference",
  "literalUnits",
  "pdfPage",
  "printedPage",
  "quantitySemantics",
  "render",
  "sourceOrientationDeg",
  "visualQa",
];

function fail(message) {
  throw new Error(`NASA historical F-16 source manifest: ${message}`);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${label} keys differ: expected ${required.join(", ")}; received ${actual.join(", ")}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function computeCanonicalDigest(manifest) {
  const candidate = structuredClone(manifest);
  delete candidate.canonicalDigest;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(candidate)))
    .digest("hex");
}

function assertSha256(value, label) {
  if (!SHA256.test(value)) fail(`${label} must be a lowercase SHA-256`);
}

function assertPendingDecision(decision, label) {
  exactKeys(decision, DECISION_KEYS, label);
  if (decision.value !== "PENDING") fail(`${label} may not be approved by this source-freeze issue`);
  for (const key of DECISION_KEYS.filter((key) => key !== "value")) {
    if (decision[key] !== null) fail(`${label}.${key} must remain null while pending`);
  }
}

function assertRender(page, label) {
  exactKeys(page.render, [
    "displayByteLength",
    "displayHeightPx",
    "displaySha256",
    "displayWidthPx",
    "sourceByteLength",
    "sourceHeightPx",
    "sourceSha256",
    "sourceWidthPx",
  ], `${label}.render`);
  for (const key of ["sourceByteLength", "sourceHeightPx", "sourceWidthPx", "displayByteLength", "displayHeightPx", "displayWidthPx"]) {
    if (!Number.isSafeInteger(page.render[key]) || page.render[key] <= 0) fail(`${label}.render.${key} must be a positive integer`);
  }
  assertSha256(page.render.sourceSha256, `${label}.render.sourceSha256`);
  assertSha256(page.render.displaySha256, `${label}.render.displaySha256`);
  if (!ROTATIONS.has(page.sourceOrientationDeg) || !ROTATIONS.has(page.appliedDisplayRotationDeg)) {
    fail(`${label} uses an unsupported orientation`);
  }
  const quarterTurn = page.appliedDisplayRotationDeg === 90 || page.appliedDisplayRotationDeg === 270;
  const expectedWidth = quarterTurn ? page.render.sourceHeightPx : page.render.sourceWidthPx;
  const expectedHeight = quarterTurn ? page.render.sourceWidthPx : page.render.sourceHeightPx;
  if (page.render.displayWidthPx !== expectedWidth || page.render.displayHeightPx !== expectedHeight) {
    fail(`${label} display dimensions do not match its governed pixel rotation`);
  }
  if (page.appliedDisplayRotationDeg === 0 && (
    page.render.sourceByteLength !== page.render.displayByteLength ||
    page.render.sourceSha256 !== page.render.displaySha256
  )) fail(`${label} zero-rotation display must be the exact source render`);
}

function assertVisualQa(page, label) {
  exactKeys(page.visualQa, [
    "legible",
    "note",
    "orientationReadable",
    "reviewDate",
    "reviewer",
    "status",
    "unclipped",
  ], `${label}.visualQa`);
  if (page.visualQa.status !== "PENDING_HUMAN_REVIEW") fail(`${label} cannot assert completed human QA`);
  for (const key of ["reviewer", "reviewDate", "orientationReadable", "legible", "unclipped"]) {
    if (page.visualQa[key] !== null) fail(`${label}.visualQa.${key} must remain null while pending`);
  }
  if (typeof page.visualQa.note !== "string" || !page.visualQa.note.includes("not human admission")) {
    fail(`${label}.visualQa note must preserve the agent-preflight limitation`);
  }
}

export function verifyManifest(manifest) {
  exactKeys(manifest, TOP_LEVEL_KEYS, "root");
  if (manifest.schemaVersion !== "vector.nasa-historical-f16-store-source-manifest.v1") fail("unsupported schema version");
  if (manifest.id !== "nasa-historical-f16-store-source-20260824" || manifest.version !== "1.0.0") fail("unexpected manifest identity");
  if (manifest.intendedUse !== "ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE") fail("intended use must remain source-only");
  if (manifest.accessDate !== "2026-08-24") fail("access date differs from the reviewed acquisition");
  if (BANNED_PROMOTION.test(JSON.stringify(manifest.artifacts))) fail("named or executable promotion language is prohibited");

  const actualDigest = computeCanonicalDigest(manifest);
  if (manifest.canonicalDigest !== actualDigest) fail(`canonical digest mismatch: expected ${manifest.canonicalDigest}, received ${actualDigest}`);
  if (manifest.canonicalDigest !== EXPECTED_CANONICAL_DIGEST) fail("canonical digest is not the independently anchored reviewed value");

  if (JSON.stringify(manifest.availabilityStates) !== JSON.stringify(["REFERENCE_ONLY", "UNSUPPORTED", "MODEL_ASSUMPTION", "UNAVAILABLE"])) {
    fail("availability states differ from the closed source-only set");
  }
  exactKeys(manifest.decisions, ["exportReview", "redistribution", "referenceUse"], "decisions");
  assertPendingDecision(manifest.decisions.referenceUse, "reference use decision");
  assertPendingDecision(manifest.decisions.redistribution, "redistribution decision");
  assertPendingDecision(manifest.decisions.exportReview, "export review decision");

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3) fail("exactly three artifacts are required");
  const expectedIds = ["nasa-tm-74078", "nasa-cr-172354", "nasa-tm-87766"];
  if (JSON.stringify(manifest.artifacts.map(({ id }) => id)) !== JSON.stringify(expectedIds)) fail("artifact order or identity differs");
  const subjects = new Set();
  const roles = new Set();
  let pageMaps = 0;
  let visualQaPending = 0;
  for (const artifact of manifest.artifacts) {
    exactKeys(artifact, ARTIFACT_KEYS, `artifact ${artifact.id}`);
    if (subjects.has(artifact.subject) || roles.has(artifact.role)) fail(`artifact ${artifact.id} launders a subject or role`);
    subjects.add(artifact.subject);
    roles.add(artifact.role);
    exactKeys(artifact.pdf, ["byteLength", "fileName", "mediaType", "pageCount", "sha256", "url"], `${artifact.id}.pdf`);
    exactKeys(artifact.metadata, ["byteLength", "fileName", "mediaType", "sha256", "url"], `${artifact.id}.metadata`);
    exactKeys(artifact.rightsFacts, ["containsThirdPartyMaterial", "determinationType", "distribution", "ear", "isExportControl", "itar", "repositoryLicenseInference"], `${artifact.id}.rightsFacts`);
    assertSha256(artifact.pdf.sha256, `${artifact.id}.pdf.sha256`);
    assertSha256(artifact.metadata.sha256, `${artifact.id}.metadata.sha256`);
    if (artifact.rightsFacts.distribution !== "PUBLIC" || artifact.rightsFacts.determinationType !== "GOV_PUBLIC_USE_PERMITTED" || artifact.rightsFacts.isExportControl !== "NO" || artifact.rightsFacts.ear !== "NO" || artifact.rightsFacts.itar !== "NO" || artifact.rightsFacts.containsThirdPartyMaterial !== false || artifact.rightsFacts.repositoryLicenseInference !== "UNAVAILABLE") {
      fail(`${artifact.id} rights facts differ or infer a repository licence`);
    }
    if (!Array.isArray(artifact.pageMaps) || artifact.pageMaps.length === 0) fail(`${artifact.id} page map is empty`);
    const pageIds = new Set();
    for (const page of artifact.pageMaps) {
      exactKeys(page, PAGE_KEYS, `${artifact.id}.${page.id}`);
      if (pageIds.has(page.id)) fail(`${artifact.id} repeats page-map id ${page.id}`);
      pageIds.add(page.id);
      if (!Number.isSafeInteger(page.pdfPage) || page.pdfPage < 1 || page.pdfPage > artifact.pdf.pageCount) fail(`${artifact.id}.${page.id} has an invalid PDF page`);
      if (typeof page.printedPage !== "string" || typeof page.anchor !== "string") fail(`${artifact.id}.${page.id} lacks exact page identity`);
      if (!Array.isArray(page.literalUnits) || typeof page.quantitySemantics !== "string" || typeof page.coordinateSemantics !== "string") fail(`${artifact.id}.${page.id} lacks typed units or coordinate semantics`);
      assertRender(page, `${artifact.id}.${page.id}`);
      assertVisualQa(page, `${artifact.id}.${page.id}`);
      pageMaps += 1;
      visualQaPending += 1;
    }
  }
  if (pageMaps !== 16) fail(`expected 16 governed page maps, received ${pageMaps}`);

  const cr = manifest.artifacts[1];
  const pylonForce = cr.pageMaps.find(({ id }) => id === "cr172354-final-pylon-force");
  if (pylonForce?.pdfPage !== 28 || pylonForce?.printedPage !== "24" || pylonForce.quantitySemantics !== "FORCE_WEIGHT_REQUIRES_G0_FOR_FUTURE_MASS_CONVERSION") {
    fail("final assembled-pylon force must map to PDF page 28 / printed page 24 and remain force");
  }
  const table2 = cr.pageMaps.find(({ id }) => id === "cr172354-table2-values");
  if (!table2 || JSON.stringify(table2.literalUnits) !== JSON.stringify(["kN*m^2", "lb*in^2", "kN", "lb-force", "cm", "in"]) || !table2.quantitySemantics.includes("DIVIDE_BY_G0")) {
    fail("Table 2 must preserve literal force-times-length-squared semantics and the future g0 conversion boundary");
  }
  exactKeys(manifest.coordinateConcepts, ["aircraftStationNumber", "completeBodyFrameTransform", "forwardHookRelativeDistance", "fuselageStation", "semiSpanFraction", "spanStation"], "coordinateConcepts");
  for (const [name, concept] of Object.entries(manifest.coordinateConcepts)) {
    exactKeys(concept, ["availability", "sameAs"], `coordinateConcepts.${name}`);
    if (concept.sameAs !== null) fail(`${name} cannot be conflated with another coordinate concept`);
  }
  if (manifest.conversionPolicy.g0Mps2 !== 9.80665 || manifest.conversionPolicy.currentExecutableConversions !== "NONE") fail("conversion policy must declare g0 and admit no executable conversion");

  return {
    artifacts: manifest.artifacts.length,
    decisionsPending: 3,
    id: manifest.id,
    pageMaps,
    schemaVersion: manifest.schemaVersion,
    visualQaPending,
  };
}

export function assertSourceAdmissionEligible(manifest) {
  verifyManifest(manifest);
  for (const [label, decision] of [
    ["reference use", manifest.decisions.referenceUse],
    ["redistribution", manifest.decisions.redistribution],
    ["export review", manifest.decisions.exportReview],
  ]) {
    if (decision.value === "PENDING") fail(`${label} decision is PENDING`);
  }
  const pendingPage = manifest.artifacts.flatMap(({ pageMaps }) => pageMaps).find(({ visualQa }) => visualQa.status !== "APPROVED_HUMAN_REVIEW");
  if (pendingPage) fail(`visual QA is pending for ${pendingPage.id}`);
  fail("source-only manifest cannot admit executable behavior");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRegularContainedFile(directory, fileName) {
  if (basename(fileName) !== fileName) fail(`unsafe local artifact name ${fileName}`);
  const directoryReal = realpathSync(directory);
  const path = resolve(directory, fileName);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${fileName} must be a regular non-symlink file`);
  const fileReal = realpathSync(path);
  if (!fileReal.startsWith(`${directoryReal}${sep}`)) fail(`${fileName} escapes the source directory`);
  return path;
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") fail("render is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function verifyRenders(manifest, sourceDirectory) {
  const directory = mkdtempSync(join(tmpdir(), "vector-f16-source-render-"));
  try {
    const sharp = (await import("sharp")).default;
    let renderCount = 0;
    for (const artifact of manifest.artifacts) {
      const pdfPath = assertRegularContainedFile(sourceDirectory, artifact.pdf.fileName);
      for (const page of artifact.pageMaps) {
        const prefix = join(directory, `${artifact.id}-${String(page.pdfPage).padStart(3, "0")}`);
        const rendered = spawnSync("pdftoppm", ["-f", String(page.pdfPage), "-l", String(page.pdfPage), "-r", "150", "-png", "-singlefile", pdfPath, prefix], { encoding: "utf8" });
        if (rendered.status !== 0) fail(`pdftoppm failed for ${artifact.id} PDF page ${page.pdfPage}: ${rendered.stderr.trim()}`);
        const sourceBytes = readFileSync(`${prefix}.png`);
        const sourceDimensions = pngDimensions(sourceBytes);
        if (sourceBytes.length !== page.render.sourceByteLength || sha256(sourceBytes) !== page.render.sourceSha256 || sourceDimensions.width !== page.render.sourceWidthPx || sourceDimensions.height !== page.render.sourceHeightPx) {
          fail(`${artifact.id} PDF page ${page.pdfPage} render differs from the frozen source identity`);
        }
        let displayBytes = sourceBytes;
        if (page.appliedDisplayRotationDeg !== 0) {
          displayBytes = await sharp(sourceBytes)
            .rotate(page.appliedDisplayRotationDeg)
            .png(manifest.renderRecipe.displayRotation.pngOptions)
            .toBuffer();
        }
        const displayDimensions = pngDimensions(displayBytes);
        if (displayBytes.length !== page.render.displayByteLength || sha256(displayBytes) !== page.render.displaySha256 || displayDimensions.width !== page.render.displayWidthPx || displayDimensions.height !== page.render.displayHeightPx) {
          fail(`${artifact.id} PDF page ${page.pdfPage} display render differs from the frozen identity`);
        }
        renderCount += 1;
      }
    }
    return renderCount;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function verifySourceDirectory(manifest, sourceDirectory) {
  verifyManifest(manifest);
  const directoryInfo = lstatSync(sourceDirectory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) fail("source directory must be a real directory");
  const expectedFiles = manifest.artifacts.flatMap(({ pdf, metadata }) => [pdf.fileName, metadata.fileName]).sort();
  const actualFiles = readdirSync(sourceDirectory).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail(`source directory inventory differs: expected ${expectedFiles.join(", ")}; received ${actualFiles.join(", ")}`);

  for (const artifact of manifest.artifacts) {
    for (const member of [artifact.pdf, artifact.metadata]) {
      const path = assertRegularContainedFile(sourceDirectory, member.fileName);
      const bytes = readFileSync(path);
      if (bytes.length !== member.byteLength || sha256(bytes) !== member.sha256) fail(`${member.fileName} size or digest mismatch`);
    }
    const metadata = JSON.parse(readFileSync(resolve(sourceDirectory, artifact.metadata.fileName), "utf8"));
    const authors = [...(metadata.authorAffiliations ?? [])]
      .sort((left, right) => left.sequence - right.sequence)
      .map((entry) => entry.meta?.author?.name);
    if (String(metadata.id) !== artifact.citationId || metadata.title !== artifact.title || JSON.stringify(authors) !== JSON.stringify(artifact.authors)) fail(`${artifact.metadata.fileName} identity differs from its manifest`);
    if (metadata.distribution !== artifact.rightsFacts.distribution || metadata.copyright?.determinationType !== artifact.rightsFacts.determinationType || metadata.copyright?.containsThirdPartyMaterial !== artifact.rightsFacts.containsThirdPartyMaterial || metadata.exportControl?.isExportControl !== artifact.rightsFacts.isExportControl || metadata.exportControl?.ear !== artifact.rightsFacts.ear || metadata.exportControl?.itar !== artifact.rightsFacts.itar) fail(`${artifact.metadata.fileName} rights/export facts differ from its manifest`);

    const pdfPath = assertRegularContainedFile(sourceDirectory, artifact.pdf.fileName);
    const info = spawnSync("pdfinfo", [pdfPath], { encoding: "utf8" });
    if (info.status !== 0) fail(`pdfinfo failed for ${artifact.pdf.fileName}: ${info.stderr.trim()}`);
    const match = /^Pages:\s+(\d+)$/m.exec(info.stdout);
    if (!match || Number(match[1]) !== artifact.pdf.pageCount) fail(`${artifact.pdf.fileName} page count differs from its manifest`);
  }

  const renders = await verifyRenders(manifest, sourceDirectory);
  return {
    admissionEligible: false,
    artifacts: manifest.artifacts.length,
    metadataRecords: manifest.artifacts.length,
    networkAccessed: false,
    renders,
  };
}

function walkFiles(directory) {
  if (!statSync(directory).isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
    else if (entry.isSymbolicLink()) fail(`production boundary contains symlink ${path}`);
  }
  return files;
}

export function verifyCommittedInventory(repositoryRoot) {
  const directory = resolve(repositoryRoot, "governance/nasa-historical-f16-store-source");
  const files = readdirSync(directory).sort();
  const expected = ["README.md", "manifest.v1.json"];
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    fail(`committed source directory must contain only ${expected.join(", ")}; received ${files.join(", ")}`);
  }
  for (const file of files) {
    const info = lstatSync(resolve(directory, file));
    if (!info.isFile() || info.isSymbolicLink()) fail(`committed source member ${file} must be a regular non-symlink file`);
  }
  return { files, rawArtifactsCommitted: 0 };
}

export function verifyProductionIsolation(repositoryRoot) {
  const sourceRoots = ["app", "components", "config", "content", "db", "engine-rust", "fixtures", "lib", "public", "server", "worker", "dist"];
  const forbidden = [
    "nasa-historical-f16-store-source",
    "vector.nasa-historical-f16-store-source-manifest.v1",
    "NASA_TM74078_F16_FSD_QUARTER_SCALE_FLUTTER_MODEL",
    "NASA_CR172354_F16_DECOUPLER_PYLON_DESIGN",
    "NASA_TM87766_FSD_F16A_DECOUPLER_FLIGHT_TEST",
  ];
  let filesInspected = 0;
  const references = [];
  for (const root of sourceRoots) {
    const directory = resolve(repositoryRoot, root);
    try {
      for (const path of walkFiles(directory)) {
        const info = statSync(path);
        if (info.size > 25_000_000) continue;
        const bytes = readFileSync(path);
        filesInspected += 1;
        const text = bytes.toString("utf8");
        if (forbidden.some((value) => text.includes(value))) references.push(relative(repositoryRoot, path));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (references.length > 0) fail(`production boundary references source-only identities: ${references.join(", ")}`);
  return { filesInspected, forbiddenReferences: 0 };
}

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

async function run() {
  const manifest = loadManifest();
  const result = verifyManifest(manifest);
  const inventory = verifyCommittedInventory(resolve("."));
  const sourceArgument = process.argv.indexOf("--source-dir");
  const sources = sourceArgument >= 0
    ? await verifySourceDirectory(manifest, resolve(process.argv[sourceArgument + 1] ?? fail("--source-dir requires a path")))
    : null;
  const isolation = verifyProductionIsolation(resolve("."));
  process.stdout.write(`${JSON.stringify({ ...result, inventory, isolation, sources })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
