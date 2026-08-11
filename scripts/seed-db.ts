import postgres from "postgres";
import { createHash } from "node:crypto";
import { PLATFORMS, SOURCES, SUBSYSTEMS, WEAPONS } from "../lib/capability-data.ts";
import { PUBLIC_INSTALLATIONS } from "../lib/installations.ts";
import { OBJECT_CATALOG } from "../lib/object-catalog.ts";
import { SCENARIO_LIBRARY } from "../lib/scenarios.ts";
import { WEAPON_SIMULATION_MODELS } from "../lib/simulation-models.ts";
import { canonicalJson } from "../lib/canonical-json.ts";
import { ENGINE_VERSION } from "../lib/engine/version.ts";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "../lib/scenario-package.ts";
import { STUDY_AREAS } from "../lib/study-areas.ts";
import { compileModelPack } from "../lib/model-pack.ts";
import { createCurrentModelPackSource } from "../lib/reference-model-pack.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const sql = postgres(connectionString, { max: 1 });

const json = (value: unknown) => sql.json(value as never);
const modelPackSource = createCurrentModelPackSource();
const modelPackBundle = await compileModelPack(modelPackSource);
const modelPackSourceHash = createHash("sha256")
  .update(canonicalJson(modelPackSource))
  .digest("hex");
const engineCredibilityManifest = {
  ...modelPackBundle.credibilityManifest,
  id: "browser-point-mass-engine-credibility",
  version: "0.6.0",
  subject: {
    kind: "ENGINE" as const,
    id: ENGINE_VERSION,
    digest: modelPackSource.credibility.engineDigest,
  },
  modelPackDigest: modelPackBundle.pack.digest,
  contentDigest: "",
};
engineCredibilityManifest.contentDigest = createHash("sha256")
  .update(canonicalJson({ ...engineCredibilityManifest, contentDigest: undefined }))
  .digest("hex");

