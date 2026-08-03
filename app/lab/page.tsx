"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleHelp,
  CircleX,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Gauge,
  Layers3,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { ObjectPicker } from "@/components/ObjectPicker";
import { EngagementMap, type MapInstallation } from "@/components/EngagementMap";
import { SimulationScene } from "@/components/SimulationScene";
import { TacticalSymbol } from "@/components/TacticalSymbol";
import { TelemetryChart } from "@/components/TelemetryChart";
import {
  canConduct,
  validateScenario,
  type ValidationItem,
} from "@/lib/scenario-validation";
import {
  getCatalogObject,
  getGuidedSystems,
  getLaunchPlatforms,
  getOpposingObjects,
} from "@/lib/object-catalog";
import {
  findPlatform,
  findWeapon,
  getCompatibleWeapons,
  getSource,
  getSubsystem,
} from "@/lib/capability-data";
import {
  getScenarioDefinition,
  type ScenarioDefinition,
} from "@/lib/scenarios";
import {
  findWeaponSimulationModel,
  registerDatabaseSimulationModels,
} from "@/lib/simulation-models";
import { ENGINE_VERSION } from "@/lib/engine/version";
import type { ReportData } from "@/lib/report-export";
import { emitBrowserTelemetry } from "@/lib/observability/client";
import type { StudyArea } from "@/lib/study-areas";
import { sha256Hex } from "@/lib/canonical-json";
import {
  isScenarioDefinition,
  isStoredScenarioPackage,
  SCENARIO_PACKAGE_SCHEMA_VERSION,
  type StoredScenarioPackage,
} from "@/lib/scenario-package";
import {
  buildRaspTrack,
  explainResult,
  getFrameAt,
  simulate,
  standardAtmosphere,
  type ProfileId,
  type RaspTrack,
  type Scenario,
  type SimulationResult,
} from "@/lib/simulation";

type Workspace = "configure" | "run" | "results";
type ViewMode = "TRUTH" | "IAF_RASP" | "PAF_RASP";
type PlaybackSurface = "MAP" | "THREE_D";
type EventItem = {
  id: number;
  time: number;
  type: "run" | "fault" | "observation";
  title: string;
  detail: string;
};
const CONFIGURE_STEPS = [
  "Define",
  "Forces & loadouts",
  "Place & flight",
  "Sensors & decisions",
  "Validate",
];

export default function LabPage() {
  const searchParams = useSearchParams();
  const scenarioId = searchParams.get("scenario");
  if (!scenarioId) return <RedirectToScenarios />;
  return (
    <LabWorkbench
      definition={getScenarioDefinition(scenarioId)}
      startStep={searchParams.get("start") === "guided" ? 0 : 4}
    />
  );
}

function RedirectToScenarios() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/scenarios");
  }, [router]);
  return (
    <main className="route-transition" aria-busy="true">
      <span>VECTOR</span>
      <strong>Opening the scenario library…</strong>
    </main>
  );
}

