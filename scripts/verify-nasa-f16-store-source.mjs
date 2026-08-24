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
import { gunzipSync } from "node:zlib";

export const MANIFEST_PATH = resolve(
  "governance/nasa-historical-f16-store-source/manifest.v1.json",
);

// This is an external anchor for the immutable manifest bytes. Contract changes
// require both the governed record and this verifier constant to be reviewed.
const EXPECTED_CANONICAL_DIGEST = "ee777c79ec2b2d8a00a152b91a85cfafdedf8db07f94cb6cf2d7524bc574c602";
const SHA256 = /^[a-f0-9]{64}$/;
const ROTATIONS = new Set([0, 90, 180, 270]);
const BANNED_PROMOTION = /\b(?:PAF|Block[ -]?52|Peace Drive|Su-30|DCS|War Thunder|game dump|community dump|stationCompatibility|loadout|dragCoefficient|modelPackParameter|runtimeCapability)\b/i;

const FROZEN_FILE_NAMES = new Set([
  "TM74078.pdf",
  "CR172354.pdf",
  "TM87766.pdf",
  "19780003061.json",
  "19870000632.json",
  "19860022096.json",
]);

const FROZEN_BINARY_HASHES = new Set([
  "9daf1a24166a359731b2eb28cf6b7f3eff877de73d964ad4551cc8003ff8da78",
  "0aa427839db20133fd342f77ed2fa9bbe9907c26360a629c8ce2699921834485",
  "ce85f3664c03f6f1e1d18b57d645d60d93f19df5fbb7bb5cdaf3c8d2fbaab961",
  "14293d25ca78af273df30ed1f9891f7acd3f1999bc8af49b33e837662a6423cb",
  "c826c0626027eeb3e8ae252ac75b97f49602a903befd4bc4cb86a8578c8e03fe",
  "4274d309f1d150853a16b01a39476e48c846f02beeacd8a9a8f7b33ddd5b9f32",
  "797a273e0674be196173e685cb95e21f150e4047709fb77b4a322bf47a2374b1",
  "ad27de9fbb29686693d2636d2193ae2b403fac44aa33787ff09a7c64e9c9c451",
  "62527e076c7e1f2bdf9a8388f2de19893386364815cb9c1f0647dd3bd968e27b",
  "be664473efe34ae94903fdb116e9fe302e95066e739dd295c176b589f32cdb9c",
  "d8b2d9ba39ae9d589f7f0675db223ffa591454381f1bdaef126a8a8c1e4253c7",
  "509679436ea1b5323aacf0d2e65ca72cd166d8a7173a45dac305bbccc1b79e02",
  "dc771bc7d367156c6c1c3ab52f377ed784cc9b3e1c9773301bca699269b97ded",
  "6152ac27165b66cdfa0258c01a8f5662a64c3dd5b4930364e7b95340d3fd13b6",
  "42dceb040dcedd7951e26440e20e92617a995db8719baf329b47c03b59a95e2d",
  "02bb41101ead3bb82f5fa67141077f5ee3ff685f402b62a01a103750b4cefdf1",
  "56748df18ce1f6309b3d45f6856ab36a838239b0ba71bc5ae54c60c146acc7c1",
  "6f13acf801a84dbe1766d69d66c43cf62f182033d0f63faa47613e7b22337da0",
  "76f17879b975ed4a901e84a45e1ed3169f283418eb31dabbab1eede27b17c2dd",
  "bbe830c2e0ee85d4b765696889e0fd04f3481386141184539c87d40cafeb6950",
  "070df7beb19bfebdf72e957f7d327ce4b0b3bd52976a33da9eb2ebacd1e36a34",
  "3c559a9690802ad13f35d1e2bb18b28b7735bc85ef9c644ace155a634f13d5fb",
  "0b3bb921a25bb2e132b9631ccb1c553a30e8056d8bc8469859c1e3e293379707",
  "d64e130fe486d49b0b3f7998aee25c9338c175588a0de1a096ff5181dc6ae217",
]);

