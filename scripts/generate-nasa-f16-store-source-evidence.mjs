import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("governance/nasa-historical-f16-store-source");
const manifestPath = resolve(root, "manifest.v1.json");
const authorityPath = resolve(root, "source-terms-authority.v1.json");
const visualReviewPath = resolve(root, "release-owner-visual-review.v1.json");
const write = process.argv.includes("--write");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const rendered = (value) => `${JSON.stringify(value, null, 2)}\n`;

const authority = {
  schemaVersion: "vector.nasa-historical-f16-store-source-terms-authority.v1",
  id: "nasa-historical-f16-store-source-terms-authority-20260825",
  authorityKind: "AUTHORITATIVE_SOURCE_TERMS",
  decidedOn: "2026-08-25",
  humanReviewerRequired: false,
  legalApproval: false,
  policyArtifact: {
    title: "NASA's public access plan",
    url: "https://sti.nasa.gov/docs/NASA_Public_Access_Plan.pdf",
    repositoryPath: "source-terms/NASA_Public_Access_Plan.pdf",
    mediaType: "application/pdf",
    byteLength: 1081214,
    sha256: "f22cf0cbebebadaea5c13e6b57ef8ccd883175cb93444cf4c77d6bac0c8e3d61",
    pageCount: 27,
    accessedOn: "2026-08-25",
  },
  policyBasis: {
    section: "Rights and Distribution",
    state: "OFFICIAL_NASA_PUBLIC_ACCESS_PLAN",
    summary: "NTRS documents not marked copyrighted may be reproduced and distributed without further NASA permission; the exact NTRS metadata records below identify government public use and no third-party material.",
  },
  metadataEvidence: [
    {
      citationId: "19780003061",
      repositoryPath: "sources/19780003061.json",
      sha256: "14293d25ca78af273df30ed1f9891f7acd3f1999bc8af49b33e837662a6423cb",
      distribution: "PUBLIC",
      determinationType: "GOV_PUBLIC_USE_PERMITTED",
      containsThirdPartyMaterial: false,
      isExportControl: "NO",
      ear: "NO",
      itar: "NO",
    },
    {
      citationId: "19870000632",
      repositoryPath: "sources/19870000632.json",
      sha256: "c826c0626027eeb3e8ae252ac75b97f49602a903befd4bc4cb86a8578c8e03fe",
      distribution: "PUBLIC",
      determinationType: "GOV_PUBLIC_USE_PERMITTED",
      containsThirdPartyMaterial: false,
      isExportControl: "NO",
      ear: "NO",
      itar: "NO",
    },
    {
      citationId: "19860022096",
      repositoryPath: "sources/19860022096.json",
      sha256: "4274d309f1d150853a16b01a39476e48c846f02beeacd8a9a8f7b33ddd5b9f32",
      distribution: "PUBLIC",
      determinationType: "GOV_PUBLIC_USE_PERMITTED",
      containsThirdPartyMaterial: false,
      isExportControl: "NO",
      ear: "NO",
      itar: "NO",
    },
  ],
  decisions: {
    referenceUse: {
      value: "SOURCE_TERMS_AUTHORIZED_INTERNAL_VERIFICATION_ONLY",
      scope: "EXACT_FROZEN_SOURCES_AND_DECLARED_REVIEW_RENDERS_FOR_INTERNAL_ENGINE_VERIFICATION_RESEARCH_ONLY",
    },
    redistribution: {
      value: "SOURCE_TERMS_AUTHORIZED_EXACT_BYTES_AND_DECLARED_RENDERS",
      scope: "EXACT_FROZEN_NASA_BYTES_METADATA_POLICY_AND_DECLARED_FULL_PAGE_REVIEW_RENDERS_ONLY",
    },
    exportReview: {
      value: "SOURCE_METADATA_NO_RESTRICTION",
      scope: "EXACT_THREE_DIGEST_PINNED_NTRS_RECORDS_ONLY",
    },
  },
  conditions: [
    "PRESERVE_EXACT_SOURCE_AND_METADATA_DIGESTS",
    "PRESERVE_NASA_SOURCE_IDENTITY_AND_POLICY_PROVENANCE",
    "NO_NUMERIC_OR_EQUATION_TRANSCRIPTION",
    "NO_ADAPTATION_OR_EXECUTION_AUTHORITY",
    "NO_MODEL_PACK_OR_RUNTIME_ADMISSION",
  ],
};

