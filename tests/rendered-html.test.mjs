import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register(new URL("./cloudflare-loader.mjs", import.meta.url));

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the VECTOR landing page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /VECTOR/);
  assert.match(html, /Understand the engagement/);
  assert.match(html, /Choose a scenario/);
  assert.match(html, /Live model/);
  assert.doesNotMatch(html, /Instructor Station|Tony Stark/i);
});

test("server-renders the scenario library and configured workbench", async () => {
  const [libraryResponse, workbenchResponse] = await Promise.all([
    render("/scenarios"),
    render("/workbench?scenario=a2a-crossing-intercept"),
  ]);
  assert.equal(libraryResponse.status, 200);
  assert.equal(workbenchResponse.status, 200);
  const [library, workbench] = await Promise.all([
    libraryResponse.text(),
    workbenchResponse.text(),
  ]);
  assert.match(library, /Su-30MKI \/ Astra versus F-16C Block 52/);
  assert.match(library, /All scenarios/);
  assert.match(library, />8</);
  assert.match(workbench, /Review the configured experiment/);
  assert.match(workbench, /Run baseline/);
  assert.match(
    workbench,
    /This confirms model availability, not real-world performance/,
  );
});

test("server-renders model transparency and tactical-symbol references", async () => {
  const [mathResponse, symbolsResponse] = await Promise.all([
    render("/math"),
    render("/symbols"),
  ]);
  assert.equal(mathResponse.status, 200);
  assert.equal(symbolsResponse.status, 200);
  const [math, symbols] = await Promise.all([
    mathResponse.text(),
    symbolsResponse.text(),
  ]);
  assert.match(math, /Math behind VECTOR/);
  assert.match(math, /Proportional-navigation demand/);
  assert.match(math, /Run termination/);
  assert.match(math, /How a displayed result is traced/);
  assert.match(math, /SHA-256 of canonical JSON/);
  assert.match(math, /NASA Glenn/);
  assert.match(symbols, /The exact visual subset used in playback and reports/);
  assert.match(symbols, /Tacview-style analysis subset/);
  assert.match(symbols, /not a NATO symbol set/);
});

test("keeps data facts, model assumptions, RASP, map scope, and persistence explicit", async () => {
  const [capabilityData, simulation, map, api, report, migration, provenanceMigration, spatialMigration, spatialPackageMigration, visualContract, makefile] = await Promise.all(
    [
      readFile(new URL("../lib/capability-data.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/EngagementMap.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/runs/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/report-export.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../db/migrations/002_saved_run_integrity.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../db/migrations/003_scenario_package_provenance.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../db/migrations/004_study_areas.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../db/migrations/005_spatial_scenario_package.sql", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../docs/tacview-visual-subset.md", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../Makefile", import.meta.url), "utf8"),
    ],
  );

  assert.match(capabilityData, /MODEL_ASSUMPTION/);
  assert.match(capabilityData, /Astra Mk-I public-study profile/);
  assert.match(capabilityData, /F-16C Block 52/);
  assert.match(capabilityData, /mbda-mica-2022/);
  assert.match(capabilityData, /rafael-spice-2024/);
  assert.match(capabilityData, /pib-akash-2014/);
  assert.match(capabilityData, /brahmos-block1-2011/);
  assert.match(simulation, /buildRaspTrack/);
  assert.match(simulation, /standardAtmosphere/);
  assert.match(map, /MapScope = "ENGAGEMENT" \| "REGION"/);
  assert.match(map, /map\.fitBounds/);
  assert.match(map, /coverage-envelopes/);
  assert.match(map, /declared-routes/);
  assert.match(map, /direction-vectors/);
  assert.match(map, /launch-events/);
  assert.match(api, /saved_run_snapshots/);
  assert.match(api, /completed run report with recorded frames is required/);
  assert.match(migration, /saved_run_report_required/);
  assert.match(migration, /saved_run_scenario_fk/);
  assert.match(provenanceMigration, /scenario_content_hash/);
  assert.match(provenanceMigration, /compiled_scenario/);
  assert.match(provenanceMigration, /frame_hash/);
  assert.match(spatialMigration, /geometry\(Polygon, 4326\)/);
  assert.match(spatialMigration, /study_area_id/);
  assert.match(spatialPackageMigration, /vector\.scenario\.v2/);
  assert.match(visualContract, /Stowed.*inventory/s);
  assert.match(visualContract, /Detection, tracking, and engagement volumes/);
  assert.match(report, /vector\.engagement-report\.v2/);
  assert.match(report, /normalizedWeaponSpeedPercent/);
  assert.match(makefile, /npm run typecheck/);
});
