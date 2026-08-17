"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { ReportReplay } from "@/components/ReportReplay";
import { findPlatform, findWeapon, getSource } from "@/lib/capability-data";
import { getCatalogObject } from "@/lib/object-catalog";
import { DEFAULT_SCENARIO_DEFINITION } from "@/lib/scenarios";
import {
  buildReportExport,
  reportExportFilename,
  type ReportData,
} from "@/lib/report-export";
import { simulate, standardAtmosphere } from "@/lib/simulation";
import { ENGINE_VERSION } from "@/lib/engine/version";
import { getStudyArea, getWeatherPreset } from "@/lib/study-areas";

type ActionState = "idle" | "preparing" | "done" | "error";
type PrintState = "idle" | "preparing" | "printing";

const fallbackScenario = {
  ...DEFAULT_SCENARIO_DEFINITION.scenario,
};

const fallback: ReportData = {
  scenario: fallbackScenario,
  result: simulate(fallbackScenario),
  events: [
    {
      id: 1,
      time: 0,
      type: "run",
      title: "Scenario initialized",
      detail: "Guided crossing-target scenario",
    },
    {
      id: 2,
      time: 12.5,
      type: "observation",
      title: "Decision point marked",
      detail: "Geometry began changing rapidly",
    },
    {
      id: 3,
      time: 18,
      type: "fault",
      title: "Track quality degraded",
      detail: "Prepared 8-second fault introduced",
    },
  ],
  createdAt: "2026-08-02T10:00:00.000Z",
  engine: ENGINE_VERSION,
  profileVersion: "public-study-v0.5",
  packageProvenance: {
    schemaVersion: "vector.scenario.v3",
    contentHash: "example",
    draftRevision: 0,
    intendedUse: DEFAULT_SCENARIO_DEFINITION.intendedUse,
    modelPack: DEFAULT_SCENARIO_DEFINITION.modelPack,
  },
  libraryScenario: {
    id: DEFAULT_SCENARIO_DEFINITION.id,
    version: DEFAULT_SCENARIO_DEFINITION.version,
    domain: DEFAULT_SCENARIO_DEFINITION.domain,
    title: DEFAULT_SCENARIO_DEFINITION.title,
    scope: DEFAULT_SCENARIO_DEFINITION.scope,
    targetProfile: DEFAULT_SCENARIO_DEFINITION.targetProfile,
    theatre: DEFAULT_SCENARIO_DEFINITION.theatre,
  },
};