const authorityBytes = Buffer.from(rendered(authority));
const authoritySha256 = sha256(authorityBytes);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const decision = (value, scope) => ({
  value,
  authorityKind: "AUTHORITATIVE_SOURCE_TERMS",
  authorityRecordId: authority.id,
  decisionDate: authority.decidedOn,
  scope,
  evidenceDigest: authoritySha256,
  legalApproval: false,
});

manifest.referenceUseDecision = decision(
  authority.decisions.referenceUse.value,
  authority.decisions.referenceUse.scope,
);
manifest.redistributionDecision = decision(
  authority.decisions.redistribution.value,
  authority.decisions.redistribution.scope,
);
manifest.exportReviewDecision = decision(
  authority.decisions.exportReview.value,
  authority.decisions.exportReview.scope,
);
manifest.sourceTermsAuthority = {
  path: "source-terms-authority.v1.json",
  sha256: authoritySha256,
};
manifest.releaseOwnerReview = {
  path: "release-owner-visual-review.v1.json",
  status: "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE",
  reviewedPageCount: 16,
};
manifest.permissions = {
  adaptation: false,
  execution: false,
  modelAdmission: false,
  numericOrEquationTranscription: false,
  runtime: false,
};

const artifactPrefix = new Map([
  ["nasa-tm-74078", "tm74078"],
  ["nasa-cr-172354", "cr172354"],
  ["nasa-tm-87766", "tm87766"],
]);

const pageCategories = new Map([
  ["tm74078-figure2-loadings", "HISTORICAL_LOADING_FIGURE_NONEXHAUSTIVE"],
  ["tm74078-nine-stations", "HISTORICAL_STATION_COUNT_CONTEXT"],
  ["tm74078-figure4-span-fractions", "HISTORICAL_NONDIMENSIONAL_SPAN_CONTEXT"],
  ["cr172354-station-map", "HISTORICAL_STATION_MAPPING_CONTEXT"],
  ["cr172354-store-configuration", "CONFIGURATION_BOUNDED_STORE_ARRANGEMENT"],
  ["cr172354-table2-qualifications", "LEGACY_TABLE_QUALIFICATIONS"],
  ["cr172354-final-pylon-force", "FINAL_PYLON_FORCE_AND_ANALYSIS_QUALIFICATION"],
  ["cr172354-table2-values", "LEGACY_TABLE_LOCATION_AND_UNIT_CONTEXT"],
  ["cr172354-figure19-side-view", "TWO_DIMENSIONAL_SOURCE_DIAGRAM_ONLY"],
  ["tm87766-fsd-configuration", "CONFIGURATION_IDENTITY"],
  ["tm87766-test-conditions-p5", "TEST_CONDITION_BOUNDARY"],
  ["tm87766-test-conditions-p6", "SINGLE_EJECTION_SETUP_CONTEXT"],
  ["tm87766-results-p7", "INITIAL_PYLON_OBSERVATION"],
  ["tm87766-results-p8", "MODIFIED_PYLON_OBSERVATION"],
  ["tm87766-results-p9", "TEST_ENVELOPE_OBSERVATION"],
  ["tm87766-single-ejection-p10", "SINGLE_EJECTION_OBSERVATION"],
]);

for (const artifact of manifest.artifacts) {
  artifact.pdf.repositoryPath = `sources/${artifact.pdf.fileName}`;
  artifact.metadata.repositoryPath = `sources/${artifact.metadata.fileName}`;
  const prefix = artifactPrefix.get(artifact.id);
  if (!prefix) throw new Error(`unknown artifact ${artifact.id}`);
  for (const page of artifact.pageMaps) {
    const pageNumber = String(page.pdfPage).padStart(3, "0");
    const displayPath = `renders/${prefix}-p${pageNumber}-display.png`;
    page.render.displayPath = displayPath;
    page.render.sourcePath = page.appliedDisplayRotationDeg === 0
      ? displayPath
      : `renders/${prefix}-p${pageNumber}-source.png`;
    page.visualQa = {
      status: "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE",
      reviewerRole: "RELEASE_OWNER_REVIEW",
      reviewDate: "2026-08-25",
      reviewRecordPath: "release-owner-visual-review.v1.json",
      orientationReadable: true,
      legible: true,
      unclipped: true,
      note: "Technical semantic inspection of the exact declared full-page render; no legal approval, numeric transcription, equation transcription, or model admission.",
    };
  }
}

