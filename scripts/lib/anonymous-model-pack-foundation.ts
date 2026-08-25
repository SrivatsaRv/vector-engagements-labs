import assert from "node:assert/strict";

import {
  AIRCRAFT_DERIVATIVE_RECIPE_ID,
  AIRCRAFT_DERIVATIVE_RECIPE_VERSION,
  AIRCRAFT_DERIVATIVE_SCHEMA_VERSION,
  AIRCRAFT_DERIVATIVE_TOOL_ID,
  AIRCRAFT_DERIVATIVE_TOOL_VERSION,
  AIRCRAFT_RAW_SOURCE_SCHEMA_VERSION,
  MODEL_PACK_REQUIREMENT_PROFILE_SCHEMA_VERSION,
  MODEL_PACK_SOURCE_V2_SCHEMA_VERSION,
  aircraftLineageValueDigest,
  listGovernedAircraftScalarFields,
  rebuildAircraftDerivative,
  sha256ArtifactBytes,
  type AircraftDataFamily,
  type AircraftDerivativeRecord,
  type AircraftEvidenceRole,
  type GovernedModelPackCompileInput,
  type ModelPackSourceV2,
  type ModelPackRequirementProfile,
  type SourceUnit,
  type ValidityDomain,
} from "../../lib/model-pack.ts";
import { createCurrentModelPackSource } from "../../lib/reference-model-pack.ts";

function replaceExactIdentities<T>(value: T, identities: Map<string, string>): T {
  return JSON.parse(JSON.stringify(value, (_key, item) =>
    typeof item === "string" ? identities.get(item) ?? item : item
  )) as T;
}

