import { env } from "cloudflare:workers";
import { PLATFORMS, SOURCES, SUBSYSTEMS, WEAPONS } from "@/lib/capability-data";

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, publisher TEXT NOT NULL, url TEXT NOT NULL, published_at TEXT, source_class TEXT NOT NULL, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS platform_variants (id TEXT PRIMARY KEY NOT NULL, service TEXT NOT NULL, country TEXT NOT NULL, family TEXT NOT NULL, variant TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, crew INTEGER, empty_mass_kg REAL, internal_fuel_kg REAL, max_takeoff_mass_kg REAL, max_published_speed_mach REAL, max_published_g REAL, engine_id TEXT, radar_id TEXT, ew_id TEXT, datalink_id TEXT, source_id TEXT, data_status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS subsystems (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, designation TEXT NOT NULL, manufacturer TEXT, description TEXT NOT NULL, source_id TEXT, data_status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS weapons (id TEXT PRIMARY KEY NOT NULL, country TEXT NOT NULL, family TEXT NOT NULL, variant TEXT NOT NULL, display_name TEXT NOT NULL, category TEXT NOT NULL, seeker_type TEXT, guidance_stages TEXT, launch_support TEXT NOT NULL, motor_type TEXT, published_range_km REAL, range_condition TEXT, published_speed_mach REAL, model_profile_id TEXT NOT NULL, model_version TEXT NOT NULL, model_study_limit_km REAL NOT NULL, model_powered_flight_seconds REAL NOT NULL, model_max_speed_mps REAL NOT NULL, model_turn_g REAL NOT NULL, model_post_burn_loss_mps2 REAL NOT NULL, model_rationale TEXT NOT NULL, source_id TEXT, data_status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS platform_stations (id TEXT PRIMARY KEY NOT NULL, platform_id TEXT NOT NULL, label TEXT NOT NULL, station_group TEXT NOT NULL, max_quantity INTEGER DEFAULT 1 NOT NULL, data_status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS platform_weapon_compatibility (platform_id TEXT NOT NULL, weapon_id TEXT NOT NULL, station_group TEXT NOT NULL, source_id TEXT, status TEXT NOT NULL, PRIMARY KEY(platform_id, weapon_id, station_group))`,
  `CREATE TABLE IF NOT EXISTS source_assertions (id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_path TEXT NOT NULL, value_text TEXT NOT NULL, unit TEXT, condition_text TEXT, source_id TEXT NOT NULL, confidence REAL NOT NULL, review_state TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS saved_run_snapshots (id TEXT PRIMARY KEY NOT NULL, scenario_id TEXT NOT NULL, scenario_version TEXT NOT NULL, engine_version TEXT NOT NULL, blue_force TEXT NOT NULL, red_force TEXT NOT NULL, initial_state TEXT NOT NULL, environment TEXT NOT NULL, model_assumptions TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS assertions_entity_idx ON source_assertions(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS runs_created_idx ON saved_run_snapshots(created_at)`,
];

let initialized = false;

export async function ensureCatalogDb() {
  if (initialized) return;
  const d1 = env.DB;
  if (!d1) throw new Error("D1 binding DB is unavailable");
  await d1.batch(CREATE_STATEMENTS.map((statement) => d1.prepare(statement)));

  const inserts: D1PreparedStatement[] = [];
  for (const source of SOURCES) {
    inserts.push(
      d1
        .prepare(
          `INSERT INTO sources (id,title,publisher,url,published_at,source_class,notes) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,publisher=excluded.publisher,url=excluded.url,published_at=excluded.published_at,source_class=excluded.source_class,notes=excluded.notes`,
        )
        .bind(
          source.id,
          source.title,
          source.publisher,
          source.url,
          source.publishedAt ?? null,
          source.sourceClass,
          source.note,
        ),
    );
  }
  for (const subsystem of SUBSYSTEMS) {
    inserts.push(
      d1
        .prepare(
          `INSERT INTO subsystems (id,kind,designation,manufacturer,description,source_id,data_status) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,designation=excluded.designation,manufacturer=excluded.manufacturer,description=excluded.description,source_id=excluded.source_id,data_status=excluded.data_status`,
        )
        .bind(
          subsystem.id,
          subsystem.kind,
          subsystem.designation,
          subsystem.manufacturer ?? null,
          subsystem.description,
          subsystem.sourceIds[0] ?? null,
          subsystem.status,
        ),
    );
  }
  for (const platform of PLATFORMS) {
    inserts.push(
      d1
        .prepare(
          `INSERT INTO platform_variants (id,service,country,family,variant,display_name,role,crew,engine_id,radar_id,ew_id,datalink_id,source_id,data_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET service=excluded.service,country=excluded.country,family=excluded.family,variant=excluded.variant,display_name=excluded.display_name,role=excluded.role,crew=excluded.crew,engine_id=excluded.engine_id,radar_id=excluded.radar_id,ew_id=excluded.ew_id,datalink_id=excluded.datalink_id,source_id=excluded.source_id,data_status=excluded.data_status`,
        )
        .bind(
          platform.id,
          platform.service,
          platform.country,
          platform.family,
          platform.variant,
          platform.designation,
          platform.role,
          platform.crew ?? null,
          platform.engineIds[0] ?? null,
          platform.radarId ?? null,
          platform.ewId ?? null,
          platform.datalinkId ?? null,
          platform.sourceIds[0] ?? null,
          platform.status,
        ),
    );
    for (const weaponId of platform.compatibleWeaponIds) {
      inserts.push(
        d1
          .prepare(
            `INSERT INTO platform_weapon_compatibility (platform_id,weapon_id,station_group,source_id,status) VALUES (?,?,?,?,?) ON CONFLICT(platform_id,weapon_id,station_group) DO UPDATE SET source_id=excluded.source_id,status=excluded.status`,
          )
          .bind(
            platform.id,
            weaponId,
            "CATALOGED_LOADOUT",
            platform.sourceIds[0] ?? null,
            platform.status === "SOURCED" || platform.id === "su-30mki"
              ? "CONFIRMED"
              : "UNVERIFIED",
          ),
      );
    }
    for (const [index, fact] of platform.publicFacts.entries()) {
      for (const sourceId of fact.sourceIds) {
        inserts.push(
          d1
            .prepare(
              `INSERT INTO source_assertions (id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_text=excluded.value_text,source_id=excluded.source_id,confidence=excluded.confidence,review_state=excluded.review_state`,
            )
            .bind(
              `${platform.id}-fact-${index}-${sourceId}`,
              "PLATFORM",
              platform.id,
              `publicFacts.${index}`,
              fact.value,
              null,
              fact.label,
              sourceId,
              fact.status === "SOURCED" ? 0.95 : 0.65,
              "ACCEPTED",
            ),
        );
      }
    }
  }
  for (const weapon of WEAPONS) {
    inserts.push(
      d1
        .prepare(
          `INSERT INTO weapons (id,country,family,variant,display_name,category,seeker_type,guidance_stages,launch_support,motor_type,published_range_km,range_condition,published_speed_mach,model_profile_id,model_version,model_study_limit_km,model_powered_flight_seconds,model_max_speed_mps,model_turn_g,model_post_burn_loss_mps2,model_rationale,source_id,data_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET country=excluded.country,family=excluded.family,variant=excluded.variant,display_name=excluded.display_name,category=excluded.category,seeker_type=excluded.seeker_type,guidance_stages=excluded.guidance_stages,launch_support=excluded.launch_support,published_range_km=excluded.published_range_km,range_condition=excluded.range_condition,published_speed_mach=excluded.published_speed_mach,model_profile_id=excluded.model_profile_id,model_version=excluded.model_version,model_study_limit_km=excluded.model_study_limit_km,model_powered_flight_seconds=excluded.model_powered_flight_seconds,model_max_speed_mps=excluded.model_max_speed_mps,model_turn_g=excluded.model_turn_g,model_post_burn_loss_mps2=excluded.model_post_burn_loss_mps2,model_rationale=excluded.model_rationale,source_id=excluded.source_id,data_status=excluded.data_status`,
        )
        .bind(
          weapon.id,
          weapon.country,
          weapon.name,
          weapon.designation,
          weapon.designation,
          weapon.category,
          weapon.seeker,
          JSON.stringify(weapon.guidanceStages),
          weapon.launchSupport,
          null,
          weapon.publishedRange?.valueKm ?? null,
          weapon.publishedRange?.condition ?? null,
          weapon.publishedSpeedMach ?? null,
          weapon.model.id,
          weapon.model.version,
          weapon.model.studyLimitKm,
          weapon.model.poweredFlightSeconds,
          weapon.model.modelMaxSpeedMps,
          weapon.model.modelTurnG,
          weapon.model.postBurnLossMps2,
          weapon.model.rationale,
          weapon.sourceIds[0] ?? null,
          weapon.status,
        ),
    );
  }
  for (let start = 0; start < inserts.length; start += 75)
    await d1.batch(inserts.slice(start, start + 75));
  initialized = true;
}