try {
  await sql.begin(async (tx) => {
    for (const intendedUse of modelPackSource.intendedUses) {
      const contentHash = createHash("sha256")
        .update(canonicalJson(intendedUse))
        .digest("hex");
      await tx`INSERT INTO intended_use_contracts
        (id,version,schema_version,definition,content_hash)
        VALUES (${intendedUse.id},${intendedUse.version},${intendedUse.schemaVersion},${json(intendedUse)},${contentHash})
        ON CONFLICT (id,version) DO NOTHING`;
    }
    await tx`INSERT INTO model_pack_sources
      (id,version,schema_version,definition,content_hash,lifecycle_status)
      VALUES (${modelPackSource.id},${modelPackSource.version},${modelPackSource.schemaVersion},${json(modelPackSource)},${modelPackSourceHash},'PUBLISHED')
      ON CONFLICT (id,version) DO NOTHING`;
    await tx`INSERT INTO credibility_manifests
      (id,version,schema_version,subject_kind,subject_id,subject_digest,manifest,content_hash,approval_state)
      VALUES (
        ${modelPackBundle.credibilityManifest.id},${modelPackBundle.credibilityManifest.version},
        ${modelPackBundle.credibilityManifest.schemaVersion},'MODEL_PACK',${modelPackBundle.pack.id},
        ${modelPackBundle.pack.digest},${json(modelPackBundle.credibilityManifest)},
        ${modelPackBundle.credibilityManifest.contentDigest},${modelPackBundle.credibilityManifest.approvalState}
      )
      ON CONFLICT (id,version) DO NOTHING`;
    await tx`INSERT INTO credibility_manifests
      (id,version,schema_version,subject_kind,subject_id,subject_digest,manifest,content_hash,approval_state)
      VALUES (
        ${engineCredibilityManifest.id},${engineCredibilityManifest.version},
        ${engineCredibilityManifest.schemaVersion},'ENGINE',${engineCredibilityManifest.subject.id},
        ${engineCredibilityManifest.subject.digest},${json(engineCredibilityManifest)},
        ${engineCredibilityManifest.contentDigest},${engineCredibilityManifest.approvalState}
      )
      ON CONFLICT (id,version) DO NOTHING`;
    await tx`INSERT INTO compiled_model_packs
      (id,version,schema_version,source_id,source_version,source_hash,digest,payload,credibility_manifest_id,credibility_manifest_version)
      VALUES (
        ${modelPackBundle.pack.id},${modelPackBundle.pack.version},${modelPackBundle.pack.schemaVersion},
        ${modelPackSource.id},${modelPackSource.version},${modelPackSourceHash},${modelPackBundle.pack.digest},
        ${json(modelPackBundle.pack)},${modelPackBundle.credibilityManifest.id},${modelPackBundle.credibilityManifest.version}
      )
      ON CONFLICT (id,version) DO NOTHING`;
    for (const source of [
      ...SOURCES,
      { id: "iaf-stations-wikipedia", title: "List of Indian Air Force stations", publisher: "Wikipedia contributors", url: "https://en.wikipedia.org/wiki/List_of_Indian_Air_Force_stations", sourceClass: "SECONDARY" as const, note: "Public-reference coordinates; individual entries require source review." },
      { id: "shield-paf-orbat-2026-05-19", title: "SHIELD Pakistan Air Force ORBAT seed", publisher: "Reach Defence SHIELD", url: "urn:shield:data:paf_orbat.json", sourceClass: "USER" as const, note: "Operator-supplied, public-reference PAF installation coordinates and attributes compiled from the source-intelligence statement embedded in paf_orbat.json; validated 2026-05-19." },
    ]) {
      await tx`INSERT INTO sources (id,title,publisher,url,published_at,source_class,notes)
        VALUES (${source.id},${source.title},${source.publisher},${source.url},${"publishedAt" in source ? source.publishedAt ?? null : null},${source.sourceClass},${source.note})
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,publisher=EXCLUDED.publisher,url=EXCLUDED.url,published_at=EXCLUDED.published_at,source_class=EXCLUDED.source_class,notes=EXCLUDED.notes`;
    }
    for (const item of SUBSYSTEMS) {
      await tx`INSERT INTO subsystems (id,kind,designation,manufacturer,description,source_ids,data_status)
        VALUES (${item.id},${item.kind},${item.designation},${item.manufacturer ?? null},${item.description},${json(item.sourceIds)},${item.status})
        ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,designation=EXCLUDED.designation,manufacturer=EXCLUDED.manufacturer,description=EXCLUDED.description,source_ids=EXCLUDED.source_ids,data_status=EXCLUDED.data_status`;
    }
    for (const item of WEAPONS) {
      await tx`INSERT INTO weapons (id,country,family,variant,display_name,category,domains,seeker_type,guidance_stages,launch_support,published_range_km,range_condition,published_speed_mach,source_ids,data_status)
        VALUES (${item.id},${item.country},${item.name},${item.designation},${item.designation},${item.category},${json(item.domains)},${item.seeker},${json(item.guidanceStages)},${item.launchSupport},${item.publishedRange?.valueKm ?? null},${item.publishedRange?.condition ?? null},${item.publishedSpeedMach ?? null},${json(item.sourceIds)},${item.status})
        ON CONFLICT (id) DO UPDATE SET country=EXCLUDED.country,family=EXCLUDED.family,variant=EXCLUDED.variant,display_name=EXCLUDED.display_name,category=EXCLUDED.category,domains=EXCLUDED.domains,seeker_type=EXCLUDED.seeker_type,guidance_stages=EXCLUDED.guidance_stages,launch_support=EXCLUDED.launch_support,published_range_km=EXCLUDED.published_range_km,range_condition=EXCLUDED.range_condition,published_speed_mach=EXCLUDED.published_speed_mach,source_ids=EXCLUDED.source_ids,data_status=EXCLUDED.data_status`;
    }
    for (const model of WEAPON_SIMULATION_MODELS.filter(
      (candidate) => !WEAPONS.some((weapon) => weapon.id === candidate.weaponId),
    )) {
      const item = OBJECT_CATALOG.find((candidate) => candidate.id === model.weaponId);
      if (!item) throw new Error(`Missing catalog identity for ${model.weaponId}`);
      const category = item.domains[0] === "A2G"
        ? "AIR_TO_SURFACE"
        : item.domains[0] === "G2A"
          ? "SAM"
          : item.domains[0] === "G2G"
            ? "SURFACE_STRIKE"
            : "AAM_BVR";
      await tx`INSERT INTO weapons (id,country,family,variant,display_name,category,domains,seeker_type,guidance_stages,launch_support,source_ids,data_status)
        VALUES (${item.id},${item.country},${item.name},${item.designation},${item.designation},${category},${json(item.domains)},NULL,${json([])},'UNKNOWN',${json(item.sourceIds ?? [])},'MODEL_ASSUMPTION')
        ON CONFLICT (id) DO UPDATE SET country=EXCLUDED.country,family=EXCLUDED.family,variant=EXCLUDED.variant,display_name=EXCLUDED.display_name,category=EXCLUDED.category,domains=EXCLUDED.domains,source_ids=EXCLUDED.source_ids,data_status=EXCLUDED.data_status`;
    }
    for (const item of PLATFORMS) {
      await tx`INSERT INTO platform_variants (id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status)
        VALUES (${item.id},${item.service},${item.country},${item.family},${item.variant},${item.designation},${item.role},${item.crew ?? null},${json(item.engineIds)},${item.radarId ?? null},${item.ewId ?? null},${item.datalinkId ?? null},${item.rwrId ?? null},${item.countermeasureId ?? null},${json(item.domains)},${json(item.defaultLoadout)},${json(item.sourceIds)},${item.status})
        ON CONFLICT (id) DO UPDATE SET service=EXCLUDED.service,country=EXCLUDED.country,family=EXCLUDED.family,variant=EXCLUDED.variant,display_name=EXCLUDED.display_name,role=EXCLUDED.role,crew=EXCLUDED.crew,engine_ids=EXCLUDED.engine_ids,radar_id=EXCLUDED.radar_id,ew_id=EXCLUDED.ew_id,datalink_id=EXCLUDED.datalink_id,rwr_id=EXCLUDED.rwr_id,countermeasure_id=EXCLUDED.countermeasure_id,domains=EXCLUDED.domains,default_loadout=EXCLUDED.default_loadout,source_ids=EXCLUDED.source_ids,data_status=EXCLUDED.data_status`;
      for (const weaponId of item.compatibleWeaponIds) {
        await tx`INSERT INTO platform_weapon_compatibility (platform_id,weapon_id,station_group,source_ids,status)
          VALUES (${item.id},${weaponId},'CATALOGED_LOADOUT',${json(item.sourceIds)},${item.status === "SOURCED" || item.id === "su-30mki" ? "CONFIRMED" : "UNVERIFIED"})
          ON CONFLICT (platform_id,weapon_id,station_group) DO UPDATE SET source_ids=EXCLUDED.source_ids,status=EXCLUDED.status`;
      }
      for (const [index, fact] of item.publicFacts.entries()) {
        for (const sourceId of fact.sourceIds) {
          await tx`INSERT INTO source_assertions (id,entity_type,entity_id,field_path,value_text,condition_text,source_id,confidence,review_state)
            VALUES (${`${item.id}-fact-${index}-${sourceId}`},'PLATFORM',${item.id},${`publicFacts.${index}`},${fact.value},${fact.label},${sourceId},${fact.status === "SOURCED" ? 0.95 : 0.65},'ACCEPTED')
            ON CONFLICT (id) DO UPDATE SET value_text=EXCLUDED.value_text,source_id=EXCLUDED.source_id,confidence=EXCLUDED.confidence,review_state=EXCLUDED.review_state`;
        }
      }
    }
    for (const item of WEAPON_SIMULATION_MODELS) {
      await tx`INSERT INTO simulation_models (id,weapon_id,version,domains,propulsion_kind,launch_mass_kg,dry_mass_kg,powered_flight_seconds,thrust_newtons,thrust_taper_speed_mps,reference_area_m2,drag_coefficient,navigation_constant,maximum_command_g,seeker_activation_range_m,datalink_update_seconds,value_state,rationale)
        VALUES (${item.id},${item.weaponId},${item.version},${json(item.domains)},${item.propulsionKind},${item.launchMassKg},${item.dryMassKg},${item.poweredFlightSeconds},${item.thrustNewtons},${item.thrustTaperSpeedMps},${item.referenceAreaM2},${item.dragCoefficient},${item.navigationConstant},${item.maximumCommandG},${item.seekerActivationRangeM},${item.datalinkUpdateSeconds},${item.valueState},${item.rationale})
        ON CONFLICT (id) DO UPDATE SET weapon_id=EXCLUDED.weapon_id,version=EXCLUDED.version,domains=EXCLUDED.domains,propulsion_kind=EXCLUDED.propulsion_kind,launch_mass_kg=EXCLUDED.launch_mass_kg,dry_mass_kg=EXCLUDED.dry_mass_kg,powered_flight_seconds=EXCLUDED.powered_flight_seconds,thrust_newtons=EXCLUDED.thrust_newtons,thrust_taper_speed_mps=EXCLUDED.thrust_taper_speed_mps,reference_area_m2=EXCLUDED.reference_area_m2,drag_coefficient=EXCLUDED.drag_coefficient,navigation_constant=EXCLUDED.navigation_constant,maximum_command_g=EXCLUDED.maximum_command_g,seeker_activation_range_m=EXCLUDED.seeker_activation_range_m,datalink_update_seconds=EXCLUDED.datalink_update_seconds,value_state=EXCLUDED.value_state,rationale=EXCLUDED.rationale`;
    }
    for (const item of PUBLIC_INSTALLATIONS) {
      await tx`INSERT INTO installations (id,service,name,icao_code,elevation_ft,runway_info,installation_type,location,public_reference,source_id)
        VALUES (${item.id},${item.service},${item.name},${item.icaoCode ?? null},${item.elevationFt ?? null},${item.runwayInfo ?? null},${item.type},ST_SetSRID(ST_MakePoint(${item.longitude},${item.latitude}),4326),true,${item.sourceId})
        ON CONFLICT (id) DO UPDATE SET service=EXCLUDED.service,name=EXCLUDED.name,icao_code=EXCLUDED.icao_code,elevation_ft=EXCLUDED.elevation_ft,runway_info=EXCLUDED.runway_info,installation_type=EXCLUDED.installation_type,location=EXCLUDED.location,public_reference=EXCLUDED.public_reference,source_id=EXCLUDED.source_id`;
    }
    const pafInstallationIds = PUBLIC_INSTALLATIONS.filter((item) => item.service === "PAF").map((item) => item.id);
    await tx`DELETE FROM installations WHERE service='PAF' AND id NOT IN ${tx(pafInstallationIds)}`;
    for (const area of STUDY_AREAS) {
      const [[west, south], [east, north]] = area.bounds;
      await tx`INSERT INTO study_areas
        (id,name,short_name,description,terrain_class,surface_elevation_m,anchor,boundary,environment_presets,default_environment_preset_id,source_class)
        VALUES (
          ${area.id},${area.name},${area.shortName},${area.description},${area.terrainClass},${area.surfaceElevationM},
          ST_SetSRID(ST_MakePoint(${area.anchor.longitude},${area.anchor.latitude}),4326),
          ST_MakeEnvelope(${west},${south},${east},${north},4326),
          ${json(area.weatherPresets)},${area.defaultWeatherPresetId},${area.sourceClass}
        )
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name,short_name=EXCLUDED.short_name,description=EXCLUDED.description,
          terrain_class=EXCLUDED.terrain_class,surface_elevation_m=EXCLUDED.surface_elevation_m,
          anchor=EXCLUDED.anchor,boundary=EXCLUDED.boundary,environment_presets=EXCLUDED.environment_presets,
          default_environment_preset_id=EXCLUDED.default_environment_preset_id,source_class=EXCLUDED.source_class`;
    }
    for (const item of SCENARIO_LIBRARY) {
      const contentHash = createHash("sha256")
        .update(canonicalJson(item))
        .digest("hex");
      await tx`INSERT INTO scenario_templates
        (id,version,domain,title,status,package,schema_version,content_hash,engine_version,study_area_id,
         intended_use_id,intended_use_version,model_pack_id,model_pack_version,model_pack_digest)
        VALUES (${item.id},${item.version},${item.domain},${item.title},'VALIDATED',${json(item)},${SCENARIO_PACKAGE_SCHEMA_VERSION},${contentHash},${ENGINE_VERSION},${item.scenario.studyAreaId},
          ${item.intendedUse.id},${item.intendedUse.version},${item.modelPack.id},${item.modelPack.version},${item.modelPack.digest})
        ON CONFLICT (id,version) DO UPDATE SET
          domain=EXCLUDED.domain,title=EXCLUDED.title,status=EXCLUDED.status,
          package=EXCLUDED.package,schema_version=EXCLUDED.schema_version,
          content_hash=EXCLUDED.content_hash,engine_version=EXCLUDED.engine_version,
          study_area_id=EXCLUDED.study_area_id,intended_use_id=EXCLUDED.intended_use_id,
          intended_use_version=EXCLUDED.intended_use_version,model_pack_id=EXCLUDED.model_pack_id,
          model_pack_version=EXCLUDED.model_pack_version,model_pack_digest=EXCLUDED.model_pack_digest`;
    }
  });
  const weaponCount = new Set([
    ...WEAPONS.map((item) => item.id),
    ...WEAPON_SIMULATION_MODELS.map((item) => item.weaponId),
  ]).size;
  process.stdout.write(`seeded ${PLATFORMS.length} platforms, ${weaponCount} weapons, ${WEAPON_SIMULATION_MODELS.length} models, 1 compiled model pack, ${PUBLIC_INSTALLATIONS.length} installations, ${STUDY_AREAS.length} study areas, ${SCENARIO_LIBRARY.length} scenarios\n`);
} finally {
  await sql.end();
}
