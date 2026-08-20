import currentBundle from "../../fixtures/model-packs/vector-scalar-study-v0.7.compiled.json" with { type: "json" };
import type { CompiledModelPack } from "../model-pack.ts";
import type { WeaponAdmission } from "./contracts.ts";

/**
 * The generated, content-addressed pack is the sole compiler authority. Runtime
 * must not query the legacy authoring list or infer seeker/support behavior.
 */
export const CURRENT_COMPILED_MODEL_PACK = currentBundle.pack as CompiledModelPack;

export function resolveCompiledWeaponAdmission(
  pack: CompiledModelPack,
  platformCatalogObjectId: string,
  weaponCatalogObjectId: string,
): { weapon: CompiledModelPack["weapons"][number]; admission: WeaponAdmission } {
  const weaponIndex = pack.weapons.findIndex(
    (weapon) => weapon.catalogObjectId === weaponCatalogObjectId,
  );
  if (weaponIndex < 0) {
    throw new Error(`Missing compiled weapon model for ${weaponCatalogObjectId}`);
  }
  const weapon = pack.weapons[weaponIndex];
  const identity = pack.catalogIdentities.find(
    (item) => item.catalogObjectId === weaponCatalogObjectId,
  );
  if (!identity?.definitionModelIds.includes(weapon.id)) {
    throw new Error(`Compiled weapon identity is unresolved for ${weaponCatalogObjectId}`);
  }
  const aircraft = pack.aircraft.find(
    (item) => item.catalogObjectId === platformCatalogObjectId,
  );
  const loadoutIndex = aircraft?.loadoutModelIndex ?? pack.loadouts.findIndex(
    (item) => item.platformCatalogObjectId === platformCatalogObjectId,
  );
  const loadout = pack.loadouts[loadoutIndex];
  if (!loadout || loadout.platformCatalogObjectId !== platformCatalogObjectId) {
    throw new Error(`Missing compiled loadout for ${platformCatalogObjectId}`);
  }
  const rule = pack.compatibility.find(
    (item) =>
      item.platformCatalogObjectId === platformCatalogObjectId &&
      item.loadoutModelIndex === loadoutIndex &&
      item.storeModelIndex === weaponIndex &&
      item.status === "SUPPORTED" &&
      item.maximumQuantity > 0,
  );
  if (!rule) {
    throw new Error(`Incompatible loadout: no supported compiled compatibility rule for ${weaponCatalogObjectId} on ${platformCatalogObjectId}`);
  }
  const station = loadout.stations.find(
    (item) =>
      item.stationGroup === rule.stationGroup &&
      item.maximumQuantity >= rule.maximumQuantity &&
      item.compatibleStoreModelIndexes.includes(weaponIndex),
  );
  if (!station) {
    throw new Error(`No compatible compiled station for ${weaponCatalogObjectId} on ${platformCatalogObjectId}`);
  }
  const aerodynamic = pack.aerodynamics[weapon.aerodynamicModelIndex];
  const propulsion = pack.propulsion[weapon.propulsionModelIndex];
  if (!aerodynamic || !propulsion || !Number.isFinite(weapon.navigationConstant)) {
    throw new Error(`Compiled weapon dependencies are incomplete for ${weaponCatalogObjectId}`);
  }
  return {
    weapon,
    admission: {
      modelPackDigest: pack.digest,
      weaponModelId: weapon.id,
      stationId: station.id,
      compatibilityRuleId: rule.id,
      seekerMode: weapon.seekerMode,
      supportRequirement: weapon.supportRequirement,
      launchAuthorization: weapon.launchAuthorization,
    },
  };
}