export default function ReportPage() {
  const searchParams = useSearchParams();
  const sampleMode = searchParams.get("sample") === "1";
  const runId = searchParams.get("run");
  const [data, setData] = useState<ReportData>(fallback);
  const [loadState, setLoadState] = useState<
    "example" | "loading" | "saved" | "error"
  >(sampleMode ? "example" : runId ? "loading" : "error");
  const [exportState, setExportState] = useState<ActionState>("idle");
  const [printState, setPrintState] = useState<PrintState>("idle");

  useEffect(() => {
    if (sampleMode || !runId) return;
    const controller = new AbortController();
    const query = `?id=${encodeURIComponent(runId)}`;
    fetch(`/api/runs${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("run unavailable");
        const payload = (await response.json()) as {
          run: { modelAssumptions?: { report?: ReportData } };
        };
        const report = payload.run.modelAssumptions?.report;
        if (!report) throw new Error("report unavailable");
        setData(report);
        setLoadState("saved");
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, [runId, sampleMode]);

  useEffect(() => {
    const beforePrint = () => setPrintState("printing");
    const afterPrint = () => setPrintState("idle");
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  const { scenario, result } = data;
  const libraryScenario = data.libraryScenario ?? fallback.libraryScenario!;
  const bluePlatform = findPlatform(scenario.bluePlatformId);
  const blueWeapon = findWeapon(scenario.blueSystemId);
  const redPlatform = findPlatform(scenario.redObjectId);
  const redWeapon =
    scenario.domain === "A2A" ? findWeapon(scenario.redSystemId) : undefined;
  const blueObject = getCatalogObject(scenario.bluePlatformId);
  const blueSystem = getCatalogObject(scenario.blueSystemId);
  const redObject = getCatalogObject(scenario.redObjectId);
  const bluePlatformName = bluePlatform?.designation ?? blueObject.designation;
  const blueWeaponName = blueWeapon?.designation ?? blueSystem.designation;
  const redPlatformName = redPlatform?.designation ?? redObject.designation;
  const redWeaponName = redWeapon?.designation;
  const reportSourceIds = [
    ...(bluePlatform?.sourceIds ?? blueObject.sourceIds ?? []),
    ...(blueWeapon?.sourceIds ?? blueSystem.sourceIds ?? []),
    ...(redPlatform?.sourceIds ?? redObject.sourceIds ?? []),
    ...(redWeapon?.sourceIds ?? []),
  ];
  const atmosphere = standardAtmosphere(
    scenario.altitude,
    scenario.temperatureOffset,
  );
  const studyArea = getStudyArea(scenario.studyAreaId);
  const weatherPreset = getWeatherPreset(studyArea, scenario.weatherPresetId);
  const driver =
    scenario.maneuver === "steady"
      ? `${scenario.guidance} trajectory and initial range`
      : `${scenario.maneuver} target behaviour and remaining energy`;

  const printReport = () => {
    setPrintState("preparing");
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => window.print()),
    );
  };

  const exportJson = () => {
    setExportState("preparing");
    try {
      const payload = buildReportExport(
        data,
        libraryScenario,
        sampleMode ? "example" : "last-saved",
      );
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
        type: "application/json;charset=utf-8",
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = reportExportFilename(libraryScenario, data.createdAt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 500);
      setExportState("done");
      window.setTimeout(() => setExportState("idle"), 2200);
    } catch {
      setExportState("error");
    }
  };

  return (
    <main className="report-page">
      <header className="report-nav">
        <Link href={`/workbench?scenario=${libraryScenario.id}`}>
          <ArrowLeft size={15} />
          Back to workbench
        </Link>
        <div className="report-output-actions">
          <span className="report-output-scope">Output · this report</span>
          <button
            disabled={
              printState !== "idle" ||
              loadState === "loading" ||
              loadState === "error"
            }
            aria-busy={printState !== "idle"}
            className={printState === "preparing" ? "is-loading" : ""}
            onClick={printReport}
          >
            <Printer size={14} />
            {printLabel(printState)}
          </button>
          <button
            disabled={
              exportState === "preparing" ||
              loadState === "loading" ||
              loadState === "error"
            }
            aria-busy={exportState === "preparing"}
            className={
              exportState === "error"
                ? "is-error"
                : exportState === "preparing"
                  ? "is-loading"
                  : ""
            }
            onClick={exportJson}
          >
            <Download size={14} />
            {exportLabel(exportState)}
          </button>
        </div>
      </header>
      {loadState === "loading" && (
        <section className="report-load-error" aria-live="polite">
          <strong>Preparing saved report</strong>
          <p>Loading the frozen scenario package, engine frames, and source record.</p>
        </section>
      )}
      {loadState === "error" && (
        <section className="report-load-error" role="alert">
          <strong>Saved run unavailable</strong>
          <p>
            This page will not substitute example data for a missing run. Return
            to the workbench, conduct the experiment, and save it again.
          </p>
          <Link href={`/workbench?scenario=${libraryScenario.id}`}>
            Return to the configured scenario
          </Link>
        </section>
      )}
      {(loadState === "saved" || loadState === "example") && (
        <article className="report-sheet">
          <header>
            <div className="report-brand">
              <span>V</span>
              <div>
                <strong>Vector</strong>
                <small>Engagement Labs</small>
              </div>
            </div>
            <div className="report-id">
              <span>
                {loadState === "example"
                  ? "Example result"
                  : loadState === "saved"
                    ? "Saved PostGIS run"
                    : loadState === "loading"
                      ? "Loading saved run"
                      : "Saved run unavailable"}{" "}
                · {libraryScenario.domain}
              </span>
              <strong>
                {runId
                  ? `VEC–${runId.slice(0, 8).toUpperCase()}`
                  : "VEC–EXAMPLE"}
              </strong>
            </div>
          </header>
          <section className="report-title">
            <span>
              {sampleMode ? "Example report" : "Saved session report"} ·{" "}
              {libraryScenario.id}
            </span>
            <h1>{scenario.name}</h1>
            <p>{scenario.objective}</p>
            <div>
              <span className="report-public-mode">
                <ShieldCheck size={13} />
                Public data mode
              </span>
              <span>
                <Check size={13} />
                Reproducible run
              </span>
              <span>Generated {formatReportDate(data.createdAt)}</span>
            </div>
          </section>
          <section className="report-summary">
            <div
              className={
                result.outcome === "Intercept"
                  ? "report-result success"
                  : "report-result caution"
              }
            >
              <span>Model outcome</span>
              <strong>{result.outcome}</strong>
              <p>{result.reason}</p>
            </div>
            <div className="report-metrics">
              <ReportMetric
                label="Closest approach"
                value={`${Math.round(result.closestApproach)} m`}
              />
              <ReportMetric
                label="Time of flight"
                value={`${result.timeOfFlight.toFixed(1)} s`}
              />
              <ReportMetric
                label="End speed"
                value={`${Math.round(result.endSpeed)} m/s`}
              />
              <ReportMetric
                label="Peak demand"
                value={`${result.peakDemand.toFixed(1)} g`}
              />
            </div>
          </section>
          <section className="report-brief">
            <div>
              <span>What was tested</span>
              <strong>{scenario.objective}</strong>
            </div>
            <div>
              <span>Blue Team</span>
              <strong>
                {bluePlatformName} · {blueWeaponName} ×{" "}
                {scenario.blueWeaponQuantity}
              </strong>
            </div>
            <div>
              <span>Red Team</span>
              <strong>
                {redPlatformName}
                {redWeaponName
                  ? ` · ${redWeaponName} × ${scenario.redWeaponQuantity}`
                  : ""}
              </strong>
            </div>
            <div>
              <span>Starting conditions</span>
              <strong>
                {scenario.domain === "G2G"
                  ? `${scenario.range / 1000} km · launcher ${scenario.altitude} m · cruise ${scenario.cruiseAltitude} m · objective ${scenario.altitude + scenario.targetDelta} m`
                  : `${scenario.range / 1000} km · Blue ${scenario.altitude} m · Red ${scenario.altitude + scenario.targetDelta} m · ${scenario.aspect}°`}
              </strong>
            </div>
          </section>
          <section className="report-findings">
            <div>
              <span>Interpretation</span>
              <strong>
                {result.successful
                  ? `The modeled geometry reached the ${scenario.domain === "A2A" ? "intercept" : "fixed-objective"} completion threshold.`
                  : `The modeled geometry did not reach the ${scenario.domain === "A2A" ? "intercept" : "fixed-objective"} completion threshold.`}
              </strong>
            </div>
            <div>
              <span>Primary driver</span>
              <strong>{driver}</strong>
            </div>
            <div>
              <span>Read this as</span>
              <strong>
                A sensitivity result, not verified system performance.
              </strong>
            </div>
          </section>
          <ReportReplay scenario={scenario} result={result} />
          <div className="report-columns">
            <div>
              <ReportSection title="Starting state">
                <dl>
                  <dt>Mission set</dt>
                  <dd>{libraryScenario.domain}</dd>
                  <dt>Map setting</dt>
                  <dd>{libraryScenario.theatre}</dd>
                  <dt>Flight model</dt>
                  <dd>{data.profileVersion}</dd>
                  <dt>Weapon path</dt>
                  <dd>{scenario.guidance}</dd>
                  <dt>Starting distance</dt>
                  <dd>{scenario.range / 1000} km</dd>
                  <dt>{scenario.domain === "G2G" ? "Launcher elevation / speed" : "Blue altitude / speed"}</dt>
                  <dd>
                    {scenario.altitude} m / {scenario.launcherSpeed} m/s
                  </dd>
                  {scenario.domain === "G2G" && (
                    <>
                      <dt>Commanded cruise altitude</dt>
                      <dd>{scenario.cruiseAltitude} m</dd>
                    </>
                  )}
                  <dt>{scenario.domain === "G2G" ? "Objective elevation / speed" : "Red altitude / speed"}</dt>
                  <dd>
                    {scenario.altitude + scenario.targetDelta} m /{" "}
                    {scenario.targetSpeed} m/s
                  </dd>
                  <dt>Crossing angle</dt>
                  <dd>{scenario.aspect}°</dd>
                  <dt>Red behaviour</dt>
                  <dd>
                    {scenario.maneuver} · {scenario.targetG} g
                  </dd>
                </dl>
              </ReportSection>
              {scenario.domain === "A2A" ? (
                <ReportSection title="Information and decisions">
                  <dl>
                    <dt>IAF track source</dt>
                    <dd>
                      {scenario.blueTrackSource
                        .replaceAll("_", " ")
                        .toLowerCase()}
                    </dd>
                    <dt>IAF radar / data link</dt>
                    <dd>
                      {scenario.blueRadarMode.toLowerCase()} /{" "}
                      {scenario.blueDatalink ? "available" : "unavailable"}
                    </dd>
                    <dt>PAF track source</dt>
                    <dd>
                      {scenario.redTrackSource
                        .replaceAll("_", " ")
                        .toLowerCase()}
                    </dd>
                    <dt>PAF radar / data link</dt>
                    <dd>
                      {scenario.redRadarMode.toLowerCase()} /{" "}
                      {scenario.redDatalink ? "available" : "unavailable"}
                    </dd>
                    <dt>IAF / PAF jammer</dt>
                    <dd>
                      {scenario.blueJammer ? "on" : "off"} /{" "}
                      {scenario.redJammer ? "on" : "off"}
                    </dd>
                    <dt>Blue decision</dt>
                    <dd>
                      {scenario.blueDecision.replaceAll("_", " ").toLowerCase()}
                    </dd>
                    <dt>Red decision</dt>
                    <dd>
                      {scenario.redDecision.replaceAll("_", " ").toLowerCase()}
                    </dd>
                  </dl>
                </ReportSection>
              ) : (
                <ReportSection title="Run conditions">
                  <dl>
                    <dt>Objective state</dt>
                    <dd>{scenario.targetSpeed === 0 ? "fixed" : "moving"}</dd>
                    <dt>Eastward wind velocity</dt>
                    <dd>{scenario.wind} m/s</dd>
                    <dt>Wind shift</dt>
                    <dd>
                      {scenario.lossIncreaseAt == null
                        ? "not applied"
                        : `applied at ${scenario.lossIncreaseAt.toFixed(1)} s`}
                    </dd>
                  </dl>
                </ReportSection>
              )}
              <ReportSection title="Atmosphere">
                <dl>
                  <dt>Study area</dt>
                  <dd>{studyArea.shortName}</dd>
                  <dt>Weather preset</dt>
                  <dd>{weatherPreset.label}</dd>
                  <dt>Reference</dt>
                  <dd>NASA educational standard atmosphere</dd>
                  <dt>Temperature</dt>
                  <dd>{(atmosphere.temperatureK - 273.15).toFixed(1)} °C</dd>
                  <dt>Pressure</dt>
                  <dd>{atmosphere.pressureKpa.toFixed(1)} kPa</dd>
                  <dt>Density</dt>
                  <dd>{atmosphere.densityKgM3.toFixed(3)} kg/m³</dd>
                  <dt>Speed of sound</dt>
                  <dd>{Math.round(atmosphere.speedOfSoundMps)} m/s</dd>
                  <dt>Wind vector</dt>
                  <dd>{scenario.wind} E / {scenario.windNorth} N m/s</dd>
                  <dt>Visibility</dt>
                  <dd>{scenario.visibilityKm} km</dd>
                  <dt>Relative humidity</dt>
                  <dd>{scenario.humidityPercent}%</dd>
                </dl>
              </ReportSection>
              <ReportSection title="Next controlled comparison">
                <p>
                  Change one input: starting distance, flight path, wind
                  {scenario.domain === "A2A"
                    ? ", target maneuver, sensor state, or tactical decision"
                    : ""}
                  then repeat the run. Preserve all other inputs so the
                  difference remains interpretable.
                </p>
                <div className="recommendation">
                  <Check size={14} />
                  <span>
                    <strong>Suggested next step</strong>Duplicate this run and
                    change one variable
                  </span>
                </div>
              </ReportSection>
            </div>
            <div>
              <ReportSection title="Session timeline">
                <div className="report-timeline">
                  {data.events.map((event) => (
                    <div key={event.id}>
                      <time>{event.time.toFixed(1)} s</time>
                      <i className={event.type} />
                      <span>
                        <strong>{event.title}</strong>
                        <small>{event.detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </ReportSection>
              <ReportSection title="Provenance">
                <dl>
                  <dt>Scenario library</dt>
                  <dd>
                    {libraryScenario.id} · {libraryScenario.version}
                  </dd>
                  <dt>Engine</dt>
                  <dd>{data.engine}</dd>
                  <dt>Execution backend</dt>
                  <dd>
                    {result.engineRun.diagnostics.backend === "rust-wasm"
                      ? "Rust / WebAssembly"
                      : "TypeScript reference"}
                  </dd>
                  <dt>Scenario package</dt>
                  <dd>
                    {data.packageProvenance
                      ? `${data.packageProvenance.schemaVersion} · ${data.packageProvenance.contentHash.slice(0, 12)} · draft ${data.packageProvenance.draftRevision}`
                      : "Legacy snapshot"}
                  </dd>
                  <dt>Telemetry hash</dt>
                  <dd>
                    {data.packageProvenance?.frameHash?.slice(0, 16) ?? "Not recorded"}
                  </dd>
                  <dt>Intended use</dt>
                  <dd>
                    {data.packageProvenance?.intendedUse
                      ? `${data.packageProvenance.intendedUse.id} · ${data.packageProvenance.intendedUse.version}`
                      : "Not recorded"}
                  </dd>
                  <dt>Compiled model pack</dt>
                  <dd>
                    {data.packageProvenance?.modelPack
                      ? `${data.packageProvenance.modelPack.id}@${data.packageProvenance.modelPack.version} · ${data.packageProvenance.modelPack.digest.slice(0, 16)}`
                      : "Not recorded"}
                  </dd>
                  <dt>Credibility state</dt>
                  <dd>
                    {data.packageProvenance?.credibilityManifest?.approvalState ??
                      "No manifest loaded for this example"}
                  </dd>
                  <dt>Weapon model</dt>
                  <dd>{data.profileVersion}</dd>
                  <dt>Model scope</dt>
                  <dd>{libraryScenario.scope}</dd>
                  <dt>Random seed</dt>
                  <dd>{scenario.seed}</dd>
                  <dt>Catalog state</dt>
                  <dd>PostgreSQL / PostGIS source catalog</dd>
                </dl>
                {data.packageProvenance?.credibilityManifest?.limitations.map(
                  (limitation) => (
                    <p key={limitation.id}>
                      <strong>{limitation.severity}:</strong> {limitation.statement}
                    </p>
                  ),
                )}
                <div className="report-sources">
                  {[...new Set(reportSourceIds)]
                    .map(getSource)
                    .filter(Boolean)
                    .map((source) => (
                      <Link
                        key={source!.id}
                        href={source!.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <strong>{source!.publisher}</strong>
                        <span>{source!.title}</span>
                      </Link>
                    ))}
                </div>
              </ReportSection>
            </div>
          </div>
          <section className="report-disclaimer">
            <BookOpen size={16} />
            <p>
              This result is produced by a public-data model using user-selected
              assumptions. It does not represent verified weapon performance,
              current operational deployment, or an actual engagement
              prediction.
            </p>
          </section>
          <footer>
            <span>Vector Engagement Labs</span>
            <span>Public data mode · Reproducible record</span>
          </footer>
        </article>
      )}
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function formatReportDate(value: string) {
  return value.slice(0, 10);
}

function printLabel(state: PrintState) {
  if (state === "preparing") return "Preparing";
  if (state === "printing") return "Print dialog open";
  return "Print / PDF";
}

function exportLabel(state: ActionState) {
  if (state === "preparing") return "Preparing";
  if (state === "done") return "JSON downloaded";
  if (state === "error") return "Export failed";
  return "Export JSON";
}
