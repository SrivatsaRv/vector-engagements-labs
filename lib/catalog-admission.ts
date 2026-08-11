import {
  COMPILED_MODEL_PACK_SCHEMA_VERSION,
  CREDIBILITY_MANIFEST_SCHEMA_VERSION,
  INTENDED_USE_SCHEMA_VERSION,
} from "./model-pack.ts";
import {
  isStoredScenarioPackage,
  type StoredScenarioPackage,
} from "./scenario-package.ts";

type IntendedUseRow = {
  id: string;
  version: string;
  schema_version: string;
  definition: Record<string, unknown>;
  content_hash: string;
};

type CompiledModelPackRow = {
  id: string;
  version: string;
  schema_version: string;
  digest: string;
  payload: Record<string, unknown>;
  credibility_manifest_id: string;
  credibility_manifest_version: string;
};

type CredibilityManifestRow = {
  id: string;
  version: string;
  schema_version: string;
  subject_kind: string;
  subject_id: string;
  subject_digest: string;
  manifest: Record<string, unknown>;
  content_hash: string;
  approval_state: string;
};

export type CatalogCredibilityAdmission = {
  state: "ADMITTED" | "ADMITTED_WITH_LIMITATIONS";
  intendedUse: { id: string; version: string };
  modelPack: { id: string; version: string; digest: string };
  credibilityManifest: {
    id: string;
    version: string;
    approvalState: string;
    limitations: Array<{
      id: string;
      severity: string;
      statement: string;
    }>;
  };
  scenarioTemplateIds: string[];
};