const TOP_LEVEL_KEYS = [
  "accessDate",
  "ancestry",
  "artifacts",
  "availabilityStates",
  "canonicalDigest",
  "conversionPolicy",
  "coordinateConcepts",
  "exportReviewDecision",
  "id",
  "intendedUse",
  "nonclaims",
  "redistributionDecision",
  "referenceUseDecision",
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
  "uncertaintyQualification",
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
  assertPendingDecision(manifest.referenceUseDecision, "reference use decision");
  assertPendingDecision(manifest.redistributionDecision, "redistribution decision");
  assertPendingDecision(manifest.exportReviewDecision, "export review decision");

  exactKeys(manifest.renderRecipe, ["arguments", "displayRotation", "dpi", "format", "renderer", "rendererVersion"], "renderRecipe");
  exactKeys(manifest.renderRecipe.displayRotation, ["operation", "pngOptions", "tool", "toolVersion"], "renderRecipe.displayRotation");
  exactKeys(manifest.renderRecipe.displayRotation.pngOptions, ["compressionLevel", "palette"], "renderRecipe.displayRotation.pngOptions");
  if (manifest.renderRecipe.renderer !== "pdftoppm" || manifest.renderRecipe.rendererVersion !== "26.05.0" || manifest.renderRecipe.dpi !== 150 || manifest.renderRecipe.format !== "PNG") fail("render recipe identity differs");
  if (manifest.renderRecipe.displayRotation.tool !== "sharp" || manifest.renderRecipe.displayRotation.toolVersion !== "0.35.0" || manifest.renderRecipe.displayRotation.operation !== "LOSSLESS_PIXEL_ROTATION_WITH_PNG_REENCODE" || manifest.renderRecipe.displayRotation.pngOptions.compressionLevel !== 9 || manifest.renderRecipe.displayRotation.pngOptions.palette !== false) fail("display rotation recipe differs");

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
      if (typeof page.uncertaintyQualification !== "string" || page.uncertaintyQualification.length < 20) fail(`${artifact.id}.${page.id} lacks its uncertainty or qualification boundary`);
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
  if (!table2 || JSON.stringify(table2.literalUnits) !== JSON.stringify(["kN·m²", "lb·in²", "kN", "lb", "cm", "in."]) || !table2.quantitySemantics.includes("DIVIDE_BY_G0")) {
    fail("Table 2 must preserve literal force-times-length-squared semantics and the future g0 conversion boundary");
  }
  if (!pylonForce.eligibleClaim.includes("includes the MAU-12 rack") || !pylonForce.eligibleClaim.includes("excludes the alignment device and damper") || !pylonForce.uncertaintyQualification.includes("final-assembly component scope")) fail("final assembled-pylon source qualification is incomplete");
  const ejection = manifest.artifacts[2].pageMaps.find(({ id }) => id === "tm87766-single-ejection-p10");
  for (const required of ["loaded right modified decoupler pylon", "unloaded left decoupler pylon", "AIM-9J stores on both wingtips", "Mach 0.80", "7,500 ft"]) {
    if (!ejection?.eligibleClaim.includes(required)) fail(`single-ejection qualification omits ${required}`);
  }
  exactKeys(manifest.coordinateConcepts, ["aircraftStationNumber", "completeBodyFrameTransform", "completeStationGeometry", "forwardHookRelativeDistance", "fuselageStation", "handedness", "lateralDatum", "semiSpanFraction", "spanStation", "verticalDatum"], "coordinateConcepts");
  for (const [name, concept] of Object.entries(manifest.coordinateConcepts)) {
    exactKeys(concept, ["availability", "sameAs"], `coordinateConcepts.${name}`);
    if (concept.sameAs !== null) fail(`${name} cannot be conflated with another coordinate concept`);
  }
  for (const name of ["lateralDatum", "verticalDatum", "handedness", "completeBodyFrameTransform", "completeStationGeometry"]) {
    if (manifest.coordinateConcepts[name].availability !== "UNAVAILABLE") fail(`${name} must remain UNAVAILABLE`);
  }
  exactKeys(manifest.conversionPolicy, ["currentExecutableConversions", "futureMassFromForce", "futureMassInertiaFromLegacyForceLength2", "g0Mps2"], "conversionPolicy");
  if (manifest.conversionPolicy.g0Mps2 !== 9.80665 || manifest.conversionPolicy.currentExecutableConversions !== "NONE" || manifest.conversionPolicy.futureMassFromForce !== "mass_kg = force_N / g0" || manifest.conversionPolicy.futureMassInertiaFromLegacyForceLength2 !== "I_kg_m2 = I_source_kN_m2 * 1000 / g0") fail("conversion policy must declare the reviewed g0 formulas and admit no executable conversion");
  exactKeys(manifest.ancestry, ["designSource", "flightObservationSource", "relationship"], "ancestry");
  if (manifest.ancestry.designSource !== "nasa-cr-172354" || manifest.ancestry.flightObservationSource !== "nasa-tm-87766" || manifest.ancestry.relationship !== "BOUNDED_CONFIGURATION_ANCESTRY_NOT_INDEPENDENT_GENERAL_VALIDATION") fail("source ancestry differs");

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
    ["reference use", manifest.referenceUseDecision],
    ["redistribution", manifest.redistributionDecision],
    ["export review", manifest.exportReviewDecision],
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

function containsFrozenBinary(bytes) {
  if (FROZEN_BINARY_HASHES.has(sha256(bytes))) return true;
  if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
    try {
      const expanded = gunzipSync(bytes, { maxOutputLength: 25_000_001 });
      return FROZEN_BINARY_HASHES.has(sha256(expanded));
    } catch {
      return false;
    }
  }
  return false;
}