function LabWorkbench({
  definition: initialDefinition,
  startStep,
}: {
  definition: ScenarioDefinition;
  startStep: number;
}) {
  const router = useRouter();
  const [definition, setDefinition] = useState(initialDefinition);
  const [scenario, setScenario] = useState<Scenario>(() => ({
    ...initialDefinition.scenario,
  }));
  const [result, setResult] = useState(() => simulate(initialDefinition.scenario));
  const [workspace, setWorkspace] = useState<Workspace>("configure");
  const [buildStep, setBuildStep] = useState(startStep);
  const [hasRun, setHasRun] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [layers, setLayers] = useState({
    interceptor: true,
    target: true,
    lineOfSight: true,
  });
  const [comparison, setComparison] = useState<Record<
    ProfileId,
    SimulationResult
  > | null>(null);
  const [events, setEvents] = useState<EventItem[]>([
    {
      id: 1,
      time: 0,
      type: "run",
      title: "Setup loaded",
      detail: `${definition.title} · template ${definition.version}`,
    },
  ]);
  const [conditionArmed, setConditionArmed] = useState(false);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [runDraftRevision, setRunDraftRevision] = useState<number | null>(null);
  const [templateIdentity, setTemplateIdentity] = useState<{
    schemaVersion: string;
    contentHash: string;
    engineVersion: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<"loading" | "POSTGIS" | "error">(
    "loading",
  );
  const [catalogInstallations, setCatalogInstallations] = useState<MapInstallation[]>([]);
  const [catalogStudyAreas, setCatalogStudyAreas] = useState<StudyArea[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("TRUTH");
  const [playbackSurface, setPlaybackSurface] =
    useState<PlaybackSurface>("MAP");
  const validations = useMemo(
    () => validateScenario(definition, scenario),
    [definition, scenario],
  );
  const blueSystem = getCatalogObject(scenario.blueSystemId);
  const redObject = getCatalogObject(scenario.redObjectId);

  useEffect(() => {
    let active = true;
    fetch("/api/catalog")
      .then((response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json();
      })
      .then(async (data: unknown) => {
        const payload = data as {
          state?: string;
          installations?: MapInstallation[];
          simulationModels?: Parameters<typeof registerDatabaseSimulationModels>[0];
          scenarioTemplates?: StoredScenarioPackage[];
          studyAreas?: Array<{
            id: StudyArea["id"];
            name: string;
            short_name: string;
            description: string;
            terrain_class: StudyArea["terrainClass"];
            surface_elevation_m: number;
            anchor_longitude: number;
            anchor_latitude: number;
            boundary: { coordinates: number[][][] };
            environment_presets: StudyArea["weatherPresets"];
            default_environment_preset_id: string;
            source_class: StudyArea["sourceClass"];
          }>;
        };
        if (active) {
          const template = payload.scenarioTemplates?.find(
            (item) =>
              item.id === initialDefinition.id &&
              item.version === initialDefinition.version &&
              item.status === "VALIDATED",
          );
          if (
            payload.state !== "POSTGIS" ||
            !template ||
            !isStoredScenarioPackage(template) ||
            template.schema_version !== SCENARIO_PACKAGE_SCHEMA_VERSION ||
            template.engine_version !== ENGINE_VERSION ||
            !isScenarioDefinition(template.package) ||
            !payload.simulationModels?.length ||
            !payload.studyAreas?.length
          ) {
            throw new Error("catalog package incomplete");
          }
          const computedHash = await sha256Hex(template.package);
          if (computedHash !== template.content_hash) {
            throw new Error("scenario package hash mismatch");
          }
          registerDatabaseSimulationModels(payload.simulationModels);
          setDefinition(template.package);
          setScenario({ ...template.package.scenario });
          setResult(simulate(template.package.scenario));
          setDraftRevision(0);
          setRunDraftRevision(null);
          setTemplateIdentity({
            schemaVersion: template.schema_version,
            contentHash: template.content_hash,
            engineVersion: template.engine_version,
          });
          setCatalogState("POSTGIS");
          setCatalogInstallations(payload.installations ?? []);
          setCatalogStudyAreas(
            payload.studyAreas.map((area) => ({
              id: area.id,
              name: area.name,
              shortName: area.short_name,
              description: area.description,
              terrainClass: area.terrain_class,
              surfaceElevationM: area.surface_elevation_m,
              anchor: {
                longitude: Number(area.anchor_longitude),
                latitude: Number(area.anchor_latitude),
              },
              bounds: [
                area.boundary.coordinates[0][0] as [number, number],
                area.boundary.coordinates[0][2] as [number, number],
              ],
              weatherPresets: area.environment_presets,
              defaultWeatherPresetId: area.default_environment_preset_id,
              sourceClass: area.source_class,
            })),
          );
        }
      })
      .catch(() => {
        if (active) setCatalogState("error");
      });
    return () => {
      active = false;
    };
  }, [initialDefinition.id, initialDefinition.version]);

  const setConfiguredScenario = useCallback<
    React.Dispatch<React.SetStateAction<Scenario>>
  >((action) => {
    setScenario((current) =>
      typeof action === "function" ? action(current) : action,
    );
    setDraftRevision((value) => value + 1);
    if (hasRun) {
      setHasRun(false);
      setPlaying(false);
      setSavedRunId(null);
      setRunDraftRevision(null);
      setWorkspace("configure");
      setSaveError("Configuration changed. Conduct a new run before saving or reporting.");
    }
  }, [hasRun]);

  const run = useCallback(() => {
    if (catalogState !== "POSTGIS") {
      setSaveError("Wait for the PostGIS scenario package before conducting the run.");
      return;
    }
    const checks = validateScenario(definition, scenario);
    if (!canConduct(checks)) {
      setWorkspace("configure");
      setBuildStep(4);
      return;
    }
    const telemetryRunId = crypto.randomUUID();
    emitBrowserTelemetry({
      type: "scenario_run_started",
      runId: telemetryRunId,
      domain: scenario.domain,
      engineVersion: ENGINE_VERSION,
    });
    const simulationStarted = performance.now();
    let next: SimulationResult;
    try {
      next = simulate(scenario);
      emitBrowserTelemetry({
        type: "scenario_run_completed",
        runId: telemetryRunId,
        domain: scenario.domain,
        engineVersion: ENGINE_VERSION,
        outcome: next.termination,
        durationMs: performance.now() - simulationStarted,
        modelSeconds: next.timeOfFlight,
        entityCount: next.entityManifest.length,
      });
    } catch (error) {
      emitBrowserTelemetry({
        type: "scenario_run_failed",
        runId: telemetryRunId,
        domain: scenario.domain,
        engineVersion: ENGINE_VERSION,
        outcome: "invalid_scenario",
        durationMs: performance.now() - simulationStarted,
        modelSeconds: 0,
        entityCount: 0,
      });
      throw error;
    }
    setResult(next);
    setTime(0);
    setPlaying(true);
    setWorkspace("run");
    setComparison(null);
    setHasRun(true);
    setRunDraftRevision(draftRevision);
    setSavedRunId(null);
    setSaveError(null);
    setEvents((items) => [
      ...items,
      {
        id: Date.now(),
        time: 0,
        type: "run",
        title: "Baseline run started",
        detail: `${getCatalogObject(scenario.blueSystemId).designation} · ${findWeaponSimulationModel(scenario.blueSystemId)?.id ?? "model unavailable"}@${findWeaponSimulationModel(scenario.blueSystemId)?.version ?? "unknown"} · ${scenario.guidance} path · ${scenario.range / 1000} km`,
      },
    ]);
  }, [catalogState, definition, draftRevision, scenario]);

  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    let previous = performance.now();
    let accumulated = 0;
    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      accumulated += delta;
      if (accumulated >= 1 / 30) {
        const elapsed = accumulated;
        accumulated = 0;
        setTime((current) => {
          const next = current + elapsed * speed;
          if (next >= result.timeOfFlight) {
            setPlaying(false);
            return result.timeOfFlight;
          }
          return next;
        });
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, result.timeOfFlight, speed]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches(
          "input, textarea, button, select, [contenteditable='true']",
        )
      )
        return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key === "Enter") run();
      if (event.key === "ArrowRight")
        setTime((value) => Math.min(result.timeOfFlight, value + 0.5));
      if (event.key === "ArrowLeft")
        setTime((value) => Math.max(0, value - 0.5));
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [result.timeOfFlight, run]);

  const frame = useMemo(() => getFrameAt(result, time), [result, time]);
  const raspTrack = useMemo(
    () =>
      scenario.domain !== "A2A" || viewMode === "TRUTH"
        ? undefined
        : buildRaspTrack(
            scenario,
            frame,
            viewMode === "IAF_RASP" ? "IAF" : "PAF",
          ),
    [frame, scenario, viewMode],
  );
  const injectCondition = () => {
    const changed =
      definition.preparedEvent.physicsEffect === "guidance-hold"
        ? {
            ...scenario,
            guidanceInterruptionAt: time,
            guidanceInterruptionDuration: definition.preparedEvent.duration,
          }
        : { ...scenario, lossIncreaseAt: time, lossIncreaseAmount: 8 };
    setScenario(changed);
    setResult(simulate(changed));
    setConditionArmed(false);
    setComparison(null);
    setSavedRunId(null);
    setSaveError(null);
    setEvents((items) => [
      ...items,
      {
        id: Date.now(),
        time,
        type: "fault",
        title: definition.preparedEvent.title,
        detail: definition.preparedEvent.description,
      },
    ]);
  };
  const addObservation = () =>
    setEvents((items) => [
      ...items,
      {
        id: Date.now(),
        time,
        type: "observation",
        title: "Observation saved",
        detail: "This model time was marked for the Results timeline.",
      },
    ]);
  const compare = () => {
    setComparison({
      short: simulate(scenario, "short"),
      medium: simulate(scenario, "medium"),
      sustained: simulate(scenario, "sustained"),
    });
    setPlaying(false);
  };
  const resetRun = () => {
    const baseline = {
      ...scenario,
      guidanceInterruptionAt: null,
      lossIncreaseAt: null,
    };
    setScenario(baseline);
    setResult(simulate(baseline));
    setTime(0);
    setPlaying(false);
    setComparison(null);
    setEvents([
      {
        id: Date.now(),
        time: 0,
        type: "run",
        title: "Run reset",
        detail: "Returned to the configured baseline.",
      },
    ]);
  };
  const buildReport = (): ReportData => ({
    scenario,
    result,
    events,
    createdAt: new Date().toISOString(),
    engine: ENGINE_VERSION,
    packageProvenance: templateIdentity
      ? {
          schemaVersion: templateIdentity.schemaVersion,
          contentHash: templateIdentity.contentHash,
          draftRevision: runDraftRevision ?? draftRevision,
        }
      : undefined,
    profileVersion: (() => {
      const model = findWeaponSimulationModel(scenario.blueSystemId);
      return model ? `${model.id}@${model.version}` : "model-unavailable";
    })(),
    libraryScenario: {
      id: definition.id,
      version: definition.version,
      domain: definition.domain,
      title: definition.title,
      scope: definition.scope,
      targetProfile: redObject.designation,
      theatre: definition.theatre,
    },
  });
  const saveReport = async () => {
    if (!hasRun) {
      setSaveError("Conduct a run before saving a report.");
      return null;
    }
    if (!templateIdentity || runDraftRevision !== draftRevision) {
      setSaveError("The saved template and completed run are out of sync. Conduct the run again.");
      return null;
    }
    if (savedRunId) return savedRunId;
    setSaving(true);
    setSaveError(null);
    try {
      const report = buildReport();
      const frameHash = await sha256Hex(report.result.frames);
      report.packageProvenance = report.packageProvenance
        ? { ...report.packageProvenance, frameHash }
        : undefined;
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId: definition.id,
          scenarioVersion: definition.version,
          engineVersion: report.engine,
          scenarioSchemaVersion: templateIdentity.schemaVersion,
          scenarioContentHash: templateIdentity.contentHash,
          compiledScenario: result.engineRun.scenario,
          frameHash,
          draftRevision: runDraftRevision,
          blueForce: {
            platformId: scenario.bluePlatformId,
            weaponId: scenario.blueSystemId,
            quantity: scenario.blueWeaponQuantity,
            fuelPercent: scenario.blueFuelPercent,
          },
          redForce: {
            platformId: scenario.redObjectId,
            weaponId: scenario.redSystemId,
            quantity: scenario.redWeaponQuantity,
            fuelPercent: scenario.redFuelPercent,
          },
          initialState: scenario,
          environment: {
            windEastMps: scenario.wind,
            windNorthMps: scenario.windNorth,
            visibilityKm: scenario.visibilityKm,
            humidityPercent: scenario.humidityPercent,
            temperatureOffset: scenario.temperatureOffset,
            atmosphere: "NASA educational standard atmosphere",
            studyAreaId: scenario.studyAreaId,
            weatherPresetId: scenario.weatherPresetId,
          },
          modelAssumptions: {
            report,
            weaponModel:
              findWeaponSimulationModel(scenario.blueSystemId) ??
              result.engineRun.scenario.entities.find(
                (entity) => entity.id === result.engineRun.primaryWeaponId,
              )?.provenance,
          },
        }),
      });
      if (!response.ok) throw new Error("save");
      const data = (await response.json()) as { id: string };
      setSavedRunId(data.id);
      return data.id;
    } catch {
      setSaveError("The run could not be saved. Check the catalog connection and try again.");
      return null;
    } finally {
      setSaving(false);
    }
  };
  const openReport = async () => {
    if (!hasRun) return;
    const id = savedRunId ?? (await saveReport());
    if (id) router.push(`/report?run=${id}`);
  };

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <Link href="/scenarios" className="back-link">
          <ArrowLeft size={15} />
          Scenarios
        </Link>
        <div className="scenario-name">
          <span>
            {definition.domain} · Configured template {definition.version}
          </span>
          <strong>{scenario.name}</strong>
        </div>
        <nav aria-label="Experiment workflow">
          <button
            className={workspace === "configure" ? "active" : ""}
            onClick={() => setWorkspace("configure")}
          >
            Construct
          </button>
          <button className={workspace === "run" ? "active" : ""} onClick={run}>
            Simulate &amp; observe
          </button>
          <button
            disabled={!hasRun}
            className={workspace === "results" ? "active" : ""}
            onClick={() => setWorkspace("results")}
          >
            Explain &amp; report
          </button>
        </nav>
        <div className="lab-actions">
          <span className={`catalog-state ${catalogState}`}>
            <Database size={14} />
            {catalogState === "POSTGIS"
              ? "PostGIS catalog connected"
              : catalogState === "loading"
                ? "Connecting catalog"
                : "Catalog unavailable"}
          </span>
          <button
            disabled={saving || !hasRun}
            onClick={() =>
              savedRunId ? router.push(`/report?run=${savedRunId}`) : void saveReport()
            }
          >
            {savedRunId ? <FileText size={14} /> : <Save size={14} />}
            {saving ? "Saving run…" : savedRunId ? "View report" : "Save run"}
          </button>
        </div>
      </header>
      <div className="lab-notice">
        <CircleAlert size={13} />
        <span>
          {definition.scope} Public-data approximation; model assumptions are
          shown before the run.
        </span>
      </div>

      {workspace === "configure" && (
        <ConfigureWorkspace
          definition={definition}
          scenario={scenario}
          setScenario={setConfiguredScenario}
          advanced={advanced}
          setAdvanced={setAdvanced}
          step={buildStep}
          setStep={setBuildStep}
          validations={validations}
          studyAreas={catalogStudyAreas}
          run={run}
        />
      )}
      {workspace === "results" && (
        <ResultsWorkspace
          scenario={scenario}
          result={result}
          events={events}
          saving={saving}
          savedRunId={savedRunId}
          saveError={saveError}
          saveReport={saveReport}
          openReport={openReport}
        />
      )}
      {workspace === "run" && (
        <section className="session-layout">
          <aside className="session-left">
            <div className="session-heading">
              <span>Advanced experiment tools</span>
              <strong>Run 01 · {playing ? "Playing" : "Paused"}</strong>
            </div>
            <section>
              <h2>Condition injection</h2>
              <button
                className={conditionArmed ? "fault active" : "fault"}
                onClick={() => setConditionArmed((value) => !value)}
              >
                <TriangleAlert size={15} />
                <span>
                  <strong>{definition.preparedEvent.title}</strong>
                  <small>{definition.preparedEvent.description}</small>
                </span>
                <em>{conditionArmed ? "ARMED" : "AVAILABLE"}</em>
              </button>
              {conditionArmed && (
                <button className="inject" onClick={injectCondition}>
                  Apply at {time.toFixed(1)} s
                </button>
              )}
            </section>
            <section>
              <h2>Run tools</h2>
              <button className="tool-button" onClick={addObservation}>
                <Flag size={15} />
                Mark observation
              </button>
              <button className="tool-button" onClick={() => setPlaying(false)}>
                <Pause size={15} />
                Pause run
              </button>
              <button className="tool-button" onClick={resetRun}>
                <RotateCcw size={15} />
                Reset to baseline
              </button>
            </section>
            <section>
              <h2>Comparison set</h2>
              {definition.runVariants.map((variant, index) => (
                <div className="run-file" key={variant.title}>
                  <span>{variant.title}</span>
                  <strong>{index === 0 ? "CURRENT" : "READY"}</strong>
                </div>
              ))}
            </section>
          </aside>
          <section className="simulation-column">
            <div className="sim-topline">
              <div>
                <span>
                  {viewMode === "TRUTH"
                    ? "Model truth"
                    : "Sensor-derived air picture"}
                </span>
                <strong>
                  {blueSystem.designation} · {scenario.guidance} path
                </strong>
              </div>
              {scenario.domain === "A2A" && (
                <div className="picture-switch" aria-label="Air picture view">
                  {(["TRUTH", "IAF_RASP", "PAF_RASP"] as ViewMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        className={viewMode === mode ? "active" : ""}
                        onClick={() => setViewMode(mode)}
                      >
                        {mode === "TRUTH"
                          ? "Model Truth"
                          : mode === "IAF_RASP"
                            ? "IAF RASP"
                            : "PAF RASP"}
                      </button>
                    ),
                  )}
                </div>
              )}
              <div className="picture-switch surface-switch" aria-label="Playback surface">
                <button
                  className={playbackSurface === "MAP" ? "active" : ""}
                  onClick={() => setPlaybackSurface("MAP")}
                >
                  Map
                </button>
                <button
                  className={playbackSurface === "THREE_D" ? "active" : ""}
                  onClick={() => setPlaybackSurface("THREE_D")}
                >
                  3D
                </button>
              </div>
              <div className="live-metrics">
                <Metric label="Time" value={`${time.toFixed(1)} s`} />
                <Metric
                  label="3D separation"
                  value={`${(frame.range / 1000).toFixed(1)} km`}
                />
                <Metric
                  label="Weapon speed"
                  value={`${Math.round(frame.speed)} m/s`}
                />
                <Metric label="Mach" value={frame.mach.toFixed(2)} />
              </div>
            </div>
            <div
              className={`scene-wrap ${playbackSurface === "MAP" ? "map-surface" : "three-d-surface"}`}
            >
              {playbackSurface === "MAP" ? (
                <EngagementMap
                  result={result}
                  time={time}
                  installations={catalogInstallations}
                  raspTrack={raspTrack}
                />
              ) : (
                <SimulationScene
                  result={result}
                  time={time}
                  profile={scenario.profile}
                  layers={layers}
                  raspTrack={raspTrack}
                />
              )}
              <div className="symbol-key">
                {frame.entities.map((entity) => (
                  <span key={entity.id}>
                    <TacticalSymbol
                      kind={entity.kind}
                      affiliation={entity.affiliation}
                      lifecycle={entity.lifecycle}
                      size={22}
                    />
                    {entity.designation} · {entity.lifecycle.toLowerCase()}
                  </span>
                ))}
                {raspTrack && (
                  <span>
                    <i className="uncertainty-symbol" />
                    Track uncertainty
                  </span>
                )}
              </div>
              <div className="view-note">
                {viewMode === "TRUTH"
                  ? "Computed model state"
                  : "What this side can observe; uncertainty is deliberately visible"}{" "}
                · {playbackSurface === "MAP" ? "pan or zoom the geographic surface" : "drag to orbit · scroll to zoom"}
              </div>
            </div>
            <Playback
              result={result}
              time={time}
              setTime={setTime}
              playing={playing}
              setPlaying={setPlaying}
              speed={speed}
              setSpeed={setSpeed}
            />
            <div className="telemetry">
              <div className="telemetry-title">
                <strong>Synchronized run telemetry</strong>
                <span>Computed at {time.toFixed(1)} model seconds</span>
              </div>
              <TelemetryChart result={result} time={time} />
            </div>
          </section>
          <aside className="session-right">
            <Outcome result={result} />
            {raspTrack ? (
              <RaspPanel track={raspTrack} />
            ) : comparison ? (
              <Comparison scenario={scenario} data={comparison} />
            ) : (
              <Geometry frame={frame} />
            )}
            <section className="right-card">
              <div className="right-title">
                <Layers3 size={15} />
                <strong>View layers</strong>
                <span>THIS VIEW</span>
              </div>
              {Object.entries({
                interceptor: "Blue weapon path",
                target:
                  definition.targetMotion === "fixed"
                    ? "Fixed-objective reference"
                    : "Red aircraft path",
                lineOfSight: "Separation line",
              }).map(([key, label]) => (
                <button
                  className="layer-toggle"
                  key={key}
                  onClick={() =>
                    setLayers((value) => ({
                      ...value,
                      [key]: !value[key as keyof typeof value],
                    }))
                  }
                >
                  {layers[key as keyof typeof layers] ? (
                    <Eye size={14} />
                  ) : (
                    <EyeOff size={14} />
                  )}
                  <span>{label}</span>
                  <em>{layers[key as keyof typeof layers] ? "ON" : "OFF"}</em>
                </button>
              ))}
            </section>
            {scenario.domain !== "A2A" && (
              <button className="compare-button" onClick={compare}>
                <Copy size={14} />
                Compare study profiles <span>CURRENT SETUP</span>
              </button>
            )}
            <div className="explain-card">
              <Sparkles size={16} />
              <div>
                <strong>Why this result?</strong>
                <p>{explainResult(scenario, result)}</p>
              </div>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function ConfigureWorkspace({
  definition,
  scenario,
  setScenario,
  advanced,
  setAdvanced,
  step,
  setStep,
  validations,
  studyAreas,
  run,
}: {
  definition: ScenarioDefinition;
  scenario: Scenario;
  setScenario: React.Dispatch<React.SetStateAction<Scenario>>;
  advanced: boolean;
  setAdvanced: (value: boolean) => void;
  step: number;
  setStep: (value: number) => void;
  validations: ValidationItem[];
  studyAreas: StudyArea[];
  run: () => void;
}) {
  const update = <K extends keyof Scenario>(key: K, value: Scenario[K]) =>
    setScenario((current) => ({ ...current, [key]: value }));
  const simulationModel = findWeaponSimulationModel(scenario.blueSystemId);
  const fixed = definition.targetMotion === "fixed";
  const launchPlatforms = getLaunchPlatforms(scenario.domain);
  const guidedSystems = getGuidedSystems(scenario.domain);
  const opposingObjects = getOpposingObjects(scenario.domain);
  const bluePlatform = getCatalogObject(scenario.bluePlatformId);
  const blueSystem = getCatalogObject(scenario.blueSystemId);
  const redObject = getCatalogObject(scenario.redObjectId);
  const redSystem = getCatalogObject(scenario.redSystemId);
  const bluePlatformRecord = findPlatform(scenario.bluePlatformId);
  const redPlatformRecord = findPlatform(scenario.redObjectId);
  const blueCompatibleIds = getCompatibleWeapons(scenario.bluePlatformId).map(
    (item) => item.id,
  );
  const redCompatibleIds = getCompatibleWeapons(scenario.redObjectId).map(
    (item) => item.id,
  );
  const blueSystems =
    scenario.domain === "A2A"
      ? guidedSystems.filter((item) => blueCompatibleIds.includes(item.id))
      : guidedSystems;
  const redSystems =
    scenario.domain === "A2A"
      ? guidedSystems.filter((item) => redCompatibleIds.includes(item.id))
      : [];
  const atmosphere = standardAtmosphere(
    scenario.altitude,
    scenario.temperatureOffset,
  );
  const selectedStudyArea =
    studyAreas.find((area) => area.id === scenario.studyAreaId) ?? studyAreas[0];
  const selectedWeather = selectedStudyArea?.weatherPresets.find(
    (preset) => preset.id === scenario.weatherPresetId,
  );
  const selectStudyArea = (area: StudyArea) => {
    const preset = area.weatherPresets.find(
      (candidate) => candidate.id === area.defaultWeatherPresetId,
    ) ?? area.weatherPresets[0];
    setScenario((current) => ({
      ...current,
      studyAreaId: area.id,
      weatherPresetId: preset.id,
      temperatureOffset: preset.temperatureOffsetC,
      wind: preset.windEastMps,
      windNorth: preset.windNorthMps,
      visibilityKm: preset.visibilityKm,
      humidityPercent: preset.humidityPercent,
    }));
  };
  const selectWeather = (preset: StudyArea["weatherPresets"][number]) => {
    setScenario((current) => ({
      ...current,
      weatherPresetId: preset.id,
      temperatureOffset: preset.temperatureOffsetC,
      wind: preset.windEastMps,
      windNorth: preset.windNorthMps,
      visibilityKm: preset.visibilityKm,
      humidityPercent: preset.humidityPercent,
    }));
  };
  const selectSystem = (id: string) => {
    const object = getCatalogObject(id);
    setScenario((current) => ({
      ...current,
      blueSystemId: id,
      profile: object.modelProfile ?? current.profile,
      ...(current.domain === "G2A"
        ? { bluePlatformId: id }
        : ({} as Partial<Scenario>)),
    }));
  };
  const selectBluePlatform = (id: string) => {
    const record = findPlatform(id);
    const weaponId =
      record?.defaultLoadout[0]?.weaponId ?? scenario.blueSystemId;
    setScenario((current) => ({
      ...current,
      bluePlatformId: id,
      blueSystemId: weaponId,
      blueWeaponQuantity:
        record?.defaultLoadout[0]?.quantity ?? current.blueWeaponQuantity,
    }));
  };
  const selectRedPlatform = (id: string) => {
    const record = findPlatform(id);
    setScenario((current) => ({
      ...current,
      redObjectId: id,
      redSystemId: record?.defaultLoadout[0]?.weaponId ?? current.redSystemId,
      redWeaponQuantity:
        record?.defaultLoadout[0]?.quantity ?? current.redWeaponQuantity,
    }));
  };
  const headings = [
    [
      "Define",
      "What is this run comparing?",
      "This library template is already configured. Edit the run name or purpose only when you want a different comparison.",
    ],
    [
      "Forces & loadouts",
      "Who is fighting, and what is each side carrying?",
      "Review the aircraft variant, fitted systems, selected weapon, quantity, fuel state, and source coverage for both teams.",
    ],
    [
      "Place & flight",
      "Where and how does the fight begin?",
      "Set distance, altitude, speed, crossing angle, and the weapon flight path. Derived atmosphere and geometry update from these inputs.",
    ],
    [
      "Sensors & decisions",
      fixed
        ? "Which fixed-objective conditions apply?"
        : "What can each side see, and what will each side do?",
      fixed
        ? "A fixed objective cannot maneuver. Adjust the wind or prepare a condition change."
        : "Set the Red aircraft maneuver, radar and data-link state, electronic warfare, and the next tactical decision.",
    ],
    [
      "Validate",
      "Review the configured experiment.",
      "The template is ready when its setup checks pass. These checks test completeness and consistency; they do not certify real-world performance.",
    ],
  ];
  const advance = () => (step === 4 ? run() : setStep(step + 1));
  return (
    <section className="build-workspace">
      <aside className="build-steps">
        <span>Construct experiment</span>
        {CONFIGURE_STEPS.map((label, index) => (
          <button
            className={index === step ? "active" : ""}
            key={label}
            onClick={() => setStep(index)}
            aria-current={index === step ? "step" : undefined}
          >
            <i>{index + 1}</i>
            {label}
            {index < step && <Check size={13} />}
          </button>
        ))}
      </aside>
      <div className="builder">
        <div className="builder-scroll">
          <header>
            <span>
              Configured template · {step + 1} of 5 · {headings[step][0]}
            </span>
            <h1>{headings[step][1]}</h1>
            <p>{headings[step][2]}</p>
          </header>
        {step === 0 && (
          <>
            <div className="configured-note">
              <Check size={16} />
              <p>
                <strong>Preconfigured by the scenario library.</strong> You can
                run it unchanged or alter one variable for a controlled
                comparison.
              </p>
            </div>
            <label className="field">
              <span>Run name</span>
              <input
                value={scenario.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label className="field">
              <span>What this run compares</span>
              <textarea
                value={scenario.objective}
                onChange={(event) => update("objective", event.target.value)}
              />
            </label>
            <div className="guided-options">
              <span>Optional comparison focus · replaces the run purpose</span>
              {definition.focusOptions.map((option) => (
                <button
                  key={option.title}
                  onClick={() => update("objective", option.objective)}
                >
                  <Target size={17} />
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <section className="authoring-section">
            <div className="team-object-grid">
              <article className="team-object blue-team">
                <header>
                  <span>
                    BLUE TEAM
                    {bluePlatformRecord
                      ? ` · ${bluePlatformRecord.service}`
                      : ""}
                  </span>
                  <em>
                    {bluePlatformRecord?.status ?? bluePlatform.dataState}
                  </em>
                </header>
                {scenario.domain !== "G2A" && (
                  <ObjectPicker
                    label="Aircraft variant"
                    value={scenario.bluePlatformId}
                    options={launchPlatforms}
                    team="blue"
                    onChange={selectBluePlatform}
                  />
                )}
                <ObjectPicker
                  label={
                    scenario.domain === "G2A"
                      ? "Air-defence system"
                      : "Selected weapon"
                  }
                  value={scenario.blueSystemId}
                  options={blueSystems}
                  team="blue"
                  onChange={selectSystem}
                />
                <Quantity
                  label="Weapon quantity"
                  value={scenario.blueWeaponQuantity}
                  team="blue"
                  onChange={(value) => update("blueWeaponQuantity", value)}
                />
                {scenario.domain === "A2A" && (
                  <WeaponDetails weaponId={scenario.blueSystemId} />
                )}
                {scenario.domain === "A2A" && (
                  <PlatformSystems platformId={scenario.bluePlatformId} />
                )}
              </article>
              <article className="team-object red-team">
                <header>
                  <span>
                    RED TEAM
                    {redPlatformRecord ? ` · ${redPlatformRecord.service}` : ""}
                  </span>
                  <em>{redPlatformRecord?.status ?? redObject.dataState}</em>
                </header>
                <ObjectPicker
                  label={fixed ? "Fixed objective" : "Aircraft variant"}
                  value={scenario.redObjectId}
                  options={opposingObjects}
                  team="red"
                  onChange={selectRedPlatform}
                />
                {scenario.domain === "A2A" && redSystems.length > 0 && (
                  <>
                    <ObjectPicker
                      label="Selected weapon"
                      value={scenario.redSystemId}
                      options={redSystems}
                      team="red"
                      onChange={(value) => update("redSystemId", value)}
                    />
                    <Quantity
                      label="Weapon quantity"
                      value={scenario.redWeaponQuantity}
                      team="red"
                      onChange={(value) => update("redWeaponQuantity", value)}
                    />
                    <WeaponDetails weaponId={scenario.redSystemId} />
                  </>
                )}
                {scenario.domain === "A2A" && (
                  <PlatformSystems platformId={scenario.redObjectId} />
                )}
              </article>
            </div>
            <article className="profile-explanation">
              <strong>Simulation assumption · {blueSystem.designation}</strong>
              <p>
                {simulationModel?.rationale ??
                  "No flight-model coefficient set is available for this selection."}
              </p>
              <span>
                {simulationModel
                  ? `${simulationModel.id}@${simulationModel.version} · powered flight ${simulationModel.poweredFlightSeconds} s · launch/dry mass ${simulationModel.launchMassKg}/${simulationModel.dryMassKg} kg · ${simulationModel.valueState.toLowerCase().replaceAll("_", " ")}`
                  : "Model unavailable"}
              </span>
            </article>
            {scenario.domain === "A2A" || scenario.domain === "A2G" ? (
              <div className="advanced-grid">
                <Range
                  label={`${bluePlatform.designation} launch speed`}
                  value={scenario.launcherSpeed}
                  min={0}
                  max={450}
                  step={5}
                  unit="m/s"
                  onChange={(value) => update("launcherSpeed", value)}
                />
                {!fixed && (
                  <Range
                    label={`${redObject.designation} speed`}
                    value={scenario.targetSpeed}
                    min={80}
                    max={450}
                    step={5}
                    unit="m/s"
                    onChange={(value) => update("targetSpeed", value)}
                  />
                )}
                <Range
                  label="Blue fuel state"
                  value={scenario.blueFuelPercent}
                  min={20}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={(value) => update("blueFuelPercent", value)}
                />
                {!fixed && (
                  <Range
                    label="Red fuel state"
                    value={scenario.redFuelPercent}
                    min={20}
                    max={100}
                    step={5}
                    unit="%"
                    onChange={(value) => update("redFuelPercent", value)}
                  />
                )}
              </div>
            ) : (
              <div className="fixed-condition">
                <strong>{bluePlatform.designation} surface launch</strong>
                <p>
                  Initial speed is 0 m/s. The powered-flight calculation begins
                  after launch.
                </p>
              </div>
            )}
          </section>
        )}
        {step === 2 && (
          <section className="authoring-section">
            <div className="placement-section">
              <header>
                <span>STUDY AREA</span>
                <strong>Choose the geographic and atmospheric context.</strong>
                <p>
                  The selected area sets the map anchor, terrain elevation, and
                  available weather presets. It does not create an operational
                  route or claim a real engagement location.
                </p>
              </header>
              <div className="study-area-grid">
                {studyAreas.map((area) => (
                  <button
                    key={area.id}
                    className={scenario.studyAreaId === area.id ? "active" : ""}
                    onClick={() => selectStudyArea(area)}
                  >
                    <strong>{area.shortName}</strong>
                    <small>{area.terrainClass.toLowerCase().replaceAll("_", " ")} · {area.surfaceElevationM} m reference terrain</small>
                    <span>{area.description}</span>
                  </button>
                ))}
              </div>
              {selectedStudyArea && (
                <div className="weather-preset-grid">
                  <span>Weather preset for {selectedStudyArea.shortName}</span>
                  {selectedStudyArea.weatherPresets.map((preset) => (
                    <button
                      key={preset.id}
                      className={scenario.weatherPresetId === preset.id ? "active" : ""}
                      onClick={() => selectWeather(preset)}
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.description}</small>
                      <em>
                        ISA {preset.temperatureOffsetC >= 0 ? "+" : ""}{preset.temperatureOffsetC} °C · wind {preset.windEastMps} E / {preset.windNorthMps} N m/s · visibility {preset.visibilityKm} km
                      </em>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="compact-controls">
              <Range
                label="Starting distance"
                value={scenario.range / 1000}
                min={5}
                max={170}
                unit="km"
                onChange={(value) => update("range", value * 1000)}
              />
              <Range
                label={fixed ? "Launch elevation" : "Launch altitude"}
                value={scenario.altitude}
                min={0}
                max={15000}
                step={10}
                unit="m"
                onChange={(value) => update("altitude", value)}
              />
              {scenario.domain === "G2G" && (
                <Range
                  label="Commanded cruise altitude"
                  value={scenario.cruiseAltitude}
                  min={30}
                  max={15000}
                  step={10}
                  unit="m"
                  onChange={(value) => update("cruiseAltitude", value)}
                />
              )}
              <Range
                label={
                  fixed
                    ? "Objective elevation difference"
                    : "Target altitude difference"
                }
                value={scenario.targetDelta}
                min={-12000}
                max={12000}
                step={10}
                unit="m"
                onChange={(value) => update("targetDelta", value)}
              />
            </div>
            <div className="geometry-choice">
              <button
                className={scenario.guidance === "direct" ? "active" : ""}
                onClick={() => update("guidance", "direct")}
              >
                <strong>Direct path</strong>
                <small>
                  The weapon turns toward the latest target position without a
                  commanded climb.
                </small>
              </button>
              <button
                className={scenario.guidance === "loft" ? "active" : ""}
                onClick={() => update("guidance", "loft")}
              >
                <strong>Lofted path</strong>
                <small>
                  The model commands an early climb, then descends toward the
                  latest target position.
                </small>
              </button>
            </div>
            <button
              className="advanced-toggle"
              onClick={() => setAdvanced(!advanced)}
            >
              <Settings2 size={14} />
              {advanced ? "Hide additional inputs" : "Show additional inputs"}
            </button>
            {advanced && (
              <div className="advanced-grid">
                {!fixed && (
                  <Range
                    label="Starting crossing angle"
                    value={scenario.aspect}
                    min={0}
                    max={180}
                    step={5}
                    unit="°"
                    onChange={(value) => update("aspect", value)}
                  />
                )}
                <Range
                  label="Temperature difference from standard day"
                  value={scenario.temperatureOffset}
                  min={-20}
                  max={20}
                  step={1}
                  unit="°C"
                  onChange={(value) => update("temperatureOffset", value)}
                />
              </div>
            )}
            <article className="atmosphere-card">
              <div>
                <span>
                  Calculated atmosphere at Blue altitude · {selectedWeather?.label ?? "custom conditions"}
                </span>
                <strong>NASA educational standard atmosphere</strong>
              </div>
              <dl>
                <dt>Temperature</dt>
                <dd>{(atmosphere.temperatureK - 273.15).toFixed(1)} °C</dd>
                <dt>Pressure</dt>
                <dd>{atmosphere.pressureKpa.toFixed(1)} kPa</dd>
                <dt>Air density</dt>
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
              <p>
                Temperature and both wind components affect the engine. Visibility limits visual-track acquisition. Humidity is recorded for the run but does not yet alter propulsion, drag, radar, or seeker behavior.
              </p>
            </article>
          </section>
        )}
        {step === 3 && (
          <section className="authoring-section">
            {fixed ? (
              <div className="fixed-condition">
                <strong>Fixed objective</strong>
                <p>
                  Objective speed is locked to 0 m/s. Evasive turns and g-demand
                  do not apply to this mission set.
                </p>
              </div>
            ) : (
              <>
                <div className="event-choice">
                  <button
                    className={scenario.maneuver === "steady" ? "active" : ""}
                    onClick={() => update("maneuver", "steady")}
                  >
                    <strong>Steady course</strong>
                    <small>No commanded target turn.</small>
                  </button>
                  <button
                    className={scenario.maneuver === "break" ? "active" : ""}
                    onClick={() => update("maneuver", "break")}
                  >
                    <strong>Defensive break</strong>
                    <small>One turn begins after five model seconds.</small>
                  </button>
                  <button
                    className={scenario.maneuver === "weave" ? "active" : ""}
                    onClick={() => update("maneuver", "weave")}
                  >
                    <strong>Weaving turn</strong>
                    <small>Alternating simplified turn demand.</small>
                  </button>
                </div>
                <Range
                  label="Opposing-track turn demand"
                  value={scenario.targetG}
                  min={0}
                  max={9}
                  step={0.5}
                  unit="g"
                  onChange={(value) => update("targetG", value)}
                />
              </>
            )}
            {scenario.domain === "A2A" && (
              <div className="information-setup">
                <header>
                  <span>REAL AIR SITUATION PICTURE INPUTS</span>
                  <strong>What does each side know?</strong>
                  <p>
                    These controls shape the IAF and PAF air pictures. Model
                    Truth remains available separately.
                  </p>
                </header>
                <ChoiceButtons
                  label="IAF source for the Red track"
                  value={scenario.blueTrackSource}
                  options={[
                    ["ONBOARD_RADAR", "Onboard radar"],
                    ["DATALINK", "Data link"],
                    ["AIRBORNE_EARLY_WARNING", "Airborne early warning"],
                    ["VISUAL", "Visual contact"],
                  ]}
                  onChange={(value) =>
                    update(
                      "blueTrackSource",
                      value as Scenario["blueTrackSource"],
                    )
                  }
                />
                <ChoiceButtons
                  label="PAF source for the Blue track"
                  value={scenario.redTrackSource}
                  options={[
                    ["ONBOARD_RADAR", "Onboard radar"],
                    ["DATALINK", "Data link"],
                    ["AIRBORNE_EARLY_WARNING", "Airborne early warning"],
                    ["VISUAL", "Visual contact"],
                  ]}
                  onChange={(value) =>
                    update(
                      "redTrackSource",
                      value as Scenario["redTrackSource"],
                    )
                  }
                />
                <div className="information-grid">
                  <BinaryChoice
                    label="IAF radar"
                    value={scenario.blueRadarMode === "ACTIVE"}
                    onLabel="Active"
                    offLabel="Silent"
                    team="blue"
                    onChange={(value) =>
                      update("blueRadarMode", value ? "ACTIVE" : "SILENT")
                    }
                  />
                  <BinaryChoice
                    label="PAF radar"
                    value={scenario.redRadarMode === "ACTIVE"}
                    onLabel="Active"
                    offLabel="Silent"
                    team="red"
                    onChange={(value) =>
                      update("redRadarMode", value ? "ACTIVE" : "SILENT")
                    }
                  />
                  <BinaryChoice
                    label="IAF data link"
                    value={scenario.blueDatalink}
                    onLabel="Available"
                    offLabel="Unavailable"
                    team="blue"
                    onChange={(value) => update("blueDatalink", value)}
                  />
                  <BinaryChoice
                    label="PAF data link"
                    value={scenario.redDatalink}
                    onLabel="Available"
                    offLabel="Unavailable"
                    team="red"
                    onChange={(value) => update("redDatalink", value)}
                  />
                  <BinaryChoice
                    label="IAF jammer"
                    value={scenario.blueJammer}
                    onLabel="On"
                    offLabel="Off"
                    team="blue"
                    onChange={(value) => update("blueJammer", value)}
                  />
                  <BinaryChoice
                    label="PAF jammer"
                    value={scenario.redJammer}
                    onLabel="On"
                    offLabel="Off"
                    team="red"
                    onChange={(value) => update("redJammer", value)}
                  />
                </div>
                <div className="decision-grid">
                  <ChoiceButtons
                    label="Blue Team decision"
                    value={scenario.blueDecision}
                    options={[
                      ["PRESS", "Continue toward target"],
                      ["SUPPORT_WEAPON", "Support the weapon"],
                      ["CRANK", "Turn while supporting"],
                      ["DEFEND", "Defend"],
                      ["DISENGAGE", "Disengage"],
                    ]}
                    onChange={(value) =>
                      update("blueDecision", value as Scenario["blueDecision"])
                    }
                  />
                  <ChoiceButtons
                    label="Red Team decision"
                    value={scenario.redDecision}
                    options={[
                      ["PRESS", "Continue toward target"],
                      ["CRANK", "Turn for position"],
                      ["DEFEND", "Defend"],
                      ["DISENGAGE", "Disengage"],
                    ]}
                    onChange={(value) =>
                      update("redDecision", value as Scenario["redDecision"])
                    }
                  />
                </div>
                <p className="model-effect-note">
                  Current model effect: the Blue decision changes mid-course
                  guidance-update cadence; the Red decision changes how much of
                  the selected turn demand is commanded. Radar, data link, and
                  jammer controls change the two RASP views.
                </p>
              </div>
            )}
            <Range
              label="East–west wind component"
              value={scenario.wind}
              min={-40}
              max={40}
              step={1}
              unit="m/s"
              onChange={(value) => update("wind", value)}
            />
            <p className="field-help">
              Positive values blow east; negative values blow west. The engine
              subtracts this vector from ground velocity to calculate
              air-relative drag. This is a physical wind input, not a generic
              performance-loss slider.
            </p>
            <article className="prepared-event">
              <TriangleAlert size={17} />
              <div>
                <span>AVAILABLE DURING RUN</span>
                <strong>{definition.preparedEvent.title}</strong>
                <p>{definition.preparedEvent.description}</p>
              </div>
              <em>PHYSICS EFFECT</em>
            </article>
          </section>
        )}
        {step === 4 && (
          <section className="review-layout">
            <div className="review-inputs">
              <div>
                <span>Run purpose</span>
                <strong>{scenario.name}</strong>
                <p>{scenario.objective}</p>
                <button onClick={() => setStep(0)}>Edit definition</button>
              </div>
              <div>
                <span>Forces &amp; loadouts</span>
                <strong>
                  Blue · {bluePlatform.designation} / {blueSystem.designation}
                </strong>
                <p>
                  Red · {redObject.designation}
                  {scenario.domain === "A2A"
                    ? ` / ${redSystem.designation}`
                    : ""}
                </p>
                <button onClick={() => setStep(1)}>Edit forces</button>
              </div>
              <div>
                <span>Place &amp; flight</span>
                <strong>
                  {scenario.range / 1000} km · {scenario.guidance} path
                </strong>
                <p>
                  {selectedStudyArea?.shortName ?? "Study area unavailable"} · {selectedWeather?.label ?? "weather not selected"} · {" "}
                  {scenario.altitude} m launch elevation
                  {fixed ? "" : ` · ${scenario.aspect}° aspect`}
                </p>
                <button onClick={() => setStep(2)}>Edit flight</button>
              </div>
              <div>
                <span>Sensors &amp; decisions</span>
                <strong>
                  {fixed
                    ? "Fixed objective"
                    : `${scenario.maneuver} · ${scenario.targetG} g`}
                </strong>
                <p>
                  {scenario.domain === "A2A"
                    ? `Blue ${scenario.blueDecision.replaceAll("_", " ").toLowerCase()} · Red ${scenario.redDecision.replaceAll("_", " ").toLowerCase()} · IAF track from ${scenario.blueTrackSource.replaceAll("_", " ").toLowerCase()}`
                    : `${definition.targetMotion === "fixed" ? "Fixed objective" : `Red ${scenario.maneuver}`} · east–west wind ${scenario.wind} m/s`}{" "}
                  · {definition.preparedEvent.title} available
                </p>
                <button onClick={() => setStep(3)}>Edit conditions</button>
              </div>
            </div>
            <ValidationList items={validations} />
          </section>
        )}
        </div>
        <footer className="builder-actions">
          <span>
            {step === 4
              ? canConduct(validations)
                ? "Setup checks passed — ready to run"
                : "Resolve failed checks before running"
              : "Changes apply to this experiment only"}
          </span>
          <div>
            {step > 0 && (
              <button className="back-action" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              disabled={step === 4 && !canConduct(validations)}
              onClick={advance}
            >
              {step === 4 ? (
                <>
                  <Play size={15} />
                  Run baseline
                </>
              ) : (
                <>Next: {CONFIGURE_STEPS[step + 1]}</>
              )}
            </button>
          </div>
        </footer>
      </div>
      <aside className="builder-summary">
        <span>Configured scenario</span>
        <dl>
          <dt>Engagement</dt>
          <dd>
            {definition.domain} · {definition.title}
          </dd>
          <dt>Blue Team</dt>
          <dd>
            {bluePlatform.designation} / {blueSystem.designation}
          </dd>
          <dt>Red Team</dt>
          <dd>
            {redObject.designation}
            {scenario.domain === "A2A" ? ` / ${redSystem.designation}` : ""}
          </dd>
          <dt>Flight model</dt>
          <dd>
            {simulationModel
              ? `${simulationModel.id}@${simulationModel.version}`
              : "Unavailable"}
          </dd>
          <dt>Starting distance</dt>
          <dd>{scenario.range / 1000} km</dd>
          <dt>Environment</dt>
          <dd>
            {selectedStudyArea?.shortName ?? definition.environment} · {selectedWeather?.label ?? "weather preset unavailable"}
          </dd>
        </dl>
        <section className="preset-basis">
          <strong>Why these starting values?</strong>
          <p>
            <b>System.</b> {definition.presetRationale.profile}
          </p>
          <p>
            <b>Flight.</b> {definition.presetRationale.geometry}
          </p>
          <p>
            <b>Conditions.</b> {definition.presetRationale.conditions}
          </p>
        </section>
        <div>
          <CircleHelp size={15} />
          <p>{definition.scope}</p>
        </div>
      </aside>
    </section>
  );
}

function ValidationList({ items }: { items: ValidationItem[] }) {
  return (
    <section className="validation-list">
      <header>
        <span>Setup checks</span>
        <strong>
          {items.filter((item) => item.state === "pass").length} passed ·{" "}
          {items.filter((item) => item.state === "error").length} failed
        </strong>
      </header>
      {items.map((item) => (
        <article className={item.state} key={item.id}>
          {item.state === "error" ? (
            <CircleX size={15} />
          ) : item.state === "warning" ? (
            <TriangleAlert size={15} />
          ) : (
            <Check size={15} />
          )}
          <div>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function ResultsWorkspace({
  scenario,
  result,
  events,
  saving,
  savedRunId,
  saveError,
  saveReport,
  openReport,
}: {
  scenario: Scenario;
  result: SimulationResult;
  events: EventItem[];
  saving: boolean;
  savedRunId: string | null;
  saveError: string | null;
  saveReport: () => Promise<string | null>;
  openReport: () => Promise<void>;
}) {
  const bluePlatform = getCatalogObject(scenario.bluePlatformId);
  const blueSystem = getCatalogObject(scenario.blueSystemId);
  const redObject = getCatalogObject(scenario.redObjectId);
  const redSystem = getCatalogObject(scenario.redSystemId);
  return (
    <section className="debrief-workspace">
      <header>
        <span>Explain and report</span>
        <h1>{scenario.name}</h1>
        <p>
          Read the outcome against the selected forces, starting conditions, and
          declared model limits.
        </p>
      </header>
      <div className="results-overview">
        <article>
          <span>What was tested</span>
          <strong>{scenario.objective}</strong>
        </article>
        <article>
          <span>Who was involved</span>
          <strong>
            Blue · {bluePlatform.designation} + {blueSystem.designation}
            <br />
            Red · {redObject.designation}
            {scenario.domain === "A2A" ? ` + ${redSystem.designation}` : ""}
          </strong>
        </article>
        <article>
          <span>Starting conditions</span>
          <strong>
            {scenario.range / 1000} km · Blue {scenario.altitude} m · Red{" "}
            {scenario.altitude + scenario.targetDelta} m · {scenario.aspect}°
          </strong>
        </article>
        <article className={result.successful ? "success" : "caution"}>
          <span>Model outcome</span>
          <strong>{result.outcome}</strong>
        </article>
      </div>
      <div className="debrief-grid">
        <article className="debrief-outcome">
          <span>What the model found</span>
          <h2>{result.outcome}</h2>
          <p>{explainResult(scenario, result)}</p>
          <div>
            <Metric
              label="Closest separation"
              value={`${Math.round(result.closestApproach)} m`}
            />
            <Metric
              label="Model time"
              value={`${result.timeOfFlight.toFixed(1)} s`}
            />
            <Metric
              label="End speed"
              value={`${Math.round(result.endSpeed)} m/s`}
            />
          </div>
        </article>
        <article className="event-log">
          <h2>What happened</h2>
          {events.map((event) => (
            <div key={event.id}>
              <time>{event.time.toFixed(1)} s</time>
              <i className={event.type} />
              <span>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </span>
            </div>
          ))}
        </article>
        <article className="debrief-notes">
          <h2>Experiment notes</h2>
          <textarea defaultValue="Record the variable you changed, the result it produced, and the next controlled comparison." />
          {saveError && <p className="save-error" role="alert">{saveError}</p>}
          <button
            disabled={saving}
            aria-busy={saving}
            onClick={() => void (savedRunId ? openReport() : saveReport())}
          >
            {savedRunId ? <FileText size={15} /> : <Save size={15} />}
            {saving ? "Saving run…" : savedRunId ? "View full report" : "Save run"}
          </button>
          <small>
            {savedRunId
              ? "Saved. The report is now a reproducible snapshot of this run."
              : "Saving freezes the scenario, model versions, telemetry, and sources before reporting."}
          </small>
        </article>
      </div>
    </section>
  );
}

function PlatformSystems({ platformId }: { platformId: string }) {
  const platform = findPlatform(platformId);
  if (!platform) return null;
  const engineNames = [
    ...new Set(
      platform.engineIds
        .map((id) => getSubsystem(id)?.designation)
        .filter(Boolean),
    ),
  ];
  const systems = [
    [
      "Engine",
      engineNames.length
        ? `${platform.engineIds.length} × ${engineNames.join(" / ")}`
        : "Not established",
    ],
    ["Radar", getSubsystem(platform.radarId)?.designation ?? "Not established"],
    [
      "Defensive EW",
      getSubsystem(platform.ewId)?.designation ?? "Not established",
    ],
    [
      "Data link",
      getSubsystem(platform.datalinkId)?.designation ?? "Not established",
    ],
  ];
  const sourceLinks = platform.sourceIds.map(getSource).filter(Boolean);
  return (
    <details className="platform-systems">
      <summary>
        Aircraft systems and sources <span>{platform.status}</span>
      </summary>
      <dl>
        {systems.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="platform-facts">
        {platform.publicFacts.map((fact) => (
          <div key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
            <em>{fact.status}</em>
          </div>
        ))}
      </div>
      {sourceLinks.length > 0 && (
        <footer>
          {sourceLinks.map((source) => (
            <Link
              key={source!.id}
              href={source!.url}
              target="_blank"
              rel="noreferrer"
            >
              {source!.publisher}
            </Link>
          ))}
        </footer>
      )}
    </details>
  );
}

function WeaponDetails({ weaponId }: { weaponId: string }) {
  const weapon = findWeapon(weaponId);
  if (!weapon) return null;
  const sources = weapon.sourceIds.map(getSource).filter(Boolean);
  return (
    <details className="weapon-details">
      <summary>
        Weapon guidance and sources <span>{weapon.status}</span>
      </summary>
      <dl>
        <div>
          <dt>Seeker</dt>
          <dd>{weapon.seeker}</dd>
        </div>
        <div>
          <dt>Guidance stages</dt>
          <dd>{weapon.guidanceStages.join(" → ")}</dd>
        </div>
        <div>
          <dt>Launch-aircraft support</dt>
          <dd>{weapon.launchSupport}</dd>
        </div>
        {weapon.publishedRange && (
          <div>
            <dt>Published conditional figure</dt>
            <dd>
              {weapon.publishedRange.valueKm} km ·{" "}
              {weapon.publishedRange.condition}
            </dd>
          </div>
        )}
      </dl>
      {sources.length > 0 && (
        <footer>
          {sources.map((source) => (
            <Link
              key={source!.id}
              href={source!.url}
              target="_blank"
              rel="noreferrer"
            >
              {source!.publisher}
            </Link>
          ))}
        </footer>
      )}
    </details>
  );
}

function Quantity({
  label,
  value,
  team,
  onChange,
}: {
  label: string;
  value: number;
  team: "blue" | "red";
  onChange: (value: number) => void;
}) {
  return (
    <div className={`quantity-control ${team}`}>
      <span>{label}</span>
      <div>
        <button
          type="button"
          disabled={value <= 0}
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <output>{value}</output>
        <button
          type="button"
          disabled={value >= 6}
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(6, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function ChoiceButtons({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="choice-buttons">
      <legend>{label}</legend>
      <div>
        {options.map(([id, name]) => (
          <button
            type="button"
            key={id}
            className={value === id ? "active" : ""}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function BinaryChoice({
  label,
  value,
  onLabel,
  offLabel,
  team,
  onChange,
}: {
  label: string;
  value: boolean;
  onLabel: string;
  offLabel: string;
  team: "blue" | "red";
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className={`binary-choice ${team}`}>
      <legend>{label}</legend>
      <button
        type="button"
        className={value ? "active" : ""}
        aria-pressed={value}
        onClick={() => onChange(true)}
      >
        {onLabel}
      </button>
      <button
        type="button"
        className={!value ? "active" : ""}
        aria-pressed={!value}
        onClick={() => onChange(false)}
      >
        {offLabel}
      </button>
    </fieldset>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>{label}</span>
      <output>
        {Number.isInteger(value) ? value : value.toFixed(1)}{" "}
        <small>{unit}</small>
      </output>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function Playback({
  result,
  time,
  setTime,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: {
  result: SimulationResult;
  time: number;
  setTime: (value: number) => void;
  playing: boolean;
  setPlaying: (value: boolean) => void;
  speed: number;
  setSpeed: (value: number) => void;
}) {
  return (
    <div className="playback">
      <button aria-label="Restart playback" onClick={() => setTime(0)}>
        <RotateCcw size={14} />
      </button>
      <button
        aria-label={playing ? "Pause playback" : "Play playback"}
        className="play"
        onClick={() => setPlaying(!playing)}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <input
        aria-label="Run timeline"
        type="range"
        min={0}
        max={result.timeOfFlight || 1}
        step={0.1}
        value={time}
        onChange={(event) => setTime(Number(event.target.value))}
      />
      <span>
        {time.toFixed(1)} / {result.timeOfFlight.toFixed(1)} s
      </span>
      <div>
        {[0.5, 1, 2, 4].map((value) => (
          <button
            key={value}
            className={speed === value ? "active" : ""}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}
function Outcome({ result }: { result: SimulationResult }) {
  return (
    <section className={`outcome ${result.successful ? "success" : "caution"}`}>
      <span>Model outcome</span>
      <h2>{result.outcome}</h2>
      <p>{result.reason}</p>
      <div>
        <Metric
          label="Closest"
          value={`${Math.round(result.closestApproach)} m`}
        />
        <Metric
          label="Model time"
          value={`${result.timeOfFlight.toFixed(1)} s`}
        />
        <Metric
          label="End speed"
          value={`${Math.round(result.endSpeed)} m/s`}
        />
        <Metric
          label="Peak demand"
          value={`${result.peakDemand.toFixed(1)} g`}
        />
      </div>
    </section>
  );
}
function Geometry({ frame }: { frame: ReturnType<typeof getFrameAt> }) {
  return (
    <section className="right-card">
      <div className="right-title">
        <Target size={15} />
        <strong>Current geometry</strong>
        <span>{frame.phase}</span>
      </div>
      <div className="scope">
        <i />
        <b />
        <small>Relative-position diagram</small>
      </div>
      <div className="geometry-data">
        <Metric label="LOS rate" value={`${frame.losRate.toFixed(3)} rad/s`} />
        <Metric
          label="3D separation"
          value={`${(frame.range / 1000).toFixed(1)} km`}
        />
        <Metric label="Weapon speed" value={`${Math.round(frame.speed)} m/s`} />
        <Metric label="Mach" value={frame.mach.toFixed(2)} />
      </div>
      <p className="derived-note">
        Calculated from the current point-mass frame and the atmosphere at the
        weapon altitude. It is not a measured value from a real engagement.
      </p>
    </section>
  );
}
function Comparison({
  scenario,
  data,
}: {
  scenario: Scenario;
  data: Record<ProfileId, SimulationResult>;
}) {
  const systems = getGuidedSystems(scenario.domain);
  return (
    <section className="right-card">
      <div className="right-title">
        <Gauge size={15} />
        <strong>{scenario.domain} system comparison</strong>
      </div>
      <div className="comparison">
        {(Object.keys(data) as ProfileId[]).map((id) => {
          const system = systems.find((item) => item.modelProfile === id);
          return (
            <div key={id}>
              <strong>
                <i className={`profile-${id}`} />
                {system?.designation ?? id}
              </strong>
              <span>{data[id].outcome}</span>
              <span>{Math.round(data[id].closestApproach)} m</span>
              <span>{data[id].timeOfFlight.toFixed(1)} s</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function RaspPanel({ track }: { track: RaspTrack }) {
  return (
    <section className={`right-card rasp-card ${track.status.toLowerCase()}`}>
      <div className="right-title">
        <Radio size={15} />
        <strong>{track.perspective} Real Air Situation Picture</strong>
        <span>{track.status}</span>
      </div>
      <div className="rasp-track-title">
        <span>TRACK {track.trackId}</span>
        <strong>{track.classification}</strong>
        <em>{track.identification}</em>
      </div>
      <dl>
        <dt>Source</dt>
        <dd>{track.source}</dd>
        <dt>Confidence</dt>
        <dd>{track.confidence}%</dd>
        <dt>Track age</dt>
        <dd>{track.ageSeconds.toFixed(1)} s</dd>
        <dt>Position uncertainty</dt>
        <dd>±{track.uncertaintyMeters} m</dd>
      </dl>
      <p>
        {track.visible
          ? "This is the side’s estimated air picture, not model truth. The amber ring shows positional uncertainty."
          : "No usable track is available from the selected source in the current geometry. Model Truth remains unchanged."}
      </p>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
