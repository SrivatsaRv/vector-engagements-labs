import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import {
  TP1538_AXES,
  TP1538_TABLE_INVENTORY,
} from "./lib/tp1538-aero-corpus.mjs";
import {
  createTp1538Evaluator,
} from "../lib/validation/tp1538-aero-verification.ts";
import {
  tp1538AeroPerformanceResultSha256,
  tp1538AeroPerformanceWorkloadContentSha256,
} from "./lib/tp1538-aero-performance-evidence.mjs";

const corpusUrl = new URL("../governance/nasa-tp1538-generic-f16-aero-verification-corpus.v1.json", import.meta.url);
const workloadUrl = new URL("../fixtures/public-reference/nasa-tp1538-aero/workload.v1.json", import.meta.url);
const check = process.argv.includes("--check");
const corpus = JSON.parse(readFileSync(corpusUrl, "utf8"));
const evaluator = createTp1538Evaluator(corpus, corpus.corpusSha256);

function lookup(tableId, coordinates) {
  return { schemaVersion: "vector.tp1538-aero-lookup.v1", tableId, angleUnit: "DEG", coordinates };
}

function coordinateName(axis) {
  return axis === "alphaDeg" || axis === "betaDeg" ? axis : "stabilatorDeg";
}

function midpointCoordinates(inventory, indexes) {
  return Object.fromEntries(inventory.axes.map((axis, index) => {
    const values = TP1538_AXES[axis];
    return [coordinateName(axis), (values[indexes[index]] + values[indexes[index] + 1]) / 2];
  }));
}

function enumerateAdjacentIndexes(lengths) {
  const output = [];
  const visit = (depth, indexes) => {
    if (depth === lengths.length) {
      output.push([...indexes]);
      return;
    }
    for (let index = 0; index < lengths[depth] - 1; index += 1) {
      indexes[depth] = index;
      visit(depth + 1, indexes);
    }
  };
  visit(0, []);
  return output;
}

function repeatToLength(cases, length) {
  assert(cases.length > 0, "TP-1538 workload case family is empty.");
  return Array.from({ length }, (_, index) => structuredClone(cases[index % cases.length]));
}

const exactCandidates = corpus.tables.flatMap((table) => table.cells
  .filter(({ state }) => state === "AVAILABLE")
  .map(({ coordinate }) => lookup(table.id, coordinate)));
const exactKnot = Array.from({ length: 1_024 }, (_, index) => {
  const selected = exactCandidates[Math.floor(index * exactCandidates.length / 1_024)];
  assert.equal(evaluator.lookup(selected).diagnostic, "EXACT_KNOT");
  return structuredClone(selected);
});

const interpolatedCandidates = [];
for (const inventory of TP1538_TABLE_INVENTORY) {
  const lengths = inventory.axes.map((axis) => TP1538_AXES[axis].length);
  for (const indexes of enumerateAdjacentIndexes(lengths)) {
    const candidate = lookup(inventory.id, midpointCoordinates(inventory, indexes));
    const result = evaluator.lookup(candidate);
    if (result.state === "AVAILABLE" && result.diagnostic === "INTERPOLATED") interpolatedCandidates.push(candidate);
  }
}
const interpolated = Array.from({ length: 1_024 }, (_, index) => structuredClone(
  interpolatedCandidates[Math.floor(index * interpolatedCandidates.length / 1_024)],
));

const unavailableCandidates = corpus.tables.flatMap((table) => table.cells
  .filter(({ state }) => state === "PRINTED_BLANK" || state === "ILLEGIBLE")
  .map(({ coordinate }) => lookup(table.id, coordinate)));
const unavailable = repeatToLength(unavailableCandidates, 512);
for (const candidate of unavailable) assert.notEqual(evaluator.lookup(candidate).state, "AVAILABLE");

const outOfDomainCandidates = TP1538_TABLE_INVENTORY.map((inventory, tableIndex) => {
  const coordinates = Object.fromEntries(inventory.axes.map((axis) => [coordinateName(axis), TP1538_AXES[axis][0]]));
  const firstAxis = inventory.axes[tableIndex % inventory.axes.length];
  coordinates[coordinateName(firstAxis)] = TP1538_AXES[firstAxis][0] - 0.25;
  return lookup(inventory.id, coordinates);
});
const outOfDomain = repeatToLength(outOfDomainCandidates, 512);
for (const candidate of outOfDomain) assert.equal(evaluator.lookup(candidate).state, "OUT_OF_DOMAIN");

const alphaCases = TP1538_AXES.alphaDeg.flatMap((value, index, values) => [
  value,
  ...(index + 1 < values.length ? [(value + values[index + 1]) / 2] : []),
]);
const assemblyCandidates = alphaCases.flatMap((alphaDeg) => [-10, 0, 10].map((stabilatorDeg) => ({
  schemaVersion: "vector.tp1538-aero-assembly-input.v1",
  angleUnit: "DEG",
  alphaDeg,
  betaDeg: 0,
  stabilatorDeg,
  leadingEdgeFlapDeg: 25,
  speedBrakeDeg: 0,
  aileronDeg: 0,
  rudderDeg: 0,
  rollRateRadS: 0,
  pitchRateRadS: 0,
  yawRateRadS: 0,
  trueAirspeedMps: 150,
  cgChordFraction: 0.35,
}))).filter((candidate) => {
  try {
    evaluator.assemble(candidate);
    return true;
  } catch {
    return false;
  }
});
const assemblyRequests = repeatToLength(assemblyCandidates, 1_024);
const lookupRequests = [...exactKnot, ...interpolated, ...unavailable, ...outOfDomain];
const result = {
  lookupResults: lookupRequests.map((request) => evaluator.lookup(request)),
  assemblyResults: assemblyRequests.map((request) => evaluator.assemble(request)),
};
const workload = {
  schemaVersion: "vector.tp1538-aero-performance-workload.v1",
  id: "NASA_TP1538_COMPLETE_CORPUS_4096_V1",
  subject: "NASA_GENERIC_F16",
  deploymentClass: "ENGINE_VERIFICATION_ONLY",
  corpusSha256: corpus.corpusSha256,
  operationCount: 4_096,
  configurationMix: { assembly: 1_024, exactKnot: 1_024, interpolated: 1_024, outOfDomain: 512, unavailable: 512 },
  lookupRequests,
  assemblyRequests,
  expectedResultSha256: tp1538AeroPerformanceResultSha256(result),
  contentSha256: "",
};
workload.contentSha256 = tp1538AeroPerformanceWorkloadContentSha256(workload);
const bytes = Buffer.from(`${JSON.stringify(workload)}\n`);

if (check) {
  assert.deepEqual(readFileSync(workloadUrl), bytes, "Committed TP-1538 performance workload is stale.");
  process.stdout.write(`${JSON.stringify({ state: "verified", bytes: bytes.byteLength, contentSha256: workload.contentSha256, expectedResultSha256: workload.expectedResultSha256 })}\n`);
} else {
  writeFileSync(workloadUrl, bytes);
  process.stdout.write(`${JSON.stringify({ state: "generated", bytes: bytes.byteLength, contentSha256: workload.contentSha256, expectedResultSha256: workload.expectedResultSha256 })}\n`);
}