type CatalogRows = {
  scenarioTemplates: unknown[];
  intendedUses: unknown[];
  compiledModelPacks: unknown[];
  credibilityManifests: unknown[];
};

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Catalog credibility admission failed: ${message}`);
}

function object(value: unknown): Record<string, unknown> {
  requireValue(Boolean(value) && typeof value === "object", "expected an object");
  return value as Record<string, unknown>;
}

function limitationsFrom(manifest: Record<string, unknown>) {
  requireValue(Array.isArray(manifest.limitations), "manifest limitations are missing");
  return manifest.limitations.map((value) => {
    const limitation = object(value);
    requireValue(typeof limitation.id === "string", "limitation id is missing");
    requireValue(typeof limitation.severity === "string", "limitation severity is missing");
    requireValue(typeof limitation.statement === "string", "limitation statement is missing");
    return {
      id: limitation.id,
      severity: limitation.severity,
      statement: limitation.statement,
    };
  });
}

export function admitCatalogCredibility(
  rows: CatalogRows,
): CatalogCredibilityAdmission[] {
  const intendedUses = rows.intendedUses.map(
    (value) => object(value) as unknown as IntendedUseRow,
  );
  const compiledModelPacks = rows.compiledModelPacks.map(
    (value) => object(value) as unknown as CompiledModelPackRow,
  );
  const credibilityManifests = rows.credibilityManifests.map(
    (value) => object(value) as unknown as CredibilityManifestRow,
  );
  const templates = rows.scenarioTemplates.map((value) => {
    requireValue(isStoredScenarioPackage(value), "invalid validated scenario template");
    return value;
  });
  requireValue(templates.length > 0, "no validated scenario templates");

  const groups = new Map<string, StoredScenarioPackage[]>();
  for (const template of templates) {
    const key = [
      template.intended_use_id,
      template.intended_use_version,
      template.model_pack_id,
      template.model_pack_version,
      template.model_pack_digest,
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), template]);
  }

  return [...groups.values()].map((group) => {
    const template = group[0];
    const intendedUse = intendedUses.find(
      (row) =>
        row.id === template.intended_use_id &&
        row.version === template.intended_use_version,
    );
    requireValue(intendedUse, `missing intended use ${template.intended_use_id}@${template.intended_use_version}`);
    requireValue(intendedUse.schema_version === INTENDED_USE_SCHEMA_VERSION, "intended-use schema mismatch");
    requireValue(intendedUse.definition.id === intendedUse.id, "intended-use payload id mismatch");
    requireValue(intendedUse.definition.version === intendedUse.version, "intended-use payload version mismatch");
    requireValue(intendedUse.definition.schemaVersion === intendedUse.schema_version, "intended-use payload schema mismatch");
    requireValue(/^[0-9a-f]{64}$/.test(intendedUse.content_hash), "intended-use content hash is invalid");

    const pack = compiledModelPacks.find(
      (row) =>
        row.id === template.model_pack_id &&
        row.version === template.model_pack_version,
    );
    requireValue(pack, `missing model pack ${template.model_pack_id}@${template.model_pack_version}`);
    requireValue(pack.schema_version === COMPILED_MODEL_PACK_SCHEMA_VERSION, "model-pack schema mismatch");
    requireValue(pack.digest === template.model_pack_digest, "template/model-pack digest mismatch");
    requireValue(pack.payload.id === pack.id, "model-pack payload id mismatch");
    requireValue(pack.payload.version === pack.version, "model-pack payload version mismatch");
    requireValue(pack.payload.schemaVersion === pack.schema_version, "model-pack payload schema mismatch");
    requireValue(pack.payload.digest === pack.digest, "model-pack payload digest mismatch");
    requireValue(pack.payload.unitSystem === "SI", "compiled model pack is not SI");

    const manifest = credibilityManifests.find(
      (row) =>
        row.id === pack.credibility_manifest_id &&
        row.version === pack.credibility_manifest_version,
    );
    requireValue(manifest, `missing credibility manifest ${pack.credibility_manifest_id}@${pack.credibility_manifest_version}`);
    requireValue(manifest.schema_version === CREDIBILITY_MANIFEST_SCHEMA_VERSION, "credibility schema mismatch");
    requireValue(manifest.subject_kind === "MODEL_PACK", "credibility subject kind mismatch");
    requireValue(manifest.subject_id === pack.id, "credibility subject id mismatch");
    requireValue(manifest.subject_digest === pack.digest, "credibility subject digest mismatch");
    requireValue(manifest.manifest.id === manifest.id, "credibility payload id mismatch");
    requireValue(manifest.manifest.version === manifest.version, "credibility payload version mismatch");
    requireValue(manifest.manifest.schemaVersion === manifest.schema_version, "credibility payload schema mismatch");
    requireValue(manifest.manifest.modelPackDigest === pack.digest, "credibility payload pack digest mismatch");
    requireValue(manifest.manifest.approvalState === manifest.approval_state, "credibility approval state mismatch");
    requireValue(manifest.manifest.contentDigest === manifest.content_hash, "credibility content hash mismatch");

    const manifestSubject = object(manifest.manifest.subject);
    requireValue(manifestSubject.kind === "MODEL_PACK", "credibility payload subject kind mismatch");
    requireValue(manifestSubject.id === pack.id, "credibility payload subject id mismatch");
    requireValue(manifestSubject.digest === pack.digest, "credibility payload subject digest mismatch");
    const limitations = limitationsFrom(manifest.manifest);
    requireValue(
      manifest.approval_state === "APPROVED_FOR_DECLARED_USE" || limitations.length > 0,
      "an unapproved pack must carry explicit limitations",
    );

    return {
      state:
        manifest.approval_state === "APPROVED_FOR_DECLARED_USE" &&
        limitations.length === 0
          ? "ADMITTED"
          : "ADMITTED_WITH_LIMITATIONS",
      intendedUse: { id: intendedUse.id, version: intendedUse.version },
      modelPack: { id: pack.id, version: pack.version, digest: pack.digest },
      credibilityManifest: {
        id: manifest.id,
        version: manifest.version,
        approvalState: manifest.approval_state,
        limitations,
      },
      scenarioTemplateIds: group.map((item) => item.id).sort(),
    } satisfies CatalogCredibilityAdmission;
  });
}