function anonymousSource(packId: string, thrustDelta: number) {
  let source = structuredClone(createCurrentModelPackSource()) as unknown as ModelPackSourceV2;
  const retainedAircraft = source.aircraft[0];
  const retainedLoadout = source.loadouts.find((item) => item.id === retainedAircraft.loadoutModelId)!;
  const retainedStation = retainedLoadout.stations[0];
  const retainedStoreId = retainedStation.compatibleStoreModelIds[0];
  const retainedWeapon = source.weapons.find((item) => item.id === retainedStoreId)!;
  retainedLoadout.stations = [{ ...retainedStation, compatibleStoreModelIds: [retainedStoreId] }];
  source.aircraft = [retainedAircraft];
  source.loadouts = [retainedLoadout];
  source.weapons = [retainedWeapon];
  const aerodynamicIds = new Set([retainedAircraft.aerodynamicModelId, retainedWeapon.aerodynamicModelId]);
  const propulsionIds = new Set([...retainedAircraft.propulsionModelIds, retainedWeapon.propulsionModelId]);
  const sensorIds = new Set([
    ...retainedAircraft.sensorModelIds,
    ...(retainedWeapon.sensorModelId ? [retainedWeapon.sensorModelId] : []),
  ]);
  source.aerodynamics = source.aerodynamics.filter((item) => aerodynamicIds.has(item.id));
  source.propulsion = source.propulsion.filter((item) => propulsionIds.has(item.id));
  source.sensors = source.sensors.filter((item) => sensorIds.has(item.id));
  source.compatibility = source.compatibility.filter((item) =>
    item.loadoutModelId === retainedLoadout.id
    && item.storeModelId === retainedStoreId
    && item.stationGroup === retainedStation.stationGroup
  ).slice(0, 1);
  const retainedModelIds = new Set([
    ...source.aerodynamics, ...source.propulsion, ...source.sensors,
    ...source.aircraft, ...source.weapons, ...source.loadouts,
  ].map((item) => item.id));
  for (const model of [
    ...source.aerodynamics, ...source.propulsion, ...source.sensors,
    ...source.aircraft, ...source.weapons, ...source.loadouts,
  ]) if (model.dependsOn) model.dependsOn = model.dependsOn.filter((id) => retainedModelIds.has(id));
  const retainedCatalogIds = new Set([retainedAircraft.catalogObjectId, retainedWeapon.catalogObjectId]);
  source.catalogIdentities = source.catalogIdentities
    .filter((item) => retainedCatalogIds.has(item.catalogObjectId))
    .map((item) => ({
      ...item,
      definitionModelIds: item.definitionModelIds.filter((id) => retainedModelIds.has(id)),
    }));

  const identities = new Map<string, string>();
  const replaceIds = <T extends { id: string }>(prefix: string, values: T[]) => values.forEach((item, index) => {
    identities.set(item.id, `${prefix}-${index + 1}`);
  });
  replaceIds("anonymous-aerodynamics", source.aerodynamics);
  source.aerodynamics.forEach((model, modelIndex) => model.coefficientTables.forEach((table, tableIndex) => {
    identities.set(table.id, `anonymous-aerodynamics-${modelIndex + 1}-table-${tableIndex + 1}`);
  }));
  replaceIds("anonymous-propulsion", source.propulsion);
  source.propulsion.forEach((model, modelIndex) => {
    identities.set(model.thrustTable.id, `anonymous-propulsion-${modelIndex + 1}-thrust-table`);
    identities.set(model.fuelFlowTable.id, `anonymous-propulsion-${modelIndex + 1}-fuel-flow-table`);
  });
  replaceIds("anonymous-sensor", source.sensors);
  replaceIds("anonymous-aircraft", source.aircraft);
  replaceIds("anonymous-store", source.weapons);
  replaceIds("anonymous-loadout", source.loadouts);
  source.loadouts.forEach((loadout, loadoutIndex) => loadout.stations.forEach((station, stationIndex) => {
    identities.set(station.id, `anonymous-loadout-${loadoutIndex + 1}-station-${stationIndex + 1}`);
  }));
  replaceIds("anonymous-compatibility", source.compatibility);
  source.catalogIdentities.forEach((identity, index) => {
    identities.set(identity.catalogObjectId, `anonymous-catalog-${identity.kind.toLowerCase()}-${index + 1}`);
  });
  replaceIds("anonymous-evidence", source.evidence);
  replaceIds("anonymous-requirement", source.credibility.requirements);
  replaceIds("anonymous-case", source.credibility.cases);
  replaceIds("anonymous-limitation", source.credibility.limitations);
  source = replaceExactIdentities(source, identities);

  source.schemaVersion = MODEL_PACK_SOURCE_V2_SCHEMA_VERSION;
  source.id = packId;
  source.version = "2.0.0";
  source.credibility.id = `${packId}-credibility`;
  source.credibility.version = "2.0.0";
  source.credibility.approvalState = "DRAFT";
  source.credibility.cases = source.credibility.cases.map((item) => ({
    ...item, result: "NOT_RUN", reviewedModelDigest: undefined, executedAt: undefined,
  }));
  source.intendedUses.push({
    schemaVersion: "vector.intended-use.v1",
    id: "vector.intended-use.engine-verification",
    version: "1.0.0",
    question: "Does one anonymous, governed model-pack path preserve deterministic identity and lineage?",
    requiredCapabilities: ["immutable-lineage", "model-pack-compilation"],
    supportedInterpretations: ["anonymous engine mechanism verification"],
    unsupportedInterpretations: ["named-aircraft performance", "production runtime admission"],
  });
  const configurations = ["CONFIGURATION_ALPHA", "CONFIGURATION_BRAVO"];
  const models = [
    ...source.aerodynamics, ...source.propulsion, ...source.sensors,
    ...source.aircraft, ...source.weapons, ...source.loadouts,
  ];
  for (const model of models) model.validityDomain.configurations = [...configurations];
  for (const table of [
    ...source.aerodynamics.flatMap((model) => model.coefficientTables),
    ...source.propulsion.flatMap((model) => [model.thrustTable, model.fuelFlowTable]),
  ]) table.validityDomain.configurations = [...configurations];
  source.credibility.validityDomain.configurations = [...configurations];
  const thrustTable = source.propulsion[0].thrustTable;
  const [idleThrust, maximumThrust] = thrustTable.values;
  thrustTable.axes.push({ semantic: "ALTITUDE", unit: "m", values: [0, 10_000] });
  thrustTable.values = [idleThrust + thrustDelta, idleThrust * 0.8, maximumThrust, maximumThrust * 0.8];
  if (thrustDelta !== 0) source.loadouts[0].stations[0].maximumQuantity += 1;
  const serializedSource = JSON.stringify(source);
  for (const originalIdentity of identities.keys()) {
    assert.ok(
      !serializedSource.includes(JSON.stringify(originalIdentity)),
      `anonymous source retained input identity ${originalIdentity}`,
    );
  }
  return source;
}

type Specification = {
  dataFamily: AircraftDataFamily;
  componentId: string;
  validityDomain: ValidityDomain;
  fields: Array<{ selector: string; unit: SourceUnit; value: string | number | boolean }>;
};

