import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  EXPECTED_PDF_PAGES,
  loadAndVerifyTp1538Source,
  verifyTp1538ProductionIsolation,
  verifyTp1538SourceManifest,
} from "../scripts/verify-tp1538-source-manifest.mjs";

const sourceRoot = resolve("governance/sources/nasa-tp1538");

test("the frozen TP-1538 source covers the corrected 59-page inventory", () => {
  const result = loadAndVerifyTp1538Source(sourceRoot);
  assert.equal(result.manifest.schemaVersion, "vector.tp1538-source-manifest.v1");
  assert.equal(result.manifest.subject, "NASA_GENERIC_F16");
  assert.equal(result.manifest.deploymentClass, "ENGINE_VERIFICATION_ONLY");
  assert.deepEqual(result.manifest.source.bibliographic, {
    title: "Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability",
    reportNumber: "NASA-TP-1538",
    publicationDate: "1979-12-01",
    authors: ["Nguyen, L. T.", "Ogburn, M. E.", "Gilbert, W. P.", "Kibler, K. S.", "Brown, P. W.", "Deal, P. L."],
  });
  assert.deepEqual(result.manifest.pages.map(({ pdfPage }) => pdfPage), EXPECTED_PDF_PAGES);
  assert.equal(result.manifest.pages.length, 59);
  assert.equal(result.verifiedCrops, 59);
});

test("the verifier rejects unknown fields, page swaps, rights drift and forged crop hashes", () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, "manifest.v1.json"), "utf8"));
  const cases = [
    [(candidate) => { candidate.unexpected = true; }, /exact keys/],
    [(candidate) => { [candidate.pages[0], candidate.pages[1]] = [candidate.pages[1], candidate.pages[0]]; }, /page inventory/],
    [(candidate) => { candidate.source.rights.exportControl = "YES"; }, /rights and export/],
    [(candidate) => { candidate.pages[0].sha256 = "0".repeat(64); }, /digest mismatch/],
    [(candidate) => { candidate.pages.pop(); }, /59-page inventory/],
    [(candidate) => { candidate.pages.push(structuredClone(candidate.pages.at(-1))); }, /59-page inventory/],
    [(candidate) => { candidate.pages[0].unknown = 1; }, /exact keys/],
    [(candidate) => { candidate.source.pdfSha256 = "1".repeat(64); }, /official source identity/],
    [(candidate) => { candidate.pages.find(({ pdfPage }) => pdfPage === 53).appliedDisplayRotationDeg = 0; }, /display rotation/],
    [(candidate) => { delete candidate.pages[0].sourceOrientationDeg; }, /exact keys/],
    [(candidate) => { candidate.pages[0].sourceRenderSha256 = "2".repeat(64); }, /source render|source-render/],
    [(candidate) => { candidate.source.bibliographic.title = "Wrong paper"; }, /bibliographic/],
    [(candidate) => { candidate.source.bibliographic.reportNumber = "NASA-TM-1538"; }, /bibliographic/],
    [(candidate) => { candidate.source.bibliographic.publicationDate = "1980-01-01"; }, /bibliographic/],
    [(candidate) => { candidate.source.bibliographic.authors.reverse(); }, /bibliographic/],
  ];
  for (const [mutate, expected] of cases) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => verifyTp1538SourceManifest(candidate, sourceRoot), expected);
  }
});

test("production modules do not import the verification-only TP-1538 evidence", () => {
  assert.ok(verifyTp1538ProductionIsolation() > 0);
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-production-"));
  mkdirSync(join(scratch, "engine-rust/src"), { recursive: true });
  const forgedRust = join(scratch, "engine-rust/src/forged.rs");
  writeFileSync(forgedRust, 'const SOURCE: &str = "governance/sources/nasa-tp1538";');
  assert.throws(() => verifyTp1538ProductionIsolation(scratch), /production.*TP-1538/i);
  unlinkSync(forgedRust);
  mkdirSync(join(scratch, "dist/client"), { recursive: true });
  writeFileSync(join(scratch, "dist/client/forged.js"), 'fetch("governance/sources/nasa-tp1538")');
  assert.throws(() => verifyTp1538ProductionIsolation(scratch), /production.*bundle.*TP-1538/i);
});

test("the verifier rejects a symlinked governed crop", () => {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, "manifest.v1.json"), "utf8"));
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-"));
  const governedScratch = join(scratch, "source-tree");
  cpSync(sourceRoot, governedScratch, { recursive: true });
  const outside = join(scratch, "outside.png");
  writeFileSync(outside, "not governed evidence");
  const cropPath = join(governedScratch, manifest.pages[0].path);
  unlinkSync(cropPath);
  symlinkSync(outside, cropPath);
  assert.throws(() => verifyTp1538SourceManifest(manifest, governedScratch), /regular non-symlink/);
});

test("the governed tree rejects extras and externally anchors manifest and visual-QA bytes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "vector-tp1538-tree-"));
  const governedScratch = join(scratch, "source-tree");
  cpSync(sourceRoot, governedScratch, { recursive: true });
  writeFileSync(join(governedScratch, "crops/unreferenced-extra.png"), "extra");
  assert.throws(() => loadAndVerifyTp1538Source(governedScratch), /exact governed file inventory/);

  unlinkSync(join(governedScratch, "crops/unreferenced-extra.png"));
  const manifestPath = join(governedScratch, "manifest.v1.json");
  writeFileSync(manifestPath, `${readFileSync(manifestPath, "utf8")} `);
  assert.throws(() => loadAndVerifyTp1538Source(governedScratch), /manifest byte identity/);

  cpSync(join(sourceRoot, "manifest.v1.json"), manifestPath);
  const visualPath = join(governedScratch, "visual-qa.html");
  writeFileSync(visualPath, `${readFileSync(visualPath, "utf8")}<script>forged()</script>`);
  const forged = JSON.parse(readFileSync(manifestPath, "utf8"));
  forged.visualQa.sha256 = createHash("sha256").update(readFileSync(visualPath)).digest("hex");
  assert.throws(() => verifyTp1538SourceManifest(forged, governedScratch), /manifest byte identity/);
});
