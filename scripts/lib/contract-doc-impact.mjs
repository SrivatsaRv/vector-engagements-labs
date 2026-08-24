import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const DECLARATION_SCHEMA = "vector.contract-doc-impact-declaration.v1";
export const POLICY_SCHEMA = "vector.contract-doc-ownership.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const DISPOSITIONS = new Set([
  "SEMANTIC",
  "TEST_ONLY",
  "GENERATED_ARTIFACT_ONLY",
  "INTERNAL_REFACTOR",
  "NO_SEMANTIC_CHANGE",
  "DOCS_ALREADY_CURRENT",
]);
const RULE_KINDS = new Set(["EXACT", "PREFIX"]);
const GENERATED_TOOLCHAINS = new Set(["NODE", "NODE_RUST_WASM32"]);
const NON_SEMANTIC_PROBE_DISPOSITIONS = new Set(["INTERNAL_REFACTOR", "NO_SEMANTIC_CHANGE"]);
const PROBE_RESULT_SCHEMA = "vector.contract-doc-probe-result.v1";
const FACETS = new Set(["admission", "datum", "delivery", "digest", "evidence", "runtime", "schema", "storage", "ui", "unit", "validity", "verification", "vsr"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, allowed, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) invariant(allowedSet.has(key), `${label} has unknown key ${key}.`);
  for (const key of allowed) invariant(Object.hasOwn(value, key), `${label} is missing key ${key}.`);
}

