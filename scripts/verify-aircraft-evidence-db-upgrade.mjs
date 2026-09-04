import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

import {
  PLATFORMS,
  SOURCES,
  SUBSYSTEMS,
  WEAPONS,
  catalogReviewState,
} from "../lib/capability-data.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
if (process.env.VECTOR_DB_FIXTURE_MODE !== "aircraft-evidence-v1-upgrade") {
  throw new Error("VECTOR_DB_FIXTURE_MODE=aircraft-evidence-v1-upgrade is required");
}

const AFFECTED_SOURCE_IDS = [
  "lockheed-paf-f16-2009",
  "federal-register-paf-f16-2006",
  "dsca-pakistan-15-80",
  "crs-pakistan-f16-rl31675",
  "us-congress-paf-amraam-2008",
];
const PREREQUISITE_SOURCE_IDS = ["pib-astra-contract-2022", "pib-su30-engine-2024"];
const AFFECTED_SUBSYSTEM_IDS = [
  "al-31fp",
  "su30-datalink",
  "f100-pw-229",
  "apg-68v9",
  "alq-211v9",
  "link-16",
];
const AFFECTED_PLATFORM_IDS = [
  "su-30mki",
  "f-16c-block52-paf",
  "f-16d-block52-paf",
  "mirage-2000h",
];
const PREREQUISITE_WEAPON_IDS = ["astra-mk1", "aim-120c5", "mica-ir"];

const LEGACY_SOURCES = [
  {
    id: "lockheed-paf-f16-2009",
    title: "First new F-16 Block 52 for Pakistan",
    publisher: "Lockheed Martin",
    url: "https://news.lockheedmartin.com/2009-10-13-Lockheed-Martin-Unveils-First-New-F-16-for-Pakistan-in-Ceremony-Attended-by-Air-Force-Chiefs",
    published_at: "2009-10-13T00:00:00Z",
    source_class: "MANUFACTURER",
    notes: "Confirms delivery context and the Pakistan Air Force F-16 Block 52 configuration.",
  },
  {
    id: "dsca-pakistan-15-80",
    title: "Pakistan F-16 Block 52 aircraft package, Transmittal 15-80",
    publisher: "Defense Security Cooperation Agency",
    url: "https://www.dsca.mil/Press-Media/Major-Arms-Sales/Major-Arms-Sales-Library/igphoto/2003606313",
    published_at: "2016-02-12T00:00:00Z",
    source_class: "OFFICIAL",
    notes: "Identifies F100-PW-229 engines, AN/APG-68(V)9 radar, ALQ-211(V)9 AIDEWS, and Link 16 in the proposed configuration.",
  },
  {
    id: "us-congress-paf-amraam-2008",
    title: "Pakistan F-16 program status and munitions package",
    publisher: "United States Congress / U.S. Government Publishing Office",
    url: "https://www.congress.gov/110/chrg/CHRG-110hhrg44526/CHRG-110hhrg44526.pdf",
    published_at: "2008-04-16T00:00:00Z",
    source_class: "OFFICIAL",
    notes: "Records the F-16C/D Block 52 program and the AIM-120C-5 AMRAAM quantity in the associated munitions package.",
  },
];

const LEGACY_SUBSYSTEMS = [
  {
    id: "al-31fp",
    kind: "ENGINE",
    designation: "AL-31FP",
    manufacturer: null,
    description: "Twin-engine installation on the Su-30MKI.",
    source_ids: ["pib-su30-engine-2024"],
    data_status: "SOURCED",
  },
  {
    id: "su30-datalink",
    kind: "DATALINK",
    designation: "Weapon-update data link",
    manufacturer: null,
    description: "Modeled as available when supporting Astra mid-course updates.",
    source_ids: ["drdo-astra-2019"],
    data_status: "PARTIAL",
  },
  {
    id: "f100-pw-229",
    kind: "ENGINE",
    designation: "F100-PW-229",
    manufacturer: "Pratt & Whitney",
    description: "Engine identified for the proposed Pakistan F-16 Block 52 configuration.",
    source_ids: ["dsca-pakistan-15-80"],
    data_status: "SOURCED",
  },
  {
    id: "apg-68v9",
    kind: "RADAR",
    designation: "AN/APG-68(V)9",
    manufacturer: null,
    description: "Multimode fire-control radar identified in the proposed Pakistan package.",
    source_ids: ["dsca-pakistan-15-80"],
    data_status: "SOURCED",
  },
  {
    id: "alq-211v9",
    kind: "EW",
    designation: "AN/ALQ-211(V)9 AIDEWS",
    manufacturer: null,
    description: "Defensive electronic-warfare suite identified in the proposed Pakistan package.",
    source_ids: ["dsca-pakistan-15-80"],
    data_status: "SOURCED",
  },
  {
    id: "link-16",
    kind: "DATALINK",
    designation: "Link 16",
    manufacturer: null,
    description: "Tactical data link identified in the proposed Pakistan package.",
    source_ids: ["dsca-pakistan-15-80"],
    data_status: "SOURCED",
  },
];