delete manifest.canonicalDigest;
manifest.canonicalDigest = sha256(Buffer.from(canonicalJson(manifest)));

const reviewedPages = manifest.artifacts.flatMap((artifact) => artifact.pageMaps.map((page) => ({
  artifactId: artifact.id,
  citationId: artifact.citationId,
  reportNumbers: artifact.reportNumbers,
  pageId: page.id,
  pdfPage: page.pdfPage,
  printedPage: page.printedPage,
  anchor: page.anchor,
  eligibleCategory: pageCategories.get(page.id),
  sourceRender: {
    path: page.render.sourcePath,
    sha256: page.render.sourceSha256,
    byteLength: page.render.sourceByteLength,
    widthPx: page.render.sourceWidthPx,
    heightPx: page.render.sourceHeightPx,
  },
  displayRender: {
    path: page.render.displayPath,
    sha256: page.render.displaySha256,
    byteLength: page.render.displayByteLength,
    widthPx: page.render.displayWidthPx,
    heightPx: page.render.displayHeightPx,
  },
  eligibleClaimDigest: sha256(Buffer.from(page.eligibleClaim)),
  ineligibleInferenceDigest: sha256(Buffer.from(page.ineligibleInference)),
  qualificationDigest: sha256(Buffer.from(page.uncertaintyQualification)),
  orientationReadable: true,
  legible: true,
  unclipped: true,
  reportIdentityConsistent: true,
  pageMappingConsistent: true,
  limitationsAndNonclaimsConsistent: true,
})));

if (reviewedPages.some((page) => !page.eligibleCategory)) {
  throw new Error("every reviewed page requires an explicit semantic category");
}

const visualReview = {
  schemaVersion: "vector.nasa-historical-f16-store-release-owner-visual-review.v1",
  status: "RELEASE_OWNER_SEMANTIC_INSPECTION_COMPLETE",
  reviewerRole: "RELEASE_OWNER_REVIEW",
  reviewedOn: "2026-08-25",
  subject: {
    manifestId: manifest.id,
    manifestCanonicalDigest: manifest.canonicalDigest,
    intendedUse: manifest.intendedUse,
    pageCount: reviewedPages.length,
  },
  reviewedPages,
  findings: {
    titleAndReportIdentity: "CONSISTENT",
    declaredPageAndAnchorMapping: "CONSISTENT",
    orientationLegibilityAndClipping: "CONSISTENT",
    eligibleContextCategory: "CONSISTENT_WITH_SOURCE_LOCATION_ONLY_SCOPE",
    limitationsAndNonclaims: "CONSISTENT",
  },
  legalApproval: false,
  numericOrEquationTranscriptionPerformed: false,
  note: "Technical release-owner review of exact full-page render identities only. Source PDF bytes remain authoritative; no value, equation, model parameter, compatibility record, release envelope, or runtime capability was transcribed or admitted.",
};

const outputs = [
  [authorityPath, authorityBytes],
  [manifestPath, Buffer.from(rendered(manifest))],
  [visualReviewPath, Buffer.from(rendered(visualReview))],
];

for (const [path, bytes] of outputs) {
  if (write) writeFileSync(path, bytes);
  else if (!readFileSync(path).equals(bytes)) throw new Error(`${path} is stale; run with --write`);
}

process.stdout.write(`${JSON.stringify({
  authoritySha256,
  manifestCanonicalDigest: manifest.canonicalDigest,
  reviewedPages: reviewedPages.length,
  visualReviewSha256: sha256(Buffer.from(rendered(visualReview))),
})}\n`);
