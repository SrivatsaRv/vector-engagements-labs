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

test("server-renders the Vector Engagement Labs landing page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Vector Engagement Labs/);
  assert.match(html, /Build the scenario/);
  assert.match(html, /Pick a scenario/);
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

test("server-renders the blog index, article, and legacy alias", async () => {
  const [indexResponse, articleResponse, aliasResponse] = await Promise.all([
    render("/blog"),
    render("/blog/engagement-simulators-2026-revised"),
    render("/blogs"),
  ]);

  assert.equal(indexResponse.status, 200);
  assert.equal(articleResponse.status, 200);
  assert.equal(aliasResponse.status, 307);
  assert.equal(aliasResponse.headers.get("location"), "http://localhost/blog");

  const [indexHtml, articleHtml] = await Promise.all([
    indexResponse.text(),
    articleResponse.text(),
  ]);

  assert.match(indexHtml, /Engineering blog/);
  assert.match(indexHtml, /What Engagement Simulators Need to Model in 2026/);
  assert.match(indexHtml, /Blog/);

  assert.match(articleHtml, /What Engagement Simulators Need to Model in 2026/);
  assert.match(articleHtml, /Anonymous comments/);
  assert.match(articleHtml, /Sensing pipeline/);
  assert.match(articleHtml, /Back to blog index/);
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
  assert.match(math, /Math behind Vector Engagement Labs/);
  assert.match(math, /Proportional-navigation demand/);
  assert.match(math, /Run termination/);
  assert.match(math, /How a displayed result is traced/);
  assert.match(math, /SHA-256 of canonical JSON/);
  assert.match(math, /NASA Glenn/);
  assert.match(symbols, /Recognisable tactical objects, not generic dots/);
  assert.match(symbols, /Tacview-style analysis subset/);
  assert.match(symbols, /not a NATO symbol set/);
  assert.match(symbols, /Fighter aircraft/);
  assert.match(symbols, /Airborne early warning/);
  assert.match(symbols, /CC BY 3.0/);
});

test("server-renders the blogs index and post routes while preserving legacy /blog redirect", async () => {
  const [legacyResponse, blogsResponse, postResponse] = await Promise.all([
    render("/blog"),
    render("/blogs"),
    render("/blogs/posts/what-engagement-simulators-need-to-model-in-2026"),
  ]);
  assert.equal(legacyResponse.status, 307);
  assert.equal(legacyResponse.headers.get("location"), "http://localhost/blogs");
  assert.equal(blogsResponse.status, 200);
  assert.equal(postResponse.status, 200);

  const [blogs, post] = await Promise.all([
    blogsResponse.text(),
    postResponse.text(),
  ]);
  assert.match(blogs, /Engineering analysis, product notes, and simulation tradecraft/);
  assert.match(blogs, /List/);
  assert.match(blogs, /Grid/);
  assert.match(blogs, /What Engagement Simulators Need to Model in 2026/);
  assert.match(post, /Written by/);
  assert.match(post, /Reading time/);
  assert.match(post, /Training simulators and wargames optimise for different kinds of truth/);
  assert.match(post, /AI agents are useful when the simulation constrains them/);
  assert.match(post, /Comments/);
  assert.match(post, /Copy link/);
});

test("basemap proxy rejects invalid tile coordinates without contacting an upstream", async () => {
  const response = await render("/api/map-tile?z=99&x=0&y=0");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_tile_coordinate" });
});

test("basemap proxy rejects an unknown governed map mode", async () => {
  const response = await render("/api/map-tile?mode=imaginary&z=1&x=0&y=0");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_tile_coordinate" });
});

test("VECTOR map controls share the MIAR-derived navigation contract", async () => {
  const [controls, mapContract, engagement, authoring] = await Promise.all([
    readFile(new URL("../components/VectorMapControls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/vector-map.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/EngagementMap.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ScenarioAuthoringMap.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(controls, /Tilt preview/);
  assert.match(controls, /Reset north and tilt/);
  assert.match(controls, /BRG/);
  assert.match(mapContract, /TACTICAL/);
  assert.match(mapContract, /vector\.map\.basemap\.v1/);
  for (const surface of [engagement, authoring]) {
    assert.match(surface, /touchZoomRotate\.enableRotation\(\)/);
    assert.match(surface, /touchPitch\.disable\(\)/);
    assert.match(surface, /keyboard\.enable\(\)/);
    assert.match(surface, /bearingSnap: 0/);
    assert.match(surface, /ResizeObserver/);
  }
  assert.match(engagement, /label\.textContent = entity\.designation/);
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
  assert.match(api, /buildVerifiedSavedRun/);
  assert.match(api, /server-recomputed/);
  assert.match(api, /MAX_SAVED_RUN_REQUEST_BYTES/);
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

test("responsive workspace reserves footer space and keeps six telemetry plots inside the task surface", async () => {
  const [css, authoringMap] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../components/ScenarioAuthoringMap.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(css, /\.builder\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.builder-scroll\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.builder > footer\.builder-actions,[^{]*\{[^}]*position:\s*static/s);
  assert.match(
    css,
    /grid-template-rows:\s*58px minmax\(220px, 1fr\) 44px clamp\(190px, 23vh, 248px\)/,
  );
  assert.match(css, /\.telemetry-multiples\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(css, /\.scenario-authoring-map-shell\s*\{[^}]*height:\s*clamp\(/s);
  assert.match(authoringMap, /draggable:\s*true/);
  assert.match(authoringMap, /maxBounds/);
  assert.match(authoringMap, /VectorMapControls/);
  assert.match(authoringMap, /AttributionControl/);
  assert.match(authoringMap, /authoring-routes/);
  assert.match(authoringMap, /Waypoint rejected/);
});