const LEGACY_PLATFORMS = [
  {
    id: "su-30mki",
    service: "IAF",
    country: "India",
    family: "Su-30",
    variant: "MKI",
    display_name: "Su-30MKI",
    role: "Blue fighter / launch platform",
    crew: 2,
    engine_ids: ["al-31fp", "al-31fp"],
    radar_id: "bars-radar",
    ew_id: "su30-ew",
    datalink_id: "su30-datalink",
    rwr_id: null,
    countermeasure_id: null,
    domains: ["A2A", "A2G"],
    default_loadout: [{ quantity: 2, weaponId: "astra-mk1" }],
    source_ids: ["pib-astra-contract-2022", "pib-su30-engine-2024"],
    data_status: "PARTIAL",
  },
  {
    id: "f-16c-block52-paf",
    service: "PAF",
    country: "Pakistan",
    family: "F-16",
    variant: "C Block 52",
    display_name: "F-16C Block 52",
    role: "Red fighter / opposing track",
    crew: 1,
    engine_ids: ["f100-pw-229"],
    radar_id: "apg-68v9",
    ew_id: "alq-211v9",
    datalink_id: "link-16",
    rwr_id: null,
    countermeasure_id: null,
    domains: ["A2A", "A2G", "G2A"],
    default_loadout: [{ quantity: 2, weaponId: "aim-120c5" }],
    source_ids: [
      "lockheed-paf-f16-2009",
      "dsca-pakistan-15-80",
      "us-congress-paf-amraam-2008",
    ],
    data_status: "SOURCED",
  },
  {
    id: "mirage-2000h",
    service: "IAF",
    country: "India",
    family: "Mirage 2000",
    variant: "H",
    display_name: "Mirage 2000H",
    role: "Blue fighter",
    crew: null,
    engine_ids: [],
    radar_id: null,
    ew_id: null,
    datalink_id: null,
    rwr_id: null,
    countermeasure_id: null,
    domains: ["A2A", "A2G"],
    default_loadout: [{ quantity: 2, weaponId: "mica-ir" }],
    source_ids: [],
    data_status: "UNKNOWN",
  },
];

const LEGACY_COMPATIBILITY = [
  {
    platform_id: "su-30mki",
    weapon_id: "astra-mk1",
    station_group: "CATALOGED_LOADOUT",
    source_ids: ["pib-astra-contract-2022", "pib-su30-engine-2024"],
    status: "CONFIRMED",
  },
  {
    platform_id: "f-16c-block52-paf",
    weapon_id: "aim-120c5",
    station_group: "CATALOGED_LOADOUT",
    source_ids: [
      "lockheed-paf-f16-2009",
      "dsca-pakistan-15-80",
      "us-congress-paf-amraam-2008",
    ],
    status: "CONFIRMED",
  },
  {
    platform_id: "mirage-2000h",
    weapon_id: "mica-ir",
    station_group: "CATALOGED_LOADOUT",
    source_ids: [],
    status: "UNVERIFIED",
  },
];