function assertToolVersion(command, expected) {
  const result = spawnSync(command, ["-v"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !new RegExp(`^${command} version ${expected.replaceAll(".", "\\.")}$`, "m").test(output)) {
    fail(`${command} must be the governed ${expected} renderer`);
  }
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
    assertToolVersion("pdftoppm", manifest.renderRecipe.rendererVersion);
    const sharp = (await import("sharp")).default;
    if (sharp.versions.sharp !== manifest.renderRecipe.displayRotation.toolVersion) {
      fail(`sharp must be the governed ${manifest.renderRecipe.displayRotation.toolVersion} display renderer`);
    }
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
  assertToolVersion("pdfinfo", manifest.renderRecipe.rendererVersion);
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
    const publicationDates = (metadata.publications ?? []).map(({ publicationDate }) => publicationDate?.slice(0, 10));
    const reportNumbers = [...new Set((metadata.otherReportNumbers ?? [])
      .filter((value) => typeof value === "string" && !value.startsWith("Report Number: ")))]
      .sort();
    if (
      String(metadata.id) !== artifact.citationId ||
      metadata.title !== artifact.title ||
      JSON.stringify(authors) !== JSON.stringify(artifact.authors) ||
      publicationDates.length !== 1 ||
      publicationDates[0] !== artifact.publicationDate ||
      JSON.stringify(reportNumbers) !== JSON.stringify([...artifact.reportNumbers].sort())
    ) fail(`${artifact.metadata.fileName} identity differs from its manifest`);
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

function walkFiles(directory, excludedNames = new Set()) {
  if (!statSync(directory).isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path, excludedNames));
    else if (entry.isFile()) files.push(path);
    else if (entry.isSymbolicLink()) fail(`production boundary contains symlink ${path}`);
  }
  return files;
}

export function verifyCommittedInventory(repositoryRoot) {
  const directory = resolve(repositoryRoot, "governance/nasa-historical-f16-store-source");
  const directoryInfo = lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    fail("committed source directory must be a real non-symlink directory");
  }
  const repositoryReal = realpathSync(repositoryRoot);
  const directoryReal = realpathSync(directory);
  if (!directoryReal.startsWith(`${repositoryReal}${sep}`)) fail("committed source directory escapes the repository");
  const files = readdirSync(directory).sort();
  const expected = ["README.md", "manifest.v1.json"];
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    fail(`committed source directory must contain only ${expected.join(", ")}; received ${files.join(", ")}`);
  }
  for (const file of files) {
    const info = lstatSync(resolve(directory, file));
    if (!info.isFile() || info.isSymbolicLink()) fail(`committed source member ${file} must be a regular non-symlink file`);
  }
  const excludedNames = new Set([".git", ".next", ".open-next", ".vercel", ".wrangler", "dist", "build", "out", "node_modules", "target"]);
  for (const path of walkFiles(repositoryRoot, excludedNames)) {
    if (path.startsWith(`${directoryReal}${sep}`)) continue;
    const info = statSync(path);
    if (FROZEN_FILE_NAMES.has(basename(path))) fail(`raw source or render identity is committed at ${relative(repositoryRoot, path)}`);
    if (info.size <= 25_000_000 && containsFrozenBinary(readFileSync(path))) {
      fail(`raw source or render identity is committed at ${relative(repositoryRoot, path)}`);
    }
  }
  return { files, rawArtifactsCommitted: 0 };
}

export function verifyProductionIsolation(repositoryRoot) {
  const sourceRoots = ["app", "components", "config", "content", "db", "engine-rust", "fixtures", "lib", "public", "server", "worker", "dist", ".next", ".open-next", ".vercel/output", "build", "out", ".wrangler"];
  const forbidden = [
    "nasa-historical-f16-store-source",
    "vector.nasa-historical-f16-store-source-manifest.v1",
    "NASA_TM74078_F16_FSD_QUARTER_SCALE_FLUTTER_MODEL",
    "NASA_CR172354_F16_DECOUPLER_PYLON_DESIGN",
    "NASA_TM87766_FSD_F16A_DECOUPLER_FLIGHT_TEST",
    "NASA-TM-74078",
    "NASA-CR-172354",
    "NASA-TM-87766",
    "19780003061",
    "19870000632",
    "19860022096",
    ...FROZEN_BINARY_HASHES,
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
        if (containsFrozenBinary(bytes) || forbidden.some((value) => text.includes(value)) || [...FROZEN_FILE_NAMES].some((value) => text.includes(value))) {
          references.push(relative(repositoryRoot, path));
        }
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