function requiredString(value, label) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string.`);
  invariant(value === value.normalize("NFC"), `${label} must use NFC Unicode normalization.`);
  return value;
}

function substantiveString(value, label, minimum = 16) {
  requiredString(value, label);
  invariant(value.trim().length >= minimum, `${label} must contain specific evidence, not a generic placeholder.`);
  invariant(!/^(?:n\/?a|none|updated|no change|test(?:ed)?)\.?$/iu.test(value.trim()), `${label} is a generic placeholder.`);
  invariant(!/(?:\breplace this\b|\bplaceholder\b|\btodo\b|\btbd\b|\blorem ipsum\b)/iu.test(value), `${label} is a generic placeholder.`);
  return value;
}

function parseJsonString(raw, state) {
  const start = state.index;
  invariant(raw[state.index] === '"', "Invalid JSON string.");
  state.index += 1;
  let escaped = false;
  while (state.index < raw.length) {
    const character = raw[state.index];
    state.index += 1;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') return JSON.parse(raw.slice(start, state.index));
    invariant(character >= " ", "Control character in JSON string.");
  }
  throw new Error("Unterminated JSON string.");
}

function skipWhitespace(raw, state) {
  while (/\s/u.test(raw[state.index] ?? "")) state.index += 1;
}

function scanJsonValue(raw, state, label) {
  skipWhitespace(raw, state);
  const character = raw[state.index];
  if (character === '"') {
    parseJsonString(raw, state);
    return;
  }
  if (character === "{") {
    state.index += 1;
    skipWhitespace(raw, state);
    const keys = new Set();
    if (raw[state.index] === "}") {
      state.index += 1;
      return;
    }
    while (state.index < raw.length) {
      skipWhitespace(raw, state);
      const key = parseJsonString(raw, state);
      invariant(!keys.has(key), `${label} contains duplicate key ${key}.`);
      keys.add(key);
      skipWhitespace(raw, state);
      invariant(raw[state.index] === ":", `Invalid JSON object after key ${key}.`);
      state.index += 1;
      scanJsonValue(raw, state, label);
      skipWhitespace(raw, state);
      if (raw[state.index] === "}") {
        state.index += 1;
        return;
      }
      invariant(raw[state.index] === ",", "Invalid JSON object separator.");
      state.index += 1;
    }
    throw new Error("Unterminated JSON object.");
  }
  if (character === "[") {
    state.index += 1;
    skipWhitespace(raw, state);
    if (raw[state.index] === "]") {
      state.index += 1;
      return;
    }
    while (state.index < raw.length) {
      scanJsonValue(raw, state, label);
      skipWhitespace(raw, state);
      if (raw[state.index] === "]") {
        state.index += 1;
        return;
      }
      invariant(raw[state.index] === ",", "Invalid JSON array separator.");
      state.index += 1;
    }
    throw new Error("Unterminated JSON array.");
  }
  const remainder = raw.slice(state.index);
  const primitive = remainder.match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u);
  invariant(primitive, "Invalid JSON value.");
  state.index += primitive[0].length;
}

export function parseStrictJson(raw, label = "JSON") {
  invariant(typeof raw === "string", `${label} must be text.`);
  const state = { index: 0 };
  scanJsonValue(raw, state, label);
  skipWhitespace(raw, state);
  invariant(state.index === raw.length, `${label} has trailing content.`);
  return JSON.parse(raw);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalInventory(values) {
  return new Set(values.map((value) => canonicalJson(value)));
}

function requireInventorySubset(beforeValues, afterValues, label) {
  const after = canonicalInventory(afterValues);
  for (const item of canonicalInventory(beforeValues)) invariant(after.has(item), `Head policy removes ${label}.`);
}

function assertPolicyDoesNotWeaken(basePolicy, headPolicy) {
  invariant(headPolicy.policyId === basePolicy.policyId && headPolicy.issue === basePolicy.issue, "Head policy changes immutable policy identity.");
  invariant(headPolicy.declarationBlockName === basePolicy.declarationBlockName, "Head policy changes the declaration block identity.");
  invariant(headPolicy.maxDeclarationBytes <= basePolicy.maxDeclarationBytes, "Head policy increases the declaration byte limit.");
  requireInventorySubset(basePolicy.contractRoots, headPolicy.contractRoots, "contract roots");
  requireInventorySubset(basePolicy.allowedMultiFamilyPaths, headPolicy.allowedMultiFamilyPaths, "declared multi-family ownership");
  requireInventorySubset(basePolicy.nonSemanticProbes, headPolicy.nonSemanticProbes, "non-semantic probes");
  const headFamilies = new Map(headPolicy.families.map((family) => [family.id, family]));
  for (const baseFamily of basePolicy.families) {
    const headFamily = headFamilies.get(baseFamily.id);
    invariant(headFamily, `Head policy removes family ${baseFamily.id}.`);
    invariant(headFamily.workstream === baseFamily.workstream, `Head policy changes ${baseFamily.id} workstream ownership.`);
    for (const field of ["implementationRules", "testRules", "owningSections", "migrationSections"]) {
      requireInventorySubset(baseFamily[field], headFamily[field], `${baseFamily.id}.${field}`);
    }
    const headGroups = new Map(headFamily.generatedGroups.map((group) => [group.id, group]));
    for (const baseGroup of baseFamily.generatedGroups) {
      const headGroup = headGroups.get(baseGroup.id);
      invariant(headGroup, `Head policy removes generated group ${baseFamily.id}.${baseGroup.id}.`);
      invariant(headGroup.toolchainId === baseGroup.toolchainId, `Head policy changes ${baseFamily.id}.${baseGroup.id} freshness toolchain.`);
      invariant(JSON.stringify(headGroup.freshnessArgv) === JSON.stringify(baseGroup.freshnessArgv), `Head policy changes ${baseFamily.id}.${baseGroup.id} freshness command.`);
      for (const field of ["outputRules", "inputRules", "generatorRules"]) {
        requireInventorySubset(baseGroup[field], headGroup[field], `${baseFamily.id}.${baseGroup.id}.${field}`);
      }
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRepositoryPath(value, label = "repository path") {
  requiredString(value, label);
  invariant(!isAbsolute(value), `${label} must be relative.`);
  invariant(!value.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(value), `${label} must not contain controls and must use normalized POSIX separators.`);
  const parts = value.split("/");
  invariant(parts.every((part) => part && part !== "." && part !== ".."), `${label} must be a normalized repository path.`);
  return value;
}

function assertNoSymlink(rootDirectory, repositoryPath) {
  if (!rootDirectory) return;
  const root = realpathSync(rootDirectory);
  const parts = repositoryPath.split("/");
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    if (!existsSync(current)) break;
    invariant(!lstatSync(current).isSymbolicLink(), `${repositoryPath} traverses a symbolic link.`);
    const resolved = realpathSync(current);
    invariant(relative(root, resolved) !== ".." && !relative(root, resolved).startsWith(`..${sep}`), `${repositoryPath} escapes repository root.`);
  }
}

function validateRule(rule, label) {
  exactKeys(rule, ["kind", "value", "facets"], label);
  invariant(RULE_KINDS.has(rule.kind), `${label} has unsupported match kind ${rule.kind}; glob rules are not admitted.`);
  if (rule.kind === "PREFIX") {
    invariant(rule.value.endsWith("/"), `${label} prefix must end with '/'.`);
    normalizeRepositoryPath(rule.value.slice(0, -1), `${label} value`);
  } else {
    normalizeRepositoryPath(rule.value, `${label} value`);
  }
  invariant(Array.isArray(rule.facets) && rule.facets.length > 0, `${label} facets must be non-empty.`);
  const facets = sortedUniqueStrings(rule.facets, `${label} facets`);
  facets.forEach((facet) => invariant(FACETS.has(facet), `${label} has unknown facet ${facet}.`));
}

function ruleMatches(path, rule) {
  return rule.kind === "EXACT" ? path === rule.value : path.startsWith(rule.value);
}

function validateSection(section, label) {
  exactKeys(section, ["sectionId", "path", "heading", "facets"], label);
  invariant(/^[A-Z][A-Z0-9_]*$/u.test(requiredString(section.sectionId, `${label} sectionId`)), `${label} sectionId is invalid.`);
  normalizeRepositoryPath(section.path, `${label} path`);
  invariant(/^#{1,6}\s+\S/u.test(requiredString(section.heading, `${label} heading`)), `${label} heading must be an exact Markdown heading.`);
  invariant(Array.isArray(section.facets) && section.facets.length > 0, `${label} facets must be non-empty.`);
  sortedUniqueStrings(section.facets, `${label} facets`).forEach((facet) => invariant(FACETS.has(facet), `${label} has unknown facet ${facet}.`));
}

function sectionKey(section) {
  return `${section.sectionId}\u0000${section.path}\u0000${section.heading}\u0000${[...section.facets].sort().join(",")}`;
}

function sortedUniqueStrings(values, label) {
  invariant(Array.isArray(values), `${label} must be an array.`);
  values.forEach((value, index) => requiredString(value, `${label}[${index}]`));
  invariant(new Set(values).size === values.length, `${label} contains duplicates.`);
  return [...values].sort();
}

function classifyPath(path, policy) {
  normalizeRepositoryPath(path);
  const familyMatches = [];
  for (const family of policy.families) {
    const kinds = [];
    const facets = new Set();
    for (const rule of family.implementationRules.filter((rule) => ruleMatches(path, rule))) {
      kinds.push("IMPLEMENTATION");
      rule.facets.forEach((facet) => facets.add(facet));
    }
    for (const rule of family.testRules.filter((rule) => ruleMatches(path, rule))) {
      kinds.push("TEST");
      rule.facets.forEach((facet) => facets.add(facet));
    }
    for (const group of family.generatedGroups) {
      for (const rule of group.outputRules.filter((rule) => ruleMatches(path, rule))) { kinds.push(`GENERATED_OUTPUT:${group.id}`); rule.facets.forEach((facet) => facets.add(facet)); }
      for (const rule of group.inputRules.filter((rule) => ruleMatches(path, rule))) { kinds.push(`GENERATED_INPUT:${group.id}`); rule.facets.forEach((facet) => facets.add(facet)); }
      for (const rule of group.generatorRules.filter((rule) => ruleMatches(path, rule))) { kinds.push(`GENERATOR:${group.id}`); rule.facets.forEach((facet) => facets.add(facet)); }
    }
    const documentSections = [...family.owningSections, ...family.migrationSections].filter((section) => section.path === path);
    if (documentSections.length) kinds.push("OWNING_DOCUMENT");
    if (kinds.length) familyMatches.push({ familyId: family.id, kinds: [...new Set(kinds)], facets: [...facets].sort() });
  }
  const nonContractMatches = policy.nonContractRules.filter((rule) => ruleMatches(path, rule));
  invariant(!(familyMatches.length && nonContractMatches.length), `${path} is both contract and non-contract policy surface.`);
  invariant(nonContractMatches.length <= 1, `${path} matches overlapping non-contract rules.`);
  if (familyMatches.length > 1) {
    invariant(policy.allowedMultiFamilyPaths.includes(path), `${path} has undeclared multi-family ownership: ${familyMatches.map((match) => match.familyId).join(", ")}.`);
  }
  if (familyMatches.length) return { kind: "FAMILY", familyMatches };
  if (nonContractMatches.length) return { kind: "NON_CONTRACT", classId: nonContractMatches[0].id };
  if (policy.contractRoots.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))) {
    return { kind: "BLOCKED_UNMAPPED_CONTRACT", familyMatches: [] };
  }
  return { kind: "UNCLASSIFIED" };
}

export function validatePolicy(policy, { rootDirectory, trackedPaths = [] } = {}) {
  exactKeys(policy, [
    "schemaVersion",
    "policyId",
    "issue",
    "bootstrapBaseSha",
    "maxDeclarationBytes",
    "declarationBlockName",
    "allowedDispositions",
    "families",
    "nonSemanticProbes",
    "allowedMultiFamilyPaths",
    "nonContractRules",
    "contractRoots",
    "canonicalSha256",
  ], "contract documentation ownership policy");
  invariant(policy.schemaVersion === POLICY_SCHEMA, `Unsupported policy schema ${policy.schemaVersion}.`);
  invariant(policy.policyId === "VECTOR_CONTRACT_DOC_OWNERSHIP" && policy.issue === "#162", "Policy identity must remain bound to #162.");
  invariant(COMMIT_SHA.test(policy.bootstrapBaseSha), "Policy bootstrapBaseSha must be an exact commit.");
  invariant(Number.isInteger(policy.maxDeclarationBytes) && policy.maxDeclarationBytes >= 1024 && policy.maxDeclarationBytes <= 65536, "Policy declaration byte bound is invalid.");
  requiredString(policy.declarationBlockName, "declaration block name");
  invariant(JSON.stringify(policy.allowedDispositions) === JSON.stringify([...DISPOSITIONS]), "Policy dispositions must equal the closed canonical inventory.");
  invariant(Array.isArray(policy.families) && policy.families.length > 0, "Policy requires contract families.");
  const familyIds = new Set();
  for (const [familyIndex, family] of policy.families.entries()) {
    const label = `families[${familyIndex}]`;
    exactKeys(family, ["id", "workstream", "implementationRules", "testRules", "generatedGroups", "owningSections", "migrationSections"], label);
    requiredString(family.id, `${label} id`);
    invariant(!familyIds.has(family.id), `Duplicate family ${family.id}.`);
    familyIds.add(family.id);
    requiredString(family.workstream, `${label} workstream`);
    invariant(Array.isArray(family.implementationRules) && Array.isArray(family.testRules), `${label} rules must be arrays.`);
    family.implementationRules.forEach((rule, index) => validateRule(rule, `${label}.implementationRules[${index}]`));
    family.testRules.forEach((rule, index) => validateRule(rule, `${label}.testRules[${index}]`));
    invariant(Array.isArray(family.generatedGroups), `${label}.generatedGroups must be an array.`);
    const generatedGroupIds = new Set();
    for (const [groupIndex, group] of family.generatedGroups.entries()) {
      const groupLabel = `${label}.generatedGroups[${groupIndex}]`;
      exactKeys(group, ["id", "toolchainId", "outputRules", "inputRules", "generatorRules", "freshnessArgv"], groupLabel);
      requiredString(group.id, `${groupLabel} id`);
      invariant(!generatedGroupIds.has(group.id), `${label} repeats generated group ${group.id}.`);
      generatedGroupIds.add(group.id);
      invariant(GENERATED_TOOLCHAINS.has(group.toolchainId), `${groupLabel} has unsupported toolchain ${group.toolchainId}.`);
      for (const ruleSet of ["outputRules", "inputRules", "generatorRules"]) {
        invariant(Array.isArray(group[ruleSet]) && group[ruleSet].length > 0, `${groupLabel}.${ruleSet} must be non-empty.`);
        group[ruleSet].forEach((rule, index) => validateRule(rule, `${groupLabel}.${ruleSet}[${index}]`));
      }
      invariant(Array.isArray(group.freshnessArgv) && group.freshnessArgv.length > 1, `${groupLabel}.freshnessArgv must contain an executable and arguments.`);
      group.freshnessArgv.forEach((argument, index) => requiredString(argument, `${groupLabel}.freshnessArgv[${index}]`));
    }
    invariant(Array.isArray(family.owningSections) && family.owningSections.length > 0, `${label} requires owning sections.`);
    family.owningSections.forEach((item, index) => validateSection(item, `${label}.owningSections[${index}]`));
    invariant(new Set(family.owningSections.map(sectionKey)).size === family.owningSections.length, `${label} repeats an owning section.`);
    invariant(Array.isArray(family.migrationSections), `${label}.migrationSections must be an array.`);
    family.migrationSections.forEach((item, index) => validateSection(item, `${label}.migrationSections[${index}]`));
    const owningFacets = new Set(family.owningSections.flatMap((item) => item.facets));
    const governedRules = [
      ...family.implementationRules,
      ...family.testRules,
      ...family.generatedGroups.flatMap((group) => [...group.outputRules, ...group.inputRules, ...group.generatorRules]),
    ];
    for (const rule of governedRules) {
      for (const facet of rule.facets) {
        invariant(owningFacets.has(facet), `${family.id} rule facet ${facet} has no registered owning section.`);
      }
    }
    for (const item of family.migrationSections) {
      for (const facet of item.facets) {
        invariant(owningFacets.has(facet), `${family.id} migration facet ${facet} has no registered owning section.`);
      }
    }
    if (rootDirectory) {
      for (const section of [...family.owningSections, ...family.migrationSections]) {
        const absolute = resolve(rootDirectory, section.path);
        invariant(existsSync(absolute) && lstatSync(absolute).isFile() && !lstatSync(absolute).isSymbolicLink(), `${label} registered document ${section.path} must be a regular file.`);
        markdownSection(readFileSync(absolute, "utf8"), section.heading, `${label} registered section ${section.sectionId}`);
      }
    }
  }
  invariant(Array.isArray(policy.nonSemanticProbes), "nonSemanticProbes must be an array.");
  const probeIds = new Set();
  for (const [probeIndex, probe] of policy.nonSemanticProbes.entries()) {
    const label = `nonSemanticProbes[${probeIndex}]`;
    exactKeys(probe, ["id", "familyId", "disposition", "changedPathRules", "adapterPath", "adapterSha256", "assertionIds"], label);
    invariant(/^[A-Z][A-Z0-9_]*_V\d+$/u.test(requiredString(probe.id, `${label} id`)), `${label} id must be a versioned identifier.`);
    invariant(!probeIds.has(probe.id), `Duplicate non-semantic probe ${probe.id}.`);
    probeIds.add(probe.id);
    const family = policy.families.find((candidate) => candidate.id === probe.familyId);
    invariant(family, `${label} references unknown family ${probe.familyId}.`);
    invariant(NON_SEMANTIC_PROBE_DISPOSITIONS.has(probe.disposition), `${label} has unsupported disposition ${probe.disposition}.`);
    invariant(Array.isArray(probe.changedPathRules) && probe.changedPathRules.length > 0, `${label}.changedPathRules must be non-empty.`);
    probe.changedPathRules.forEach((rule, index) => validateRule(rule, `${label}.changedPathRules[${index}]`));
    normalizeRepositoryPath(probe.adapterPath, `${label}.adapterPath`);
    invariant(probe.adapterPath.startsWith("scripts/contract-doc-probes/") && probe.adapterPath.endsWith(".mjs"), `${label}.adapterPath is outside the trusted probe adapter root.`);
    invariant(SHA256.test(probe.adapterSha256), `${label}.adapterSha256 is invalid.`);
    const assertionIds = sortedUniqueStrings(probe.assertionIds, `${label}.assertionIds`);
    invariant(assertionIds.length > 0 && assertionIds.every((id) => /^[A-Z][A-Z0-9_]*$/u.test(id)), `${label}.assertionIds are invalid.`);
    const owningFacets = new Set(family.owningSections.flatMap((section) => section.facets));
    for (const rule of probe.changedPathRules) {
      for (const facet of rule.facets) invariant(owningFacets.has(facet), `${probe.id} rule facet ${facet} has no registered owning section.`);
    }
    if (rootDirectory) {
      const adapter = resolve(rootDirectory, probe.adapterPath);
      invariant(existsSync(adapter) && lstatSync(adapter).isFile() && !lstatSync(adapter).isSymbolicLink(), `${label} adapter must be a regular file.`);
      invariant(sha256(readFileSync(adapter)) === probe.adapterSha256, `${label} adapter digest mismatch.`);
    }
  }
  sortedUniqueStrings(policy.allowedMultiFamilyPaths, "allowedMultiFamilyPaths").forEach((path) => normalizeRepositoryPath(path, "allowed multi-family path"));
  invariant(Array.isArray(policy.nonContractRules), "nonContractRules must be an array.");
  const nonContractIds = new Set();
  policy.nonContractRules.forEach((rule, index) => {
    exactKeys(rule, ["id", "kind", "value"], `nonContractRules[${index}]`);
    requiredString(rule.id, `nonContractRules[${index}] id`);
    invariant(!nonContractIds.has(rule.id), `Duplicate non-contract rule id ${rule.id}.`);
    nonContractIds.add(rule.id);
    validateRule({ kind: rule.kind, value: rule.value, facets: ["delivery"] }, `nonContractRules[${index}]`);
  });
  sortedUniqueStrings(policy.contractRoots, "contractRoots").forEach((root) => {
    invariant(root.endsWith("/"), "Contract roots must end with '/'.");
    normalizeRepositoryPath(root.slice(0, -1), "contract root");
  });
  if (policy.canonicalSha256 !== undefined) {
    invariant(SHA256.test(policy.canonicalSha256), "Policy canonicalSha256 is invalid.");
    const unsigned = { ...policy };
    delete unsigned.canonicalSha256;
    invariant(sha256(canonicalJson(unsigned)) === policy.canonicalSha256, "Policy canonical digest mismatch.");
  }

  const unclassifiedPaths = [];
  const blockedUnmappedPaths = [];
  for (const path of trackedPaths) {
    normalizeRepositoryPath(path, "tracked path");
    assertNoSymlink(rootDirectory, path);
    const classification = classifyPath(path, policy);
    if (classification?.kind === "UNCLASSIFIED") unclassifiedPaths.push(path);
    if (classification?.kind === "BLOCKED_UNMAPPED_CONTRACT") blockedUnmappedPaths.push(path);
  }
  for (const path of policy.allowedMultiFamilyPaths) {
    const classification = classifyPath(path, policy);
    invariant(classification.kind === "FAMILY" && classification.familyMatches.length > 1, `${path} is listed as multi-family without multiple owners.`);
  }
  if (trackedPaths.length) {
    const assertRuleMatches = (rule, label) => invariant(trackedPaths.some((path) => ruleMatches(path, rule)), `${label} matches no tracked path.`);
    for (const family of policy.families) {
      family.implementationRules.forEach((rule, index) => assertRuleMatches(rule, `${family.id}.implementationRules[${index}]`));
      family.testRules.forEach((rule, index) => assertRuleMatches(rule, `${family.id}.testRules[${index}]`));
      for (const group of family.generatedGroups) {
        group.outputRules.forEach((rule, index) => assertRuleMatches(rule, `${family.id}.${group.id}.outputRules[${index}]`));
        group.inputRules.forEach((rule, index) => assertRuleMatches(rule, `${family.id}.${group.id}.inputRules[${index}]`));
        group.generatorRules.forEach((rule, index) => assertRuleMatches(rule, `${family.id}.${group.id}.generatorRules[${index}]`));
      }
    }
    policy.nonContractRules.forEach((rule, index) => assertRuleMatches(rule, `nonContractRules[${index}]`));
    for (const probe of policy.nonSemanticProbes) {
      const family = policy.families.find((candidate) => candidate.id === probe.familyId);
      for (const [index, rule] of probe.changedPathRules.entries()) {
        assertRuleMatches(rule, `${probe.id}.changedPathRules[${index}]`);
        for (const path of trackedPaths.filter((candidate) => ruleMatches(candidate, rule))) {
          const classification = classifyPath(path, policy);
          invariant(classification.familyMatches?.some((match) => match.familyId === family.id), `${probe.id} covers path outside family ${family.id}: ${path}.`);
        }
      }
    }
  }
  invariant(unclassifiedPaths.length === 0, `Policy leaves tracked paths unclassified: ${unclassifiedPaths.join(", ")}.`);
  invariant(blockedUnmappedPaths.length === 0, `Policy leaves contract-looking paths unmapped: ${blockedUnmappedPaths.join(", ")}.`);
  return { trackedPaths: trackedPaths.length, unclassifiedPaths, blockedUnmappedPaths };
}

function validateEvidence(evidence, label) {
  invariant(Array.isArray(evidence) && evidence.length > 0, `${label} must be a non-empty array.`);
  for (const [index, item] of evidence.entries()) {
    exactKeys(item, ["kind", "value"], `${label}[${index}]`);
    invariant(["TEST", "IDENTITY", "REVIEW"].includes(item.kind), `${label}[${index}] has unknown kind ${item.kind}.`);
    substantiveString(item.value, `${label}[${index}] value`, 12);
  }
}

function validateHistoricalSectionEvidence(item, label) {
  exactKeys(item, ["sectionId", "path", "heading", "facets", "contentSha256", "documentedAtCommit"], label);
  validateSection({ sectionId: item.sectionId, path: item.path, heading: item.heading, facets: item.facets }, label);
  invariant(SHA256.test(item.contentSha256), `${label} content hash is invalid.`);
  invariant(COMMIT_SHA.test(item.documentedAtCommit), `${label} commit is invalid.`);
}

function validateExemptionEvidence(disposition, evidence, label) {
  if (disposition === "SEMANTIC") {
    invariant(evidence === null, `${label} must be null for SEMANTIC changes.`);
    return;
  }
  invariant(evidence && typeof evidence === "object" && !Array.isArray(evidence), `${label} is required for ${disposition}.`);
  invariant(evidence.kind === disposition, `${label} kind must match disposition ${disposition}.`);
  if (disposition === "TEST_ONLY") {
    exactKeys(evidence, ["kind", "paths"], label);
    sortedUniqueStrings(evidence.paths, `${label}.paths`).forEach((path) => normalizeRepositoryPath(path));
  } else if (disposition === "GENERATED_ARTIFACT_ONLY") {
    exactKeys(evidence, ["kind", "groupId"], label);
    requiredString(evidence.groupId, `${label}.groupId`);
  } else if (disposition === "INTERNAL_REFACTOR") {
    exactKeys(evidence, ["kind", "probeIds"], label);
    invariant(sortedUniqueStrings(evidence.probeIds, `${label}.probeIds`).length > 0, `${label}.probeIds must be non-empty.`);
  } else if (disposition === "NO_SEMANTIC_CHANGE") {
    exactKeys(evidence, ["kind", "probeIds"], label);
    invariant(sortedUniqueStrings(evidence.probeIds, `${label}.probeIds`).length > 0, `${label}.probeIds must be non-empty.`);
  } else if (disposition === "DOCS_ALREADY_CURRENT") {
    exactKeys(evidence, ["kind", "sections", "migrationSections"], label);
    invariant(Array.isArray(evidence.sections) && evidence.sections.length > 0, `${label}.sections must be non-empty.`);
    evidence.sections.forEach((item, index) => validateHistoricalSectionEvidence(item, `${label}.sections[${index}]`));
    invariant(Array.isArray(evidence.migrationSections), `${label}.migrationSections must be an array.`);
    evidence.migrationSections.forEach((item, index) => validateHistoricalSectionEvidence(item, `${label}.migrationSections[${index}]`));
  }
}

export function validateDeclaration(declaration, policy, { requiredFamilies } = {}) {
  exactKeys(declaration, ["schemaVersion", "families"], "contract documentation declaration");
  invariant(declaration.schemaVersion === DECLARATION_SCHEMA, `Unsupported declaration schema ${declaration.schemaVersion}.`);
  invariant(Array.isArray(declaration.families), "Declaration families must be an array.");
  const policyFamilies = new Map(policy.families.map((family) => [family.id, family]));
  const ids = new Set();
  for (const [index, item] of declaration.families.entries()) {
    const label = `declaration.families[${index}]`;
    exactKeys(item, ["familyId", "disposition", "owningSections", "rationale", "evidence", "migration", "exemptionEvidence"], label);
    invariant(policyFamilies.has(item.familyId), `${label} references unknown family ${item.familyId}.`);
    invariant(!ids.has(item.familyId), `Declaration repeats family ${item.familyId}.`);
    ids.add(item.familyId);
    invariant(DISPOSITIONS.has(item.disposition), `${label} has unknown disposition ${item.disposition}.`);
    substantiveString(item.rationale, `${label}.rationale`, 24);
    validateEvidence(item.evidence, `${label}.evidence`);
    invariant(Array.isArray(item.owningSections), `${label}.owningSections must be an array.`);
    item.owningSections.forEach((section, sectionIndex) => validateSection(section, `${label}.owningSections[${sectionIndex}]`));
    const registeredSections = new Set(policyFamilies.get(item.familyId).owningSections.map(sectionKey));
    invariant(item.owningSections.every((section) => registeredSections.has(sectionKey(section))), `${label} names an unregistered owning section for ${item.familyId}.`);
    exactKeys(item.migration, ["state", "documents", "rationale"], `${label}.migration`);
    invariant(["NOT_APPLICABLE", "UPDATED", "DOCS_ALREADY_CURRENT"].includes(item.migration.state), `${label}.migration state is invalid.`);
    invariant(Array.isArray(item.migration.documents), `${label}.migration.documents must be an array.`);
    item.migration.documents.forEach((document, documentIndex) => validateSection(document, `${label}.migration.documents[${documentIndex}]`));
    const registeredMigrationSections = new Set(policyFamilies.get(item.familyId).migrationSections.map(sectionKey));
    invariant(item.migration.documents.every((document) => registeredMigrationSections.has(sectionKey(document))), `${label} names an unregistered migration section for ${item.familyId}.`);
    substantiveString(item.migration.rationale, `${label}.migration.rationale`);
    validateExemptionEvidence(item.disposition, item.exemptionEvidence, `${label}.exemptionEvidence`);
  }
  if (requiredFamilies) {
    for (const family of requiredFamilies) invariant(ids.has(family), `Declaration is missing family ${family}.`);
    for (const family of ids) invariant(requiredFamilies.includes(family), `Declaration includes unaffected family ${family}.`);
  }
  return declaration;
}

export function extractDeclarationFromPullRequestBody(body, policy) {
  invariant(typeof body === "string", "Pull request body is unavailable.");
  const escaped = policy.declarationBlockName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`<!--\\s*${escaped}\\s*\\n([\\s\\S]*?)\\n\\s*-->`, "gu");
  const matches = [...body.matchAll(pattern)];
  invariant(matches.length === 1, `Pull request body must contain exactly one ${policy.declarationBlockName} block.`);
  const raw = matches[0][1];
  invariant(Buffer.byteLength(raw, "utf8") <= policy.maxDeclarationBytes, `Contract documentation declaration exceeds ${policy.maxDeclarationBytes} bytes.`);
  return validateDeclaration(parseStrictJson(raw, "contract documentation declaration"), policy);
}

export function parseNameStatusZ(raw) {
  const decoded = Buffer.isBuffer(raw) ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : String(raw);
  const fields = decoded.split("\u0000");
  if (fields.at(-1) === "") fields.pop();
  const operations = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    invariant(/^(?:[AMDTUXB]|R\d{1,3}|C\d{1,3})$/u.test(status), `Invalid diff status ${status || "missing"}.`);
    if (status.startsWith("R") || status.startsWith("C")) {
      invariant(index + 1 < fields.length, `Truncated ${status} diff record.`);
      const oldPath = normalizeRepositoryPath(fields[index++], "old diff path");
      const path = normalizeRepositoryPath(fields[index++], "new diff path");
      operations.push({ status, oldPath, path });
    } else {
      invariant(index < fields.length, `Truncated ${status} diff record.`);
      operations.push({ status, oldPath: null, path: normalizeRepositoryPath(fields[index++], "diff path") });
    }
  }
  return operations;
}

function git(rootDirectory, arguments_, options = {}) {
  return execFileSync("git", arguments_, { cwd: rootDirectory, encoding: options.encoding ?? "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function resolveCommit(rootDirectory, value, label) {
  requiredString(value, label);
  const resolved = git(rootDirectory, ["rev-parse", "--verify", `${value}^{commit}`]).trim();
  invariant(COMMIT_SHA.test(resolved), `${label} did not resolve to an exact commit.`);
  return resolved;
}

function contentAt(rootDirectory, commit, path) {
  try {
    const entry = git(rootDirectory, ["ls-tree", "-z", commit, "--", path]);
    invariant(/^(?:100644|100755) blob [0-9a-f]{40}\t/u.test(entry), `${path} at ${commit} is not a regular Git blob.`);
    return git(rootDirectory, ["show", `${commit}:${path}`]);
  } catch {
    return null;
  }
}

function assertRegisteredSectionsAt(rootDirectory, commit, policy, label) {
  const seen = new Set();
  for (const family of policy.families) {
    for (const section of [...family.owningSections, ...family.migrationSections]) {
      const key = sectionKey(section);
      if (seen.has(key)) continue;
      seen.add(key);
      markdownSection(contentAt(rootDirectory, commit, section.path), section.heading, `${label} ${section.path}`);
    }
  }
}

function markdownSection(content, heading, label) {
  invariant(typeof content === "string", `${label} is unavailable.`);
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const matching = lines.flatMap((line, index) => line === heading ? [index] : []);
  invariant(matching.length === 1, `${label} must contain heading ${heading} exactly once.`);
  const level = heading.match(/^#+/u)[0].length;
  let end = lines.length;
  for (let index = matching[0] + 1; index < lines.length; index += 1) {
    const candidate = lines[index].match(/^(#{1,6})\s+/u);
    if (candidate && candidate[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(matching[0], end).join("\n").normalize("NFC").trimEnd();
}

function materiallyNormalized(content) {
  return content.replace(/\s+/gu, " ").trim();
}

function changedPathsForFamily(pathClassifications, familyId) {
  return pathClassifications
    .filter(({ classification }) => classification.familyMatches?.some((match) => match.familyId === familyId))
    .map(({ path }) => path);
}

function changedFacetsForFamily(pathClassifications, familyId) {
  const facets = new Set();
  for (const { classification } of pathClassifications) {
    const match = classification.familyMatches?.find((candidate) => candidate.familyId === familyId);
    match?.facets.forEach((facet) => facets.add(facet));
  }
  return [...facets].sort();
}

function sectionsForFacets(sections, facets) {
  const required = new Set(facets);
  return sections.filter((section) => section.facets.some((facet) => required.has(facet)));
}

function exactSectionInventory(actual, expected, label) {
  invariant(JSON.stringify(actual.map(sectionKey).sort()) === JSON.stringify(expected.map(sectionKey).sort()), `${label} does not match the registered section inventory.`);
}

export function verifyContractDocImpact({
  rootDirectory = process.cwd(),
  baseSha,
  headSha,
  mergeBaseSha,
  declaration,
  policy,
  basePolicy = policy,
  headPolicy = policy,
  policyBootstrap = false,
  freshnessRunner,
  probeRunner,
}) {
  const root = realpathSync(rootDirectory);
  const base = resolveCommit(root, baseSha, "base SHA");
  const head = resolveCommit(root, headSha, "head SHA");
  const mergeBase = git(root, ["merge-base", base, head]).trim();
  invariant(COMMIT_SHA.test(mergeBase), "Merge base is unavailable.");
  if (mergeBaseSha !== undefined) {
    invariant(resolveCommit(root, mergeBaseSha, "supplied merge-base SHA") === mergeBase, "Supplied merge-base SHA does not match the computed merge base.");
  }
  const baseTrackedPaths = git(root, ["ls-tree", "-r", "--name-only", "-z", mergeBase]).split("\u0000").filter(Boolean);
  const trackedPaths = git(root, ["ls-tree", "-r", "--name-only", "-z", head]).split("\u0000").filter(Boolean);
  if (!policyBootstrap) {
    validatePolicy(basePolicy, { trackedPaths: baseTrackedPaths });
    assertRegisteredSectionsAt(root, mergeBase, basePolicy, "base policy section");
  }
  validatePolicy(headPolicy, { rootDirectory: root, trackedPaths });
  assertRegisteredSectionsAt(root, head, headPolicy, "head policy section");
  if (!policyBootstrap) assertPolicyDoesNotWeaken(basePolicy, headPolicy);
  for (const path of policyBootstrap ? [] : baseTrackedPaths) {
    const before = classifyPath(path, basePolicy);
    if (before.kind !== "FAMILY") continue;
    const after = classifyPath(path, headPolicy);
    invariant(after.kind === "FAMILY", `Head policy removes contract ownership from existing path ${path}.`);
    const beforeFamilies = before.familyMatches.map(({ familyId }) => familyId).sort();
    const afterFamilies = after.familyMatches.map(({ familyId }) => familyId).sort();
    invariant(beforeFamilies.every((familyId) => afterFamilies.includes(familyId)), `Head policy removes family ownership from ${path}.`);
  }
  const diffRaw = execFileSync("git", ["diff", "--name-status", "-z", "--find-renames", "--find-copies", "--find-copies-harder", mergeBase, head], { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const operations = parseNameStatusZ(diffRaw);
  const changedPaths = [...new Set(operations.flatMap((operation) => [operation.oldPath, operation.path]).filter(Boolean))].sort();
  const pathClassifications = [];
  const familyIds = new Set();
  for (const operation of operations) {
    const endpoints = [
      ...(!operation.status.startsWith("A") ? [{ path: operation.oldPath ?? operation.path, endpoint: "OLD", endpointPolicy: policyBootstrap ? headPolicy : basePolicy }] : []),
      ...(!operation.status.startsWith("D") ? [{ path: operation.path, endpoint: "NEW", endpointPolicy: headPolicy }] : []),
    ];
    for (const { path, endpoint, endpointPolicy } of endpoints) {
      if (endpoint === "NEW") assertNoSymlink(root, path);
      const classification = classifyPath(path, endpointPolicy);
      invariant(classification.kind !== "UNCLASSIFIED", `Changed ${endpoint.toLowerCase()} endpoint ${path} is not classified.`);
      invariant(classification.kind !== "BLOCKED_UNMAPPED_CONTRACT", `Changed contract-looking ${endpoint.toLowerCase()} endpoint ${path} is not registered.`);
      pathClassifications.push({ path, endpoint, classification });
      for (const match of classification.familyMatches ?? []) familyIds.add(match.familyId);
    }
  }
  for (const classified of pathClassifications) {
    for (const match of classified.classification.familyMatches ?? []) {
      if (!match.kinds.includes("OWNING_DOCUMENT")) continue;
      const family = headPolicy.families.find((candidate) => candidate.id === match.familyId);
      const sections = [...family.owningSections, ...family.migrationSections].filter((section) => section.path === classified.path);
      const changedSections = sections.filter((section) => {
        const beforeContent = contentAt(root, mergeBase, section.path);
        const afterContent = contentAt(root, head, section.path);
        if (beforeContent === null || afterContent === null) return true;
        const before = markdownSection(beforeContent, section.heading, `${section.path} at base`);
        const after = markdownSection(afterContent, section.heading, `${section.path} at head`);
        return materiallyNormalized(before) !== materiallyNormalized(after);
      });
      invariant(changedSections.length > 0, `${classified.path} changed outside every registered owning section for ${match.familyId}.`);
      match.facets = [...new Set([...match.facets, ...changedSections.flatMap((section) => section.facets)])].sort();
    }
  }
  for (const path of changedPaths) {
    assertNoSymlink(root, path);
  }
  const requiredFamilies = [...familyIds].sort();
  validateDeclaration(declaration, headPolicy, { requiredFamilies });
  if (!requiredFamilies.length) {
    return { state: "NO_RELEVANT_CHANGES", baseSha: base, headSha: head, mergeBaseSha: mergeBase, policyBootstrap, families: [], operations };
  }
  const declarations = new Map(declaration.families.map((item) => [item.familyId, item]));
  for (const familyId of requiredFamilies) {
    const family = headPolicy.families.find((item) => item.id === familyId);
    const item = declarations.get(familyId);
    const familyChangedPaths = [...new Set(changedPathsForFamily(pathClassifications, familyId))].sort();
    const familyChangedFacets = changedFacetsForFamily(pathClassifications, familyId);
    const requiredOwningSections = sectionsForFacets(family.owningSections, familyChangedFacets);
    const requiredMigrationSections = sectionsForFacets(family.migrationSections, familyChangedFacets);
    exactSectionInventory(item.owningSections, requiredOwningSections, `${familyId} owning sections`);
    if (item.disposition !== "SEMANTIC" && item.disposition !== "DOCS_ALREADY_CURRENT") {
      invariant(item.migration.state === "NOT_APPLICABLE" && item.migration.documents.length === 0, `${familyId} non-semantic disposition cannot claim migration documentation.`);
    }
    if (item.disposition === "SEMANTIC") {
      for (const section of requiredOwningSections) {
        const before = markdownSection(contentAt(root, mergeBase, section.path), section.heading, `${section.path} at base`);
        const after = markdownSection(contentAt(root, head, section.path), section.heading, `${section.path} at head`);
        invariant(materiallyNormalized(before) !== materiallyNormalized(after), `${familyId} owning section ${section.path} ${section.heading} did not change materially.`);
      }
      if (requiredMigrationSections.length) {
        invariant(item.migration.state === "UPDATED", `${familyId} requires updated migration/changelog sections.`);
        exactSectionInventory(item.migration.documents, requiredMigrationSections, `${familyId} migration documents`);
        for (const section of requiredMigrationSections) {
          const before = markdownSection(contentAt(root, mergeBase, section.path), section.heading, `${section.path} at base`);
          const after = markdownSection(contentAt(root, head, section.path), section.heading, `${section.path} at head`);
          invariant(materiallyNormalized(before) !== materiallyNormalized(after), `${familyId} migration section ${section.path} ${section.heading} did not change materially.`);
        }
      } else {
        invariant(item.migration.state === "NOT_APPLICABLE" && item.migration.documents.length === 0, `${familyId} has no registered migration section; migration must be NOT_APPLICABLE.`);
      }
    } else if (item.disposition === "TEST_ONLY") {
      invariant(familyChangedPaths.every((path) => family.testRules.some((rule) => ruleMatches(path, rule))), `${familyId} TEST_ONLY includes a non-test path.`);
      invariant(JSON.stringify([...item.exemptionEvidence.paths].sort()) === JSON.stringify(familyChangedPaths), `${familyId} TEST_ONLY paths do not exactly cover the changed test paths.`);
    } else if (item.disposition === "GENERATED_ARTIFACT_ONLY") {
      invariant(!policyBootstrap, `${familyId} GENERATED_ARTIFACT_ONLY is unavailable during policy bootstrap.`);
      const trustedFamily = basePolicy.families.find((candidate) => candidate.id === familyId);
      const group = trustedFamily?.generatedGroups.find((candidate) => candidate.id === item.exemptionEvidence.groupId);
      invariant(group, `${familyId} references an unknown or not-yet-trusted generated group ${item.exemptionEvidence.groupId}.`);
      invariant(familyChangedPaths.every((path) => group.outputRules.some((rule) => ruleMatches(path, rule))), `${familyId} generated-only change includes an input, generator, or non-output path.`);
      invariant(typeof freshnessRunner === "function", `${familyId} generated-only verification requires the registered freshness runner.`);
      freshnessRunner(group);
    } else if (NON_SEMANTIC_PROBE_DISPOSITIONS.has(item.disposition)) {
      invariant(!policyBootstrap, `${familyId} ${item.disposition} is unavailable during policy bootstrap.`);
      invariant(typeof probeRunner === "function", `${familyId} ${item.disposition} is unavailable without the trusted probe runner.`);
      const trustedProbes = new Map(basePolicy.nonSemanticProbes.map((probe) => [probe.id, probe]));
      const selectedProbes = item.exemptionEvidence.probeIds.map((probeId) => {
        const probe = trustedProbes.get(probeId);
        invariant(probe, `${familyId} references an unknown or not-yet-trusted non-semantic probe ${probeId}.`);
        invariant(probe.familyId === familyId, `${probeId} is not authorized for family ${familyId}.`);
        invariant(probe.disposition === item.disposition, `${probeId} is not authorized for disposition ${item.disposition}.`);
        return probe;
      });
      for (const path of familyChangedPaths) {
        const coveringProbes = selectedProbes.filter((probe) => probe.changedPathRules.some((rule) => ruleMatches(path, rule)));
        invariant(coveringProbes.length === 1, `${familyId} changed path ${path} must be covered by exactly one selected non-semantic probe.`);
      }
      for (const probe of selectedProbes) {
        invariant(familyChangedPaths.some((path) => probe.changedPathRules.some((rule) => ruleMatches(path, rule))), `${probe.id} does not cover an affected path for ${familyId}.`);
        const result = probeRunner({ probe, familyId, disposition: item.disposition, mergeBaseSha: mergeBase, headSha: head });
        exactKeys(result, ["schemaVersion", "probeId", "familyId", "disposition", "baseSha", "headSha", "assertions"], `${probe.id} result`);
        invariant(result.schemaVersion === PROBE_RESULT_SCHEMA, `${probe.id} returned an unsupported result schema.`);
        invariant(result.probeId === probe.id && result.familyId === familyId && result.disposition === item.disposition, `${probe.id} returned mismatched authority identity.`);
        invariant(result.baseSha === mergeBase && result.headSha === head, `${probe.id} returned mismatched revision identity.`);
        invariant(Array.isArray(result.assertions), `${probe.id} assertions must be an array.`);
        const expectedAssertionIds = [...probe.assertionIds].sort();
        const actualAssertionIds = result.assertions.map((assertion, index) => {
          exactKeys(assertion, ["id", "status", "beforeSha256", "afterSha256", "evidenceSha256"], `${probe.id}.assertions[${index}]`);
          invariant(assertion.status === "PASS", `${probe.id} assertion ${assertion.id} did not pass.`);
          invariant(SHA256.test(assertion.beforeSha256) && SHA256.test(assertion.afterSha256) && SHA256.test(assertion.evidenceSha256), `${probe.id} assertion ${assertion.id} has invalid evidence identity.`);
          invariant(assertion.beforeSha256 === assertion.afterSha256, `${probe.id} assertion ${assertion.id} changed across revisions.`);
          return requiredString(assertion.id, `${probe.id}.assertions[${index}].id`);
        }).sort();
        invariant(JSON.stringify(actualAssertionIds) === JSON.stringify(expectedAssertionIds), `${probe.id} assertion inventory mismatch.`);
      }
    } else if (item.disposition === "DOCS_ALREADY_CURRENT") {
      exactSectionInventory(item.exemptionEvidence.sections, requiredOwningSections, `${familyId} docs-current evidence`);
      if (requiredMigrationSections.length) {
        invariant(item.migration.state === "DOCS_ALREADY_CURRENT", `${familyId} applicable migration must be DOCS_ALREADY_CURRENT.`);
        exactSectionInventory(item.migration.documents, requiredMigrationSections, `${familyId} migration documents`);
        exactSectionInventory(item.exemptionEvidence.migrationSections, requiredMigrationSections, `${familyId} docs-current migration evidence`);
      } else {
        invariant(item.migration.state === "NOT_APPLICABLE" && item.migration.documents.length === 0, `${familyId} has no applicable migration section; migration must be NOT_APPLICABLE.`);
        invariant(item.exemptionEvidence.migrationSections.length === 0, `${familyId} has no applicable docs-current migration evidence.`);
      }
      const historicalSections = [...item.exemptionEvidence.sections, ...item.exemptionEvidence.migrationSections];
      const documentedCommits = new Set(historicalSections.map((section) => section.documentedAtCommit));
      invariant(documentedCommits.size === 1, `${familyId} DOCS_ALREADY_CURRENT evidence must bind every owning and migration section to the same earlier ancestor.`);
      for (const section of historicalSections) {
        const documentedCommit = resolveCommit(root, section.documentedAtCommit, `${familyId} documentedAtCommit`);
        let isAncestor = true;
        try {
          execFileSync("git", ["merge-base", "--is-ancestor", documentedCommit, mergeBase], { cwd: root, stdio: "ignore" });
        } catch {
          isAncestor = false;
        }
        invariant(isAncestor && documentedCommit !== mergeBase, `${familyId} documentedAtCommit is not an earlier ancestor of the merge base.`);
        const documented = markdownSection(contentAt(root, documentedCommit, section.path), section.heading, `${section.path} at documented commit`);
        const current = markdownSection(contentAt(root, head, section.path), section.heading, `${section.path} at head`);
        invariant(sha256(current) === section.contentSha256 && sha256(documented) === section.contentSha256, `${familyId} DOCS_ALREADY_CURRENT content identity mismatch.`);
      }
    }
  }
  return { state: "VERIFIED", baseSha: base, headSha: head, mergeBaseSha: mergeBase, policyBootstrap, families: requiredFamilies, operations };
}