const LEGACY_ASSERTIONS = [
  ["su-30mki-fact-0-pib-astra-contract-2022", "su-30mki", "publicFacts.0", "Fully integrated on Su-30MKI", "Astra integration", "pib-astra-contract-2022"],
  ["su-30mki-fact-1-pib-su30-engine-2024", "su-30mki", "publicFacts.1", "2 × AL-31FP", "Engine installation", "pib-su30-engine-2024"],
  ["f-16c-block52-paf-fact-0-lockheed-paf-f16-2009", "f-16c-block52-paf", "publicFacts.0", "F-16C/D Block 52 program", "PAF configuration", "lockheed-paf-f16-2009"],
  ["f-16c-block52-paf-fact-0-us-congress-paf-amraam-2008", "f-16c-block52-paf", "publicFacts.0", "F-16C/D Block 52 program", "PAF configuration", "us-congress-paf-amraam-2008"],
  ["f-16c-block52-paf-fact-1-dsca-pakistan-15-80", "f-16c-block52-paf", "publicFacts.1", "F100-PW-229", "Engine", "dsca-pakistan-15-80"],
  ["f-16c-block52-paf-fact-2-dsca-pakistan-15-80", "f-16c-block52-paf", "publicFacts.2", "AN/APG-68(V)9", "Radar", "dsca-pakistan-15-80"],
  ["f-16c-block52-paf-fact-3-dsca-pakistan-15-80", "f-16c-block52-paf", "publicFacts.3", "AN/ALQ-211(V)9 AIDEWS", "Defensive EW", "dsca-pakistan-15-80"],
  ["f-16c-block52-paf-fact-4-dsca-pakistan-15-80", "f-16c-block52-paf", "publicFacts.4", "Link 16", "Datalink", "dsca-pakistan-15-80"],
].map(([id, entity_id, field_path, value_text, condition_text, source_id]) => ({
  id,
  entity_type: "PLATFORM",
  entity_id,
  field_path,
  value_text,
  unit: null,
  condition_text,
  source_id,
  confidence: 0.95,
  review_state: "ACCEPTED",
}));

const EMPTY_CATALOG = {
  sources: [],
  subsystems: [],
  platforms: [],
  compatibility: [],
  assertions: [],
};

const toUtcTimestamp = (value) => value
  ? value.length === 10 ? `${value}T00:00:00Z` : new Date(value).toISOString().replace(".000Z", "Z")
  : null;