export async function createAnonymousGovernedPublication(
  packId: string,
  thrustDelta = 0,
): Promise<GovernedModelPackCompileInput> {
  const source = anonymousSource(packId, thrustDelta);
  const specifications = new Map<string, Specification>();
  for (const field of listGovernedAircraftScalarFields(source)) {
    const key = `${field.dataFamily}\u0000${field.componentId}`;
    const specification = specifications.get(key) ?? {
      dataFamily: field.dataFamily,
      componentId: field.componentId,
      validityDomain: field.validityDomain,
      fields: [],
    };
    specification.fields.push({ selector: field.selector, unit: field.unit, value: field.value });
    specifications.set(key, specification);
  }
  const familySpecifications = [...specifications.values()];
  const requirementProfile: ModelPackRequirementProfile = {
    schemaVersion: MODEL_PACK_REQUIREMENT_PROFILE_SCHEMA_VERSION,
    id: `${packId}-engine-verification-requirements`,
    version: "1.0.0",
    intendedUse: { id: "vector.intended-use.engine-verification" as const, version: "1.0.0" },
    requirements: familySpecifications.map(({ dataFamily, componentId, validityDomain, fields }, index) => ({
      id: `${dataFamily.toLowerCase().replaceAll("_", "-")}-coverage-${index}`,
      dataFamily,
      applicability: { componentIds: [componentId], configurations: [...validityDomain.configurations] },
      fieldSelectors: fields.map((field) => field.selector),
      requiredEvidenceRoles: ["SOURCE", "VALIDATION"] as AircraftEvidenceRole[],
      required: true,
    })),
  };
  const rawArtifactBytes: GovernedModelPackCompileInput["rawArtifactBytes"] = [];
  const derivativeBytes: GovernedModelPackCompileInput["derivativeBytes"] = [];
  const rawSourceArtifacts: ModelPackSourceV2["governance"]["rawSourceArtifacts"] = [];
  const derivatives: ModelPackSourceV2["governance"]["derivatives"] = [];
  const fieldLineage: ModelPackSourceV2["governance"]["fieldLineage"] = [];
  for (const [familyIndex, { dataFamily, componentId, validityDomain, fields }] of familySpecifications.entries()) {
    for (const configurationId of validityDomain.configurations) {
      for (const evidenceRole of ["SOURCE", "VALIDATION"] as const) {
        const configurationSlug = configurationId.toLowerCase().replaceAll("_", "-");
        const slug = `family-${familyIndex}-${configurationSlug}-${evidenceRole.toLowerCase()}`;
        const rawBytes = new TextEncoder().encode(`${packId}:${slug}:governed raw bytes`);
        const rawDigest = await sha256ArtifactBytes(rawBytes);
        const locator = `urn:vector:anonymous:${packId}:${slug}`;
        const sourceRecord = `record-${familyIndex}-${configurationSlug}`;
        rawSourceArtifacts.push({
          schemaVersion: AIRCRAFT_RAW_SOURCE_SCHEMA_VERSION,
          id: `${packId}-${slug}-raw`, version: "1.0.0",
          subject: { id: componentId, configurationId },
          locator: { uri: locator, retrievedAt: "2026-08-25T00:00:00.000Z", record: sourceRecord },
          mediaType: "application/octet-stream", byteLength: rawBytes.byteLength, contentDigest: rawDigest,
          rights: { licenseId: "CC0-1.0", redistribution: "PERMITTED", exportDisposition: "PUBLIC" },
          eligibility: {
            state: "ENGINE_VERIFICATION_ONLY",
            nonclaims: ["No named-aircraft fidelity", "No production runtime admission"],
          },
        });
        const derivative: AircraftDerivativeRecord = {
          schemaVersion: AIRCRAFT_DERIVATIVE_SCHEMA_VERSION,
          id: `${packId}-${slug}-derivative`, version: "1.0.0",
          subject: { id: componentId, configurationId }, orderedInputDigests: [rawDigest],
          recipe: {
            id: AIRCRAFT_DERIVATIVE_RECIPE_ID, version: AIRCRAFT_DERIVATIVE_RECIPE_VERSION,
            tool: { id: AIRCRAFT_DERIVATIVE_TOOL_ID, version: AIRCRAFT_DERIVATIVE_TOOL_VERSION },
            arguments: ["--si", "--strict"], environmentDigest: "e".repeat(64),
          },
          transformations: fields.map(({ selector, unit }) => ({
            selector, fromUnit: unit, toUnit: unit, frame: "NOT_APPLICABLE",
            datum: "NOT_APPLICABLE", uncertaintyPropagation: "PRESERVED" as const,
          })),
          output: { mediaType: "application/json", byteLength: 0, contentDigest: "0".repeat(64) },
        };
        const derivativeOutput = await rebuildAircraftDerivative(derivative, [{ digest: rawDigest, bytes: rawBytes }]);
        const derivativeDigest = await sha256ArtifactBytes(derivativeOutput);
        derivative.output = { ...derivative.output, byteLength: derivativeOutput.byteLength, contentDigest: derivativeDigest };
        derivatives.push(derivative);
        for (const [fieldIndex, { selector, unit, value }] of fields.entries()) fieldLineage.push({
          id: `${packId}-${slug}-lineage-${fieldIndex}`, selector, dataFamily,
          componentId, configurationId, valueState: "AVAILABLE", evidenceRole,
          valueDigest: await aircraftLineageValueDigest({
            selector, value, unit, frame: "NOT_APPLICABLE", datum: "NOT_APPLICABLE",
          }),
          rawArtifactDigest: rawDigest, derivativeDigest, sourceLocator: locator, sourceRecord, unit,
          frame: "NOT_APPLICABLE", datum: "NOT_APPLICABLE",
          uncertainty: { state: "KNOWN", magnitude: 0, unit },
          validityDomain: structuredClone(validityDomain),
        });
        rawArtifactBytes.push({ digest: rawDigest, bytes: rawBytes });
        derivativeBytes.push({ digest: derivativeDigest, bytes: derivativeOutput });
      }
    }
  }
  source.governance = { requirementProfile, rawSourceArtifacts, derivatives, fieldLineage };
  return { source, rawArtifactBytes, derivativeBytes };
}
