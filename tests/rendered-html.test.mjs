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
    /This is a model limit, not a published weapon range/,
  );
});

test("keeps data facts, model assumptions, RASP, and Cloudflare persistence explicit", async () => {
  const [capabilityData, simulation, api, report, makefile] = await Promise.all(
    [
      readFile(new URL("../lib/capability-data.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/simulation.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/runs/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/report-export.ts", import.meta.url), "utf8"),
      readFile(new URL("../Makefile", import.meta.url), "utf8"),
    ],
  );

  assert.match(capabilityData, /MODEL_ASSUMPTION/);
  assert.match(capabilityData, /Astra Mk-I public-study profile/);
  assert.match(capabilityData, /F-16C Block 52/);
  assert.match(simulation, /buildRaspTrack/);
  assert.match(simulation, /standardAtmosphere/);
  assert.match(api, /savedRunSnapshots/);
  assert.match(report, /vector\.engagement-report\.v2/);
  assert.match(report, /normalizedWeaponSpeedPercent/);
  assert.match(makefile, /npm run typecheck/);
});