function sortedCatalog(catalog) {
  return {
    sources: [...catalog.sources].sort((left, right) => left.id.localeCompare(right.id)),
    subsystems: [...catalog.subsystems].sort((left, right) => left.id.localeCompare(right.id)),
    platforms: [...catalog.platforms].sort((left, right) => left.id.localeCompare(right.id)),
    compatibility: [...catalog.compatibility].sort((left, right) =>
      `${left.platform_id}/${left.weapon_id}/${left.station_group}`.localeCompare(
        `${right.platform_id}/${right.weapon_id}/${right.station_group}`,
      )),
    assertions: [...catalog.assertions].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function currentCatalogProjection() {
  const platforms = PLATFORMS.filter(({ id }) => AFFECTED_PLATFORM_IDS.includes(id));
  return sortedCatalog({
    sources: SOURCES.filter(({ id }) => AFFECTED_SOURCE_IDS.includes(id)).map((source) => ({
      id: source.id,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      published_at: toUtcTimestamp(source.publishedAt),
      source_class: source.sourceClass,
      notes: source.note,
    })),
    subsystems: SUBSYSTEMS.filter(({ id }) => AFFECTED_SUBSYSTEM_IDS.includes(id)).map((subsystem) => ({
      id: subsystem.id,
      kind: subsystem.kind,
      designation: subsystem.designation,
      manufacturer: subsystem.manufacturer ?? null,
      description: subsystem.description,
      source_ids: subsystem.sourceIds,
      data_status: subsystem.status,
    })),
    platforms: platforms.map((platform) => ({
      id: platform.id,
      service: platform.service,
      country: platform.country,
      family: platform.family,
      variant: platform.variant,
      display_name: platform.designation,
      role: platform.role,
      crew: platform.crew ?? null,
      engine_ids: platform.engineIds,
      radar_id: platform.radarId ?? null,
      ew_id: platform.ewId ?? null,
      datalink_id: platform.datalinkId ?? null,
      rwr_id: platform.rwrId ?? null,
      countermeasure_id: platform.countermeasureId ?? null,
      domains: platform.domains,
      default_loadout: platform.defaultLoadout,
      source_ids: platform.sourceIds,
      data_status: platform.status,
    })),
    compatibility: platforms.flatMap((platform) => platform.compatibleWeaponIds.map((weapon_id) => ({
      platform_id: platform.id,
      weapon_id,
      station_group: "CATALOGED_LOADOUT",
      source_ids: platform.sourceIds,
      status: "UNVERIFIED",
    }))),
    assertions: platforms.flatMap((platform) => platform.publicFacts.flatMap((fact, index) =>
      fact.sourceIds.map((source_id) => ({
        id: `${platform.id}-fact-${index}-${source_id}`,
        entity_type: "PLATFORM",
        entity_id: platform.id,
        field_path: `publicFacts.${index}`,
        value_text: fact.value,
        unit: null,
        condition_text: fact.label,
        source_id,
        confidence: fact.status === "SOURCED" ? 0.95 : 0.65,
        review_state: catalogReviewState(fact.status),
      }))),
    ),
  });
}

const CURRENT_CATALOG = currentCatalogProjection();
const LEGACY_CATALOG = sortedCatalog({
  sources: LEGACY_SOURCES,
  subsystems: LEGACY_SUBSYSTEMS,
  platforms: LEGACY_PLATFORMS,
  compatibility: LEGACY_COMPATIBILITY,
  assertions: LEGACY_ASSERTIONS,
});

async function loadMigrations() {
  const directory = resolve("db/migrations");
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  return Promise.all(names.map(async (name) => ({
    name,
    body: await readFile(resolve(directory, name), "utf8"),
  })));
}

async function applyMigration(database, schema, migration, { timeZone } = {}) {
  await database.begin(async (transaction) => {
    await transaction.unsafe("SET LOCAL client_min_messages TO warning");
    await transaction.unsafe(`SET LOCAL search_path TO "${schema}", public`);
    if (timeZone) await transaction.unsafe(`SET LOCAL TIME ZONE '${timeZone}'`);
    await transaction.unsafe(migration.body);
  });
}

async function applyMigrations(database, schema, migrations) {
  for (const migration of migrations) await applyMigration(database, schema, migration);
}

async function withIsolatedSchema(database, label, verification) {
  const schema = `vector_${label}_${randomBytes(6).toString("hex")}`;
  await database.unsafe(`CREATE SCHEMA "${schema}"`);
  try {
    await verification(schema);
  } finally {
    await database.begin(async (transaction) => {
      await transaction.unsafe("SET LOCAL client_min_messages TO warning");
      await transaction.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    });
  }
}

async function insertLegacyCatalog(database, schema) {
  await database.begin(async (transaction) => {
    await transaction.unsafe(`SET LOCAL search_path TO "${schema}", public`);

    const prerequisiteSources = SOURCES.filter(({ id }) => PREREQUISITE_SOURCE_IDS.includes(id));
    for (const source of prerequisiteSources) {
      await transaction`INSERT INTO sources
        (id,title,publisher,url,published_at,source_class,notes)
        VALUES (
          ${source.id},${source.title},${source.publisher},${source.url},
          ${toUtcTimestamp(source.publishedAt)},${source.sourceClass},${source.note}
        )`;
    }
    for (const source of LEGACY_SOURCES) {
      await transaction`INSERT INTO sources
        (id,title,publisher,url,published_at,source_class,notes)
        VALUES (
          ${source.id},${source.title},${source.publisher},${source.url},
          ${source.published_at},${source.source_class},${source.notes}
        )`;
    }

    for (const subsystem of LEGACY_SUBSYSTEMS) {
      await transaction`INSERT INTO subsystems
        (id,kind,designation,manufacturer,description,source_ids,data_status)
        VALUES (
          ${subsystem.id},${subsystem.kind},${subsystem.designation},${subsystem.manufacturer},
          ${subsystem.description},${transaction.json(subsystem.source_ids)},${subsystem.data_status}
        )`;
    }

    const weapons = WEAPONS.filter(({ id }) => PREREQUISITE_WEAPON_IDS.includes(id));
    for (const weapon of weapons) {
      await transaction`INSERT INTO weapons
        (id,country,family,variant,display_name,category,domains,seeker_type,guidance_stages,
         launch_support,published_range_km,range_condition,published_speed_mach,source_ids,data_status)
        VALUES (
          ${weapon.id},${weapon.country},${weapon.name},${weapon.designation},${weapon.designation},
          ${weapon.category},${transaction.json(weapon.domains)},${weapon.seeker},
          ${transaction.json(weapon.guidanceStages)},${weapon.launchSupport},
          ${weapon.publishedRange?.valueKm ?? null},${weapon.publishedRange?.condition ?? null},
          ${weapon.publishedSpeedMach ?? null},${transaction.json(weapon.sourceIds)},${weapon.status}
        )`;
    }

    for (const platform of LEGACY_PLATFORMS) {
      await transaction`INSERT INTO platform_variants
        (id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,
         rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status)
        VALUES (
          ${platform.id},${platform.service},${platform.country},${platform.family},${platform.variant},
          ${platform.display_name},${platform.role},${platform.crew},${transaction.json(platform.engine_ids)},
          ${platform.radar_id},${platform.ew_id},${platform.datalink_id},${platform.rwr_id},
          ${platform.countermeasure_id},${transaction.json(platform.domains)},
          ${transaction.json(platform.default_loadout)},${transaction.json(platform.source_ids)},
          ${platform.data_status}
        )`;
    }

    for (const compatibility of LEGACY_COMPATIBILITY) {
      await transaction`INSERT INTO platform_weapon_compatibility
        (platform_id,weapon_id,station_group,source_ids,status)
        VALUES (
          ${compatibility.platform_id},${compatibility.weapon_id},${compatibility.station_group},
          ${transaction.json(compatibility.source_ids)},${compatibility.status}
        )`;
    }

    for (const assertion of LEGACY_ASSERTIONS) {
      await transaction`INSERT INTO source_assertions
        (id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state)
        VALUES (
          ${assertion.id},${assertion.entity_type},${assertion.entity_id},${assertion.field_path},
          ${assertion.value_text},${assertion.unit},${assertion.condition_text},${assertion.source_id},
          ${assertion.confidence},${assertion.review_state}
        )`;
    }
  });
}

async function readManagedCatalog(database, schema) {
  return database.begin("read only", async (transaction) => {
    await transaction.unsafe(`SET LOCAL search_path TO "${schema}", public`);
    const sources = await transaction`SELECT
      id,title,publisher,url,
      CASE WHEN published_at IS NULL THEN NULL
        ELSE to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') END AS published_at,
      source_class,notes
      FROM sources WHERE id IN ${transaction(AFFECTED_SOURCE_IDS)} ORDER BY id`;
    const subsystems = await transaction`SELECT
      id,kind,designation,manufacturer,description,source_ids,data_status
      FROM subsystems WHERE id IN ${transaction(AFFECTED_SUBSYSTEM_IDS)} ORDER BY id`;
    const platforms = await transaction`SELECT
      id,service,country,family,variant,display_name,role,crew,engine_ids,radar_id,ew_id,datalink_id,
      rwr_id,countermeasure_id,domains,default_loadout,source_ids,data_status
      FROM platform_variants WHERE id IN ${transaction(AFFECTED_PLATFORM_IDS)} ORDER BY id`;
    const compatibility = await transaction`SELECT
      platform_id,weapon_id,station_group,source_ids,status
      FROM platform_weapon_compatibility
      WHERE platform_id IN ${transaction(AFFECTED_PLATFORM_IDS)}
      ORDER BY platform_id,weapon_id,station_group`;
    const assertions = await transaction`SELECT
      id,entity_type,entity_id,field_path,value_text,unit,condition_text,source_id,confidence,review_state
      FROM source_assertions
      WHERE entity_type='PLATFORM' AND entity_id IN ${transaction(AFFECTED_PLATFORM_IDS)}
      ORDER BY id`;
    return sortedCatalog({ sources, subsystems, platforms, compatibility, assertions });
  });
}

async function prepareLegacyProductionLineage(database, schema, migrations) {
  await applyMigrations(database, schema, migrations.filter(({ name }) => name < "017_"));
  await insertLegacyCatalog(database, schema);
  await applyMigrations(
    database,
    schema,
    migrations.filter(({ name }) => name >= "017_" && name < "021_"),
  );
  assert.deepEqual(
    await readManagedCatalog(database, schema),
    LEGACY_CATALOG,
    "migrations 017-020 must preserve the exact three-platform production lineage",
  );
}

async function verifyMigrationUpgrade(database) {
  const migrations = await loadMigrations();
  const migration021 = migrations.find(({ name }) => name.startsWith("021_"));
  assert.ok(migration021, "migration 021 is missing");

  await withIsolatedSchema(database, "aircraft_empty", async (schema) => {
    await applyMigrations(database, schema, migrations);
    assert.deepEqual(
      await readManagedCatalog(database, schema),
      EMPTY_CATALOG,
      "migrate-before-seed must leave an entirely absent catalog untouched",
    );
  });

  await withIsolatedSchema(database, "aircraft_legacy", async (schema) => {
    await prepareLegacyProductionLineage(database, schema, migrations);
    await applyMigration(database, schema, migration021, { timeZone: "Asia/Kolkata" });
    assert.deepEqual(
      await readManagedCatalog(database, schema),
      CURRENT_CATALOG,
      "migration 021 must reconcile the exact production lineage to the current catalog",
    );

    await applyMigration(database, schema, migration021, { timeZone: "Pacific/Auckland" });
    assert.deepEqual(
      await readManagedCatalog(database, schema),
      CURRENT_CATALOG,
      "migration 021 must be an exact-current no-op in every session time zone",
    );
  });

  await withIsolatedSchema(database, "aircraft_conflict", async (schema) => {
    await prepareLegacyProductionLineage(database, schema, migrations);
    await database.begin(async (transaction) => {
      await transaction.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      await transaction`UPDATE platform_variants
        SET variant='unexpected-conflicting-identity'
        WHERE id='f-16c-block52-paf'`;
    });
    const before = await readManagedCatalog(database, schema);
    await assert.rejects(
      applyMigration(database, schema, migration021),
      /rejected an unrecognized or partial affected projection/u,
      "migration 021 must reject an unrecognized affected row",
    );
    assert.deepEqual(
      await readManagedCatalog(database, schema),
      before,
      "a rejected affected-row conflict must roll back without partial catalog changes",
    );
  });

  await withIsolatedSchema(database, "aircraft_dependency", async (schema) => {
    await prepareLegacyProductionLineage(database, schema, migrations);
    await database.begin(async (transaction) => {
      await transaction.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      await transaction`INSERT INTO platform_variants
        (id,service,country,family,variant,display_name,role,engine_ids,ew_id,domains,default_loadout,source_ids,data_status)
        VALUES (
          'unrelated-alq-platform','OTHER','Test','Test','Test','Unrelated ALQ platform',
          'Unrelated migration-preservation fixture',${transaction.json([])},'alq-211v9',
          ${transaction.json([])},${transaction.json([])},${transaction.json([])},'UNKNOWN'
        )`;
    });
    const before = await readManagedCatalog(database, schema);
    await assert.rejects(
      applyMigration(database, schema, migration021),
      /cannot retire alq-211v9 while unrelated catalog rows reference it/u,
      "migration 021 must not retire ALQ-211 while an unrelated platform depends on it",
    );
    assert.deepEqual(
      await readManagedCatalog(database, schema),
      before,
      "an unrelated ALQ dependency must roll back all affected catalog mutations",
    );
    await database.begin("read only", async (transaction) => {
      await transaction.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      const [preserved] = await transaction`SELECT
        (SELECT count(*)::int FROM subsystems WHERE id='alq-211v9') AS subsystem,
        (SELECT count(*)::int FROM platform_variants
          WHERE id='unrelated-alq-platform' AND ew_id='alq-211v9') AS dependent`;
      assert.deepEqual(preserved, { subsystem: 1, dependent: 1 });
    });
  });

  process.stdout.write("aircraft evidence migration 021 upgrade verified\n");
}

function seedCurrentCatalog() {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/seed-db.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`catalog seed failed during upgrade regression: ${result.stderr || result.stdout}`);
  }
}

