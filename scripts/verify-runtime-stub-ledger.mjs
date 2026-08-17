import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_LEDGER_PATH = "governance/runtime-stub-ledger.v1.json";
const SELF_PATH = "scripts/verify-runtime-stub-ledger.mjs";

const asPosix = (path) => path.split(sep).join("/");
const keyFor = ({ path, indicator }) => `${path}\u0000${indicator}`;

function filesBelow(rootDirectory, relativeRoot, extensions) {
  const absoluteRoot = resolve(rootDirectory, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  if (statSync(absoluteRoot).isFile()) return [relativeRoot];
  return readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const child = asPosix(join(relativeRoot, entry.name));
    if (entry.isDirectory()) return filesBelow(rootDirectory, child, extensions);
    return entry.isFile() && extensions.has(extname(entry.name)) ? [child] : [];
  });
}

export function collectIndicatorObservations(rootDirectory, indicatorPolicy) {
  const extensions = new Set(indicatorPolicy.extensions);
  const files = [
    ...new Set(
      indicatorPolicy.roots.flatMap((root) => filesBelow(rootDirectory, root, extensions)),
    ),
  ].filter((path) => path !== SELF_PATH).sort();
  const indicators = indicatorPolicy.indicators.map((indicator) => ({
    ...indicator,
    regularExpression: new RegExp(indicator.expression, indicator.flags),
  }));

  return files.flatMap((path) => {
    const content = readFileSync(resolve(rootDirectory, path), "utf8");
    return content.split(/\r?\n/u).flatMap((line, index) =>
      indicators
        .filter((indicator) => indicator.regularExpression.test(line))
        .map((indicator) => ({ path, indicator: indicator.id, line: index + 1 })),
    );
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateIndicatorInventory(observations, ledger) {
  const entryIds = new Set(ledger.entries.map((entry) => entry.id));
  const controls = [
    ...ledger.indicatorPolicy.allowances.map((item) => ({ ...item, kind: "allowance" })),
    ...ledger.indicatorPolicy.exemptions.map((item) => ({ ...item, kind: "exemption" })),
  ];
  const controlsByKey = new Map();
  for (const control of controls) {
    const key = keyFor(control);
    assert(!controlsByKey.has(key), `Duplicate indicator control for ${control.path} (${control.indicator}).`);
    assert(Number.isInteger(control.expectedLines) && control.expectedLines >= 0, `Invalid expectedLines for ${control.path}.`);
    if (control.kind === "allowance") {
      assert(control.entryIds.length > 0, `Allowance ${control.path} has no ledger owner.`);
      for (const entryId of control.entryIds) {
        assert(entryIds.has(entryId), `Allowance ${control.path} references unknown ${entryId}.`);
      }
    } else {
      assert(control.classification && control.rationale, `Exemption ${control.path} lacks classification or rationale.`);
    }
    controlsByKey.set(key, control);
  }

  const counts = new Map();
  for (const observation of observations) {
    const key = keyFor(observation);
    const control = controlsByKey.get(key);
    assert(control, `Unclassified ${observation.indicator} at ${observation.path}:${observation.line}. Add a ledger entry or a justified exemption.`);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, control] of controlsByKey) {
    const actual = counts.get(key) ?? 0;
    assert(actual === control.expectedLines, `${control.path} (${control.indicator}) has ${actual} classified lines; ledger expects ${control.expectedLines}. Update the owning entry instead of suppressing the scan.`);
  }
}

export function findSourceLessPublicReferences(source) {
  return source.split(/\r?\n/u).flatMap((line, index) =>
    line.includes('{ id: "') &&
    line.includes('dataState: "PUBLIC_REFERENCE"') &&
    !line.includes("sourceIds:")
      ? [{ line: index + 1 }]
      : [],
  );
}

export function verifyRuntimeStubLedger({ rootDirectory = process.cwd(), ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  const absoluteLedgerPath = resolve(rootDirectory, ledgerPath);
  const raw = readFileSync(absoluteLedgerPath, "utf8");
  const ledger = JSON.parse(raw);
  assert(ledger.schemaVersion === "vector.runtime-stub-ledger.v1", "Unsupported runtime stub ledger schema.");
  assert(ledger.programmeGate === "#66" && ledger.releaseGate === "#39", "Ledger gates must remain bound to #66 and #39.");

  const ids = new Set();
  for (const [index, entry] of ledger.entries.entries()) {
    const expectedId = `STUB-${String(index + 1).padStart(2, "0")}`;
    assert(entry.id === expectedId, `Ledger entry ${index + 1} must be ${expectedId}.`);
    assert(!ids.has(entry.id), `Duplicate ledger ID ${entry.id}.`);
    ids.add(entry.id);
    assert(ledger.classifications.includes(entry.classification), `${entry.id} has an unknown classification.`);
    assert(entry.releaseBlocking === true, `${entry.id} must remain release-blocking until its owning issue retires it.`);
    assert(entry.owners.length > 0 && entry.owners.every((owner) => /^#\d+$/u.test(owner)), `${entry.id} requires GitHub issue owners.`);
    assert(entry.evidence.length > 0, `${entry.id} requires source evidence.`);
    for (const evidencePath of entry.evidence) {
      assert(existsSync(resolve(rootDirectory, evidencePath)), `${entry.id} evidence path is missing: ${evidencePath}.`);
    }
    assert(entry.resolution.trim().length > 0, `${entry.id} requires a fail-closed resolution.`);
  }

  const observations = collectIndicatorObservations(rootDirectory, ledger.indicatorPolicy);
  validateIndicatorInventory(observations, ledger);
  assert(ids.has(ledger.sourcePolicy.entryId), `Source policy references unknown ${ledger.sourcePolicy.entryId}.`);
  const sourceLessPublicReferences = findSourceLessPublicReferences(
    readFileSync(resolve(rootDirectory, ledger.sourcePolicy.path), "utf8"),
  );
  assert(
    sourceLessPublicReferences.length === ledger.sourcePolicy.expectedSourceLessPublicReferences,
    `${ledger.sourcePolicy.path} has ${sourceLessPublicReferences.length} source-less PUBLIC_REFERENCE records; ledger expects ${ledger.sourcePolicy.expectedSourceLessPublicReferences}. Update ${ledger.sourcePolicy.entryId} and its owning issue.`,
  );
  return {
    schemaVersion: ledger.schemaVersion,
    entries: ledger.entries.length,
    releaseBlocking: ledger.entries.filter((entry) => entry.releaseBlocking).length,
    indicatorLines: observations.length,
    sourceLessPublicReferences: sourceLessPublicReferences.length,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function run() {
  try {
    process.stdout.write(`${JSON.stringify(verifyRuntimeStubLedger())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