async function verifySeedUpgrade(database) {
  seedCurrentCatalog();
  await database.begin(async (transaction) => {
    await transaction`INSERT INTO subsystems
      (id,kind,designation,description,source_ids,data_status)
      VALUES (
        'alq-211v9','EW','AN/ALQ-211(V)9 AIDEWS',
        'Legacy proposed-package fit incorrectly retained by the v1 seed.',
        ${transaction.json(["dsca-pakistan-15-80"])},'SOURCED'
      )
      ON CONFLICT (id) DO UPDATE SET
        kind=EXCLUDED.kind,designation=EXCLUDED.designation,description=EXCLUDED.description,
        source_ids=EXCLUDED.source_ids,data_status=EXCLUDED.data_status`;
    await transaction`UPDATE platform_variants
      SET ew_id='alq-211v9',radar_id='apg-68v9',datalink_id='link-16'
      WHERE id='f-16c-block52-paf'`;
    await transaction`INSERT INTO source_assertions
      (id,entity_type,entity_id,field_path,value_text,condition_text,source_id,confidence,review_state)
      VALUES
      ('f-16c-block52-paf-fact-2-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.2','AN/APG-68(V)9','Radar','dsca-pakistan-15-80',0.95,'ACCEPTED'),
      ('f-16c-block52-paf-fact-3-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.3','AN/ALQ-211(V)9 AIDEWS','Defensive EW','dsca-pakistan-15-80',0.95,'ACCEPTED'),
      ('f-16c-block52-paf-fact-4-dsca-pakistan-15-80','PLATFORM','f-16c-block52-paf','publicFacts.4','Link 16','Datalink','dsca-pakistan-15-80',0.95,'ACCEPTED')
      ON CONFLICT (id) DO UPDATE SET
        field_path=EXCLUDED.field_path,value_text=EXCLUDED.value_text,
        condition_text=EXCLUDED.condition_text,source_id=EXCLUDED.source_id,
        confidence=EXCLUDED.confidence,review_state=EXCLUDED.review_state`;
  });
  const [legacy] = await database`SELECT
    (SELECT count(*)::int FROM subsystems WHERE id='alq-211v9') AS alq,
    (SELECT count(*)::int FROM source_assertions
      WHERE entity_id='f-16c-block52-paf' AND review_state='ACCEPTED'
        AND source_id='dsca-pakistan-15-80') AS accepted_dsca`;
  assert.deepEqual(legacy, { alq: 1, accepted_dsca: 3 });

  seedCurrentCatalog();

  const [reconciled] = await database`SELECT
    (SELECT count(*)::int FROM subsystems WHERE id='alq-211v9') AS alq,
    (SELECT count(*)::int FROM source_assertions
      WHERE entity_id='f-16c-block52-paf'
        AND (source_id='dsca-pakistan-15-80' OR condition_text='Defensive EW'
          OR value_text ILIKE '%ALQ-211%')) AS retired_assertions,
    (SELECT count(*)::int FROM source_assertions
      WHERE entity_id='f-16c-block52-paf' AND review_state='CONTEXT_ONLY'
        AND condition_text IN ('Engine','Radar','Datalink','AIM-120C-5')) AS context_assertions,
    (SELECT count(*)::int FROM platform_variants
      WHERE id='f-16c-block52-paf' AND ew_id IS NULL AND radar_id IS NULL AND datalink_id IS NULL) AS cleared_fit`;
  assert.deepEqual(reconciled, {
    alq: 0,
    retired_assertions: 0,
    context_assertions: 5,
    cleared_fit: 1,
  });
  process.stdout.write(`aircraft evidence seed upgrade verified: ${JSON.stringify(reconciled)}\n`);
}

const sql = postgres(connectionString, { max: 1 });
try {
  await verifyMigrationUpgrade(sql);
  await verifySeedUpgrade(sql);
} finally {
  await sql.end();
}
