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
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { ObjectPicker } from "@/components/ObjectPicker";
import { EngagementMap, type MapInstallation } from "@/components/EngagementMap";
import { ScenarioAuthoringMap } from "@/components/ScenarioAuthoringMap";
import { SimulationScene } from "@/components/SimulationScene";
import { TacticalSymbolLegend } from "@/components/TacticalSymbolLegend";
import { ViewportTelemetry } from "@/components/ViewportTelemetry";
import { TrackStateInspector } from "@/components/TrackStateInspector";
import { CurrentGeometry } from "@/components/CurrentGeometry";
import { RouteTransitionInspector } from "@/components/RouteTransitionInspector";
import { PlatformEvidence } from "@/components/PlatformEvidence";
import { Disclosure } from "@/components/ui/OverlayPrimitives";
import { applyTacticalLabelPolicy, presentTacticalSymbol } from "@/lib/tactical-symbol-contract";
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
import {
  domainCapability,
  optionalCapability,
} from "@/lib/runtime/deployment-capabilities";
import {
  BrowserSimulationCancelledError,
  BrowserSimulationClient,
} from "@/lib/runtime/browser-simulation-client";
import type { BrowserRuntimeState } from "@/lib/runtime/protocol";
import type { StudyArea } from "@/lib/study-areas";
import type { CatalogCredibilityAdmission } from "@/lib/catalog-admission";
import { INSTALLATION_CATALOGUE_IDENTITY } from "@/lib/installations";
import {
  spatialAspectDeg,
  spatialHorizontalSeparationM,
  withSpatialAspectDeg,
  withSpatialRangeM,
  type ScenarioSpatialPlan,
} from "@/lib/scenario-spatial";
import { sha256Hex } from "@/lib/canonical-json";
import {
  isScenarioDefinition,
  isStoredScenarioPackage,
  SCENARIO_PACKAGE_SCHEMA_VERSION,
  type StoredScenarioPackage,
} from "@/lib/scenario-package";
import {
  createReferencePreview,
  explainResult,
  standardAtmosphere,
  type ProfileId,
  type RaspTrack,
  type Scenario,
  type SimulationResult,
} from "@/lib/simulation";
import {
  selectCurrentGeometry,
  selectDisplayFrame,
  selectRecordedTrackState,
  selectRouteTransitionStates,
} from "@/lib/frontend/selectors";

type Workspace = "configure" | "run" | "results";
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
  "Admitted conditions",
  "Validate",
];

function freezeRecordedPictures(pictures: RaspTrack[]): readonly RaspTrack[] {
  return Object.freeze(pictures.map((picture) => Object.freeze({ ...picture })));
}

function formatDistanceKm(distanceM: number) {
  const kilometers = distanceM / 1000;
  return Number.isInteger(kilometers) ? `${kilometers}` : kilometers.toFixed(1);
}

export default function LabPage() {
  const searchParams = useSearchParams();
  const scenarioId = searchParams.get("scenario");
  if (!scenarioId) return <RedirectToScenarios />;
  const definition = getScenarioDefinition(scenarioId);
  if (!definition) {
    return <CapabilityUnavailable title="Scenario unavailable" reason="This scenario ID is not available in this deployment." />;
  }
  const capability = domainCapability(definition.domain);
  if (capability.state !== "ENABLED") {
    return <CapabilityUnavailable title={`${definition.domain} unavailable`} reason={capability.reason} />;
  }
  return (
    <LabWorkbench
      definition={definition}
      startStep={searchParams.get("start") === "guided" ? 0 : 4}
    />
  );
}

function CapabilityUnavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <main className="route-transition" role="status">
      <span>Vector Engagement Labs</span>
      <strong>{title}</strong>
      <p>{reason}</p>
      <Link href="/scenarios">Return to available scenarios</Link>
    </main>
  );
}

function RedirectToScenarios() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/scenarios");
  }, [router]);
  return (
    <main className="route-transition" aria-busy="true">
      <span>Vector Engagement Labs</span>
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
  const simulationClient = useMemo(() => new BrowserSimulationClient(), []);
  const [definition, setDefinition] = useState(initialDefinition);
  const [scenario, setScenario] = useState<Scenario>(() => ({
    ...initialDefinition.scenario,
  }));
  // The configured page server-renders before the operator conducts a run.
  // Cloudflare's SSR isolate does not permit runtime WASM compilation, so this
  // hidden pre-run frame set is explicitly generated by the reference backend.
  // The selected backend still executes, without fallback, when Run is pressed.
  const [result, setResult] = useState(() =>
    createReferencePreview(initialDefinition.scenario),
  );
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
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [runDraftRevision, setRunDraftRevision] = useState<number | null>(null);
  const [templateIdentity, setTemplateIdentity] = useState<{
    schemaVersion: string;
    contentHash: string;
    engineVersion: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [runtimeState, setRuntimeState] =
    useState<BrowserRuntimeState>("ready");
  const [runProgress, setRunProgress] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<"loading" | "POSTGIS" | "error">(
    "loading",
  );
  const [catalogInstallations, setCatalogInstallations] = useState<MapInstallation[]>([]);
  const [catalogStudyAreas, setCatalogStudyAreas] = useState<StudyArea[]>([]);
  const [catalogCredibility, setCatalogCredibility] =
    useState<CatalogCredibilityAdmission | null>(null);
  const [spatialInputsValid, setSpatialInputsValid] = useState(true);
  const [playbackSurface, setPlaybackSurface] =
    useState<PlaybackSurface>("MAP");
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [trackPerspective, setTrackPerspective] = useState<"IAF" | "PAF">("IAF");

  useEffect(() => {
    const restore = window.requestAnimationFrame(() => {
      setTelemetryExpanded(sessionStorage.getItem("vector.telemetry.expanded.v1") === "true");
    });
    return () => window.cancelAnimationFrame(restore);
  }, []);

  const setTelemetryDisclosure = useCallback((expanded: boolean) => {
    sessionStorage.setItem("vector.telemetry.expanded.v1", String(expanded));
    setTelemetryExpanded(expanded);
  }, []);
  const validations = useMemo(() => {
    const items = validateScenario(definition, scenario);
    return spatialInputsValid
      ? items
      : [
          ...items,
          {
            id: "authored-flight-input",
            label: "A flight input is invalid",
            detail: "Correct the marked start or route value in Place & flight.",
            state: "error" as const,
          },
        ];
  }, [definition, scenario, spatialInputsValid]);
  const blueSystem = getCatalogObject(scenario.blueSystemId);
  const runtimeBusy =
    runtimeState === "initialization" ||
    runtimeState === "running" ||
    runtimeState === "paused" ||
    runtimeState === "cancelling";

  useEffect(() => () => simulationClient.terminate(), [simulationClient]);

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
          credibilityAdmissions?: CatalogCredibilityAdmission[];
          installationCatalogue?: {
            schemaVersion: "vector.installation-catalogue.v1";
            id: string;
            version: string;
            digest: string;
            coverage: { declaredServiceCoverage: string; includedRecordCount: number };
            records: Array<{ id: string; sourceId: string; longitude: number; latitude: number }>;
          };
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
          const credibility = payload.credibilityAdmissions?.find(
            (item) =>
              item.modelPack.id === template?.model_pack_id &&
              item.modelPack.version === template?.model_pack_version &&
              item.modelPack.digest === template?.model_pack_digest &&
              item.scenarioTemplateIds.includes(initialDefinition.id),
          );
          if (
            payload.state !== "POSTGIS" ||
            !template ||
            !isStoredScenarioPackage(template) ||
            template.schema_version !== SCENARIO_PACKAGE_SCHEMA_VERSION ||
            template.engine_version !== ENGINE_VERSION ||
            !isScenarioDefinition(template.package) ||
            !payload.simulationModels?.length ||
            !payload.installationCatalogue ||
            payload.installationCatalogue.schemaVersion !== "vector.installation-catalogue.v1" ||
            payload.installationCatalogue.id !== INSTALLATION_CATALOGUE_IDENTITY.id ||
            payload.installationCatalogue.version !== INSTALLATION_CATALOGUE_IDENTITY.version ||
            payload.installationCatalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest ||
            payload.installationCatalogue.coverage.declaredServiceCoverage !== "BOUNDED_PUBLIC_REFERENCE_FIXTURE" ||
            payload.installationCatalogue.coverage.includedRecordCount !== payload.installations?.length ||
            payload.installationCatalogue.records.length !== payload.installations?.length ||
            payload.installations?.some((installation) => {
              const record = payload.installationCatalogue?.records.find((candidate) => candidate.id === installation.id);
              return !record
                || record.sourceId !== installation.source_id
                || record.longitude !== Number(installation.longitude)
                || record.latitude !== Number(installation.latitude);
            }) ||
            !payload.studyAreas?.length ||
            !credibility
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
          setDraftRevision(0);
          setRunDraftRevision(null);
          setTemplateIdentity({
            schemaVersion: template.schema_version,
            contentHash: template.content_hash,
            engineVersion: template.engine_version,
          });
          setCatalogState("POSTGIS");
          setCatalogCredibility(credibility);
          setCatalogInstallations(payload.installations ?? []);
          setCatalogStudyAreas(
            payload.studyAreas.map((area) => ({
              id: area.id,
              name: area.name,
              shortName: area.short_name,
              description: area.description,
              terrainClass: area.terrain_class,
              surfaceElevationM: area.surface_elevation_m,
              surfaceElevationDatum: "MSL",
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
        if (active) {
          setCatalogState("error");
          setCatalogCredibility(null);
        }
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

  const run = useCallback(async () => {
    if (catalogState !== "POSTGIS") {
      setSaveError("Wait for the PostGIS scenario package before conducting the run.");
      return;
    }
    const checks = validateScenario(definition, scenario);
    if (!spatialInputsValid || !canConduct(checks)) {
      setWorkspace("configure");
      setBuildStep(4);
      return;
    }
    try {
      setRunProgress(0);
      setRuntimeState("initialization");
      const completion = await simulationClient.run(scenario, scenario.profile, {
        onState: setRuntimeState,
        onProgress: ({ progress }) => setRunProgress(progress),
      });
      const next = completion.result;
      setResult(next);
    } catch (error) {
      if (error instanceof BrowserSimulationCancelledError) {
        setRuntimeState("ready");
        setSaveError("Browser simulation run cancelled.");
        return;
      }
      setRuntimeState("failed");
      setSaveError(
        error instanceof Error ? error.message : "The browser simulation Worker failed.",
      );
      return;
    }
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
        detail: `${getCatalogObject(scenario.blueSystemId).designation} · ${findWeaponSimulationModel(scenario.blueSystemId)?.id ?? "model unavailable"}@${findWeaponSimulationModel(scenario.blueSystemId)?.version ?? "unknown"} · ${scenario.guidance} path · ${formatDistanceKm(scenario.range)} km`,
      },
    ]);
  }, [catalogState, definition, draftRevision, scenario, simulationClient, spatialInputsValid]);

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
          "input, textarea, button, select, [role='button'], [contenteditable='true']",
        )
      )
        return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key === "Enter") void run();
      if (event.key === "ArrowRight")
        setTime((value) => Math.min(result.timeOfFlight, value + 0.5));
      if (event.key === "ArrowLeft")
        setTime((value) => Math.max(0, value - 0.5));
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [result.timeOfFlight, run]);

  const selectedDisplayFrame = useMemo(
    () => selectDisplayFrame(result, time),
    [result, time],
  );
  const frame = selectedDisplayFrame.frame;
  const recordedPictures = useMemo(
    () => freezeRecordedPictures(result.pictures),
    [result.pictures],
  );
  const selectedTrackState = useMemo(
    () => selectRecordedTrackState(recordedPictures, selectedDisplayFrame, trackPerspective),
    [recordedPictures, selectedDisplayFrame, trackPerspective],
  );
  const selectedGeometry = useMemo(
    () => selectCurrentGeometry(result, selectedDisplayFrame),
    [result, selectedDisplayFrame],
  );
  const selectedRouteTransitions = useMemo(
    () => selectRouteTransitionStates(result, selectedDisplayFrame),
    [result, selectedDisplayFrame],
  );
  const addObservation = () =>
    setEvents((items) => [
      ...items,
      {
        id: Date.now(),
        time: selectedDisplayFrame.displayTimeSeconds,
        type: "observation",
        title: "Observation saved",
        detail: "This model time was marked for the Results timeline.",
      },
    ]);
  const compare = async () => {
    try {
      setRuntimeState("initialization");
      const short = await simulationClient.run(scenario, "short", {
        onState: setRuntimeState,
      });
      const medium = await simulationClient.run(scenario, "medium", {
        onState: setRuntimeState,
      });
      const sustained = await simulationClient.run(scenario, "sustained", {
        onState: setRuntimeState,
      });
      setComparison({
        short: short.result,
        medium: medium.result,
        sustained: sustained.result,
      });
      setPlaying(false);
    } catch (error) {
      if (error instanceof BrowserSimulationCancelledError) {
        setRuntimeState("ready");
        setSaveError("Comparison run cancelled.");
        return;
      }
      setRuntimeState("failed");
      setSaveError(error instanceof Error ? error.message : "Comparison run failed.");
    }
  };
  const resetRun = async () => {
    const baseline = {
      ...scenario,
      lossIncreaseAt: null,
    };
    setScenario(baseline);
    try {
      setRuntimeState("initialization");
      const completion = await simulationClient.run(baseline, baseline.profile, {
        onState: setRuntimeState,
        onProgress: ({ progress }) => setRunProgress(progress),
      });
      setResult(completion.result);
    } catch (error) {
      if (error instanceof BrowserSimulationCancelledError) {
        setRuntimeState("ready");
        setSaveError("Baseline reset cancelled.");
        return;
      }
      setRuntimeState("failed");
      setSaveError(error instanceof Error ? error.message : "Baseline reset failed.");
      return;
    }
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
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId: definition.id,
          scenarioVersion: definition.version,
          scenarioSchemaVersion: templateIdentity.schemaVersion,
          scenarioContentHash: templateIdentity.contentHash,
          draftRevision: runDraftRevision,
          initialState: scenario,
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
          <button
            className={workspace === "run" ? "active" : ""}
            disabled={runtimeBusy}
            onClick={() => void run()}
          >
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
          <span className="catalog-state" data-runtime-state={runtimeState}>
            <Gauge size={14} />
            {runtimeState === "running"
              ? `Worker running · ${Math.round(runProgress * 100)}%`
              : `Worker · ${runtimeState}`}
          </span>
          {runtimeBusy && runtimeState !== "initialization" && (
            <button onClick={() => void simulationClient.cancel()}>
              <CircleX size={14} /> Cancel run
            </button>
          )}
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
          catalogState={catalogState}
          credibility={catalogCredibility}
          installations={catalogInstallations}
          spatialInputsValid={spatialInputsValid}
          onSpatialValidityChange={setSpatialInputsValid}
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
        <section
          className="session-layout"
          data-engine-backend={result.engineRun.diagnostics.backend}
        >
          <aside className="session-left">
            <div className="session-heading">
              <span>Advanced experiment tools</span>
              <strong>Run 01 · {playing ? "Playing" : "Paused"}</strong>
            </div>
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
          <section className={`simulation-column ${telemetryExpanded ? "telemetry-expanded" : "telemetry-collapsed"}`}>
            <div className="sim-topline">
              <div className="sim-identity">
                <span>Computed model state</span>
                <strong>
                  {blueSystem.designation} · {scenario.guidance} path
                </strong>
              </div>
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
                <Metric label="Time" value={`${selectedDisplayFrame.displayTimeSeconds.toFixed(1)} s`} />
                <Metric
                  label="Range"
                  value={selectedGeometry.state === "AVAILABLE"
                    ? `${(selectedGeometry.rangeMeters / 1000).toFixed(1)} km`
                    : "Unavailable"}
                />
                <Metric
                  label="Closure"
                  value={selectedGeometry.state === "AVAILABLE"
                    ? `${Math.round(selectedGeometry.closureRateMps)} m/s`
                    : "Unavailable"}
                />
                <Metric
                  label="Weapon state"
                  value={selectedGeometry.weapon.state === "AVAILABLE"
                    ? selectedGeometry.weapon.flightState.replaceAll("_", " ")
                    : "Not launched"}
                />
              </div>
            </div>
            <div
              className={`scene-wrap ${playbackSurface === "MAP" ? "map-surface" : "three-d-surface"}`}
            >
              {playbackSurface === "MAP" ? (
                <EngagementMap
                  result={result}
                  selected={selectedDisplayFrame}
                  installations={catalogInstallations}
                  layoutRevision={telemetryExpanded ? 1 : 0}
                />
              ) : (
                <SimulationScene
                  result={result}
                  selected={selectedDisplayFrame}
                  profile={scenario.profile}
                  layers={layers}
                  layoutRevision={telemetryExpanded ? 1 : 0}
                />
              )}
              <TacticalSymbolLegend
                symbols={applyTacticalLabelPolicy(frame.entities.map((entity) => presentTacticalSymbol({
                  id: entity.id,
                  designation: entity.designation,
                  kind: entity.kind,
                  affiliation: entity.affiliation,
                  lifecycle: entity.lifecycle,
                  symbolRole: entity.symbolRole,
                  headingRad: entity.headingRad,
                  headingRequired: true,
                  valueState: "WORLD",
                })))}
                label="Recorded entities"
              />
              <div className="view-note">
                Computed model state · {playbackSurface === "MAP" ? "pan or zoom the geographic surface" : "drag to orbit · scroll to zoom"}
              </div>
            </div>
            <Playback
              result={result}
              time={time}
              displayTimeSeconds={selectedDisplayFrame.displayTimeSeconds}
              setTime={setTime}
              playing={playing}
              setPlaying={setPlaying}
              speed={speed}
              setSpeed={setSpeed}
            />
            <ViewportTelemetry
              expanded={telemetryExpanded}
              onExpandedChange={setTelemetryDisclosure}
              result={result}
              selected={selectedDisplayFrame}
            />
            <div className="compact-track-inspector">
              <TrackStateInspector
                selected={selectedTrackState}
                perspective={trackPerspective}
                onPerspectiveChange={setTrackPerspective}
              />
              <RouteTransitionInspector transitions={selectedRouteTransitions} />
            </div>
          </section>
          <aside className="session-right">
            <Outcome result={result} />
            <TrackStateInspector
              selected={selectedTrackState}
              perspective={trackPerspective}
              onPerspectiveChange={setTrackPerspective}
            />
            {comparison ? (
              <Comparison scenario={scenario} data={comparison} />
            ) : (
              <CurrentGeometry geometry={selectedGeometry} />
            )}
            <RouteTransitionInspector transitions={selectedRouteTransitions} />
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
  catalogState,
  credibility,
  installations,
  spatialInputsValid,
  onSpatialValidityChange,
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
  catalogState: "loading" | "POSTGIS" | "error";
  credibility: CatalogCredibilityAdmission | null;
  installations: MapInstallation[];
  spatialInputsValid: boolean;
  onSpatialValidityChange: (valid: boolean) => void;
  run: () => void;
}) {
  const [contextExpanded, setContextExpanded] = useState(true);
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
  const selectedStudyArea = studyAreas.find(
    (area) => area.id === scenario.studyAreaId,
  );
  const selectedWeather = selectedStudyArea?.weatherPresets.find(
    (preset) => preset.id === scenario.weatherPresetId,
  );
  const update = <K extends keyof Scenario>(key: K, value: Scenario[K]) =>
    setScenario((current) => ({ ...current, [key]: value }));
  const applySpatialPlan = (plan: ScenarioSpatialPlan) => {
    if (!selectedStudyArea) return;
    setScenario((current) => ({
      ...current,
      spatialPlan: plan,
      range: spatialHorizontalSeparationM(plan, selectedStudyArea),
      altitude: plan.blue.position.altitudeM,
      targetDelta:
        plan.red.position.altitudeM - plan.blue.position.altitudeM,
      aspect: spatialAspectDeg(plan, selectedStudyArea),
      launcherSpeed: plan.blue.speedMps,
      targetSpeed: plan.red.speedMps,
    }));
  };
  const updateSpatialAltitude = (team: "blue" | "red", altitudeM: number) => {
    const plan = scenario.spatialPlan;
    if (!plan) return;
    applySpatialPlan({
      ...plan,
      [team]: {
        ...plan[team],
        position: { ...plan[team].position, altitudeM },
        route: plan[team].route.map((point, index) =>
          index === 0 ? { ...point, altitudeM } : point,
        ),
      },
    });
  };
  const updateSpatialSpeed = (team: "blue" | "red", speedMps: number) => {
    const plan = scenario.spatialPlan;
    if (!plan) {
      update(team === "blue" ? "launcherSpeed" : "targetSpeed", speedMps);
      return;
    }
    applySpatialPlan({
      ...plan,
      [team]: { ...plan[team], speedMps },
    });
  };
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
      spatialPlan: undefined,
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
      "Admitted conditions",
      "What is available in this deployment?",
      "Route, flight state, loadout, and frozen weather inputs are admitted. Sensor, electronic-warfare, and tactical-policy controls remain unavailable until their causal runtime contracts land.",
    ],
    [
      "Validate",
      "Review the configured experiment.",
      "The template is ready when its setup checks pass. These checks test completeness and consistency; they do not certify real-world performance.",
    ],
  ];
  const navigateStep = (value: number) => {
    if (step === 2 && !spatialInputsValid && value !== 2) return;
    setStep(value);
  };
  const advance = () => (step === 4 ? run() : navigateStep(step + 1));
  return (
    <section className="build-workspace">
      <aside className="build-steps">
        <span>Construct experiment</span>
        {CONFIGURE_STEPS.map((label, index) => (
          <button
            className={index === step ? "active" : ""}
            key={label}
            onClick={() => navigateStep(index)}
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
                  onChange={(value) => updateSpatialSpeed("blue", value)}
                />
                {!fixed && (
                  <Range
                    label={`${redObject.designation} speed`}
                    value={scenario.targetSpeed}
                    min={80}
                    max={450}
                    step={5}
                    unit="m/s"
                    onChange={(value) => updateSpatialSpeed("red", value)}
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
                <strong>Geographic and atmospheric context.</strong>
                <p>
                  A governed regional preset sets the map anchor, boundary,
                  terrain reference, and weather. It is not an operator-drawn
                  engagement area.
                </p>
              </header>
              {selectedStudyArea && selectedWeather && (
                <div className="study-context-summary">
                  <div>
                    <span>Preconfigured context</span>
                    <strong>{selectedStudyArea.shortName} · {selectedWeather.label}</strong>
                    <small>
                      {selectedStudyArea.terrainClass.toLowerCase().replaceAll("_", " ")} · {selectedStudyArea.surfaceElevationM} m reference terrain · ISA {selectedWeather.temperatureOffsetC >= 0 ? "+" : ""}{selectedWeather.temperatureOffsetC} °C · wind {selectedWeather.windEastMps} E / {selectedWeather.windNorthMps} N m/s
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-expanded={contextExpanded}
                    onClick={() => setContextExpanded((current) => !current)}
                  >
                    {contextExpanded ? "Hide context choices" : "Show context choices"}
                  </button>
                </div>
              )}
              {studyAreas.length === 0 && (
                <div className="study-context-unavailable" role="status">
                  <strong>
                    {catalogState === "loading"
                      ? "Loading governed study areas…"
                      : "Governed study areas are unavailable."}
                  </strong>
                  <span>
                    {catalogState === "loading"
                      ? "North Punjab, Ladakh, and the remaining regional presets will appear after PostGIS admission completes."
                      : "Simulation is blocked because the PostGIS catalog did not provide the governed place and weather contract. Check the catalog service, migrations, and local Compose stack."}
                  </span>
                </div>
              )}
              {contextExpanded && (
                <div className="study-context-editor">
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
              )}
            </div>
            {selectedStudyArea && (
              <ScenarioAuthoringMap
                key={selectedStudyArea.id}
                scenario={scenario}
                studyArea={selectedStudyArea}
                blueObject={bluePlatform}
                redObject={redObject}
                installations={installations}
                onChange={applySpatialPlan}
                onValidityChange={onSpatialValidityChange}
              />
            )}
            <div className="compact-controls">
              <Range
                label="Starting distance"
                value={scenario.range / 1000}
                min={5}
                max={170}
                unit="km"
                onChange={(value) => {
                  const rangeM = value * 1000;
                  if (scenario.spatialPlan && selectedStudyArea) {
                    applySpatialPlan(
                      withSpatialRangeM(
                        scenario.spatialPlan,
                        selectedStudyArea,
                        rangeM,
                      ),
                    );
                  } else {
                    update("range", rangeM);
                  }
                }}
              />
              <Range
                label={fixed ? "Launch elevation" : "Launch altitude"}
                value={scenario.altitude}
                min={0}
                max={15000}
                step={10}
                unit="m"
                onChange={(value) =>
                  scenario.spatialPlan
                    ? updateSpatialAltitude("blue", value)
                    : update("altitude", value)
                }
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
                onChange={(value) =>
                  scenario.spatialPlan
                    ? updateSpatialAltitude(
                        "red",
                        scenario.spatialPlan.blue.position.altitudeM + value,
                      )
                    : update("targetDelta", value)
                }
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
              <>
                <div className="advanced-grid">
                  {!fixed && (
                    <Range
                      label="Starting crossing angle"
                      value={scenario.aspect}
                      min={0}
                      max={180}
                      step={5}
                      unit="°"
                      onChange={(value) => {
                        if (scenario.spatialPlan && selectedStudyArea) {
                          applySpatialPlan(
                            withSpatialAspectDeg(
                              scenario.spatialPlan,
                              selectedStudyArea,
                              value,
                            ),
                          );
                        } else {
                          update("aspect", value);
                        }
                      }}
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
              </>
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
            <CapabilityNotice />
            <Range
              label="Eastward wind velocity"
              value={scenario.wind}
              min={-40}
              max={40}
              step={1}
              unit="m/s"
              onChange={(value) => update("wind", value)}
            />
            <p className="field-help">
              A positive value means the air is moving toward the east; a
              negative value means it is moving toward the west. VECTOR combines
              it with the preset northward wind and subtracts that wind vector
              from ground velocity to calculate aerodynamic drag.
            </p>
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
                  {formatDistanceKm(scenario.range)} km · {scenario.guidance} path
                </strong>
                <p>
                  {selectedStudyArea?.shortName ?? "Study area unavailable"} · {selectedWeather?.label ?? "weather not selected"} · {" "}
                  {scenario.altitude} m launch elevation
                  {fixed ? "" : ` · ${scenario.aspect}° aspect`}
                </p>
                <button onClick={() => setStep(2)}>Edit flight</button>
              </div>
              <div>
                <span>Admitted conditions</span>
                <strong>Route and frozen environment</strong>
                <p>
                  Sensor, EW, and tactical-policy controls are unavailable in this deployment.
                </p>
                <button onClick={() => setStep(3)}>View admission</button>
              </div>
              <article className={`credibility-admission ${credibility?.state === "ADMITTED" ? "admitted" : "limited"}`}>
                <span>MODEL CREDIBILITY</span>
                <strong>
                  {credibility
                    ? `${credibility.credibilityManifest.approvalState} · ${credibility.state.replaceAll("_", " ").toLowerCase()}`
                    : "Catalog credibility not admitted"}
                </strong>
                {credibility ? (
                  <>
                    <p>
                      Intended use {credibility.intendedUse.id}@{credibility.intendedUse.version} · pack {credibility.modelPack.id}@{credibility.modelPack.version} · {credibility.modelPack.digest.slice(0, 16)}
                    </p>
                    {credibility.credibilityManifest.limitations.map((limitation) => (
                      <p key={limitation.id}>
                        <b>{limitation.severity}:</b> {limitation.statement}
                      </p>
                    ))}
                  </>
                ) : (
                  <p>Simulation remains blocked until the intended-use, model-pack, and credibility-manifest chain is complete.</p>
                )}
              </article>
            </div>
            <ValidationList items={validations} />
          </section>
        )}
        </div>
        <footer className="builder-actions" data-vector-overlay-obstacle="persistent-action-rail">
          <span>
            {step === 4
              ? canConduct(validations)
                ? "Setup checks passed. Ready to run"
                : "Resolve failed checks before running"
              : "Changes apply to this experiment only"}
          </span>
          <div>
            {step > 0 && (
              <button className="back-action" onClick={() => navigateStep(step - 1)}>
                Back
              </button>
            )}
            <button
              disabled={
                (step === 2 && !spatialInputsValid) ||
                (step === 4 && !canConduct(validations))
              }
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
          <dt>Execution backend</dt>
          <dd>Deployment configuration</dd>
          <dt>Starting distance</dt>
          <dd>{formatDistanceKm(scenario.range)} km</dd>
          <dt>Environment</dt>
          <dd>
            {selectedStudyArea?.shortName ?? definition.environment} · {selectedWeather?.label ?? "weather preset unavailable"}
          </dd>
          <dt>Credibility</dt>
          <dd>
            {credibility
              ? `${credibility.credibilityManifest.approvalState} · pack ${credibility.modelPack.version}`
              : "Not admitted"}
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
            {formatDistanceKm(scenario.range)} km · Blue {scenario.altitude} m · Red{" "}
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

const PlatformSystems = PlatformEvidence;

function WeaponDetails({ weaponId }: { weaponId: string }) {
  const weapon = findWeapon(weaponId);
  if (!weapon) return null;
  const sources = weapon.sourceIds.map(getSource).filter(Boolean);
  return (
    <Disclosure
      className="weapon-details"
      summary={
        <>
        Weapon guidance and sources <span>{weapon.status}</span>
        </>
      }
    >
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
    </Disclosure>
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
  displayTimeSeconds,
  setTime,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: {
  result: SimulationResult;
  time: number;
  displayTimeSeconds: number;
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
      <span data-display-time={displayTimeSeconds}>
        {displayTimeSeconds.toFixed(1)} / {result.timeOfFlight.toFixed(1)} s
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
function CapabilityNotice() {
  const sensors = optionalCapability("sensors");
  const datalink = optionalCapability("datalink");
  const ew = optionalCapability("ew");
  return (
    <section className="configured-note" role="status">
      <CircleAlert size={16} />
      <div>
        <strong>Information-state availability is deployment governed.</strong>
        <p>
          This run uses authored aircraft routes, admitted loadout, frozen
          environmental inputs, and the admitted public-educational sensor
          measurement model. Data link, airborne early warning, and virtual-
          pilot behavior remain unavailable unless their own capability is admitted.
        </p>
        <p>
          Sensors: {sensors.state.toLowerCase().replaceAll("_", " ")}. {sensors.reason}
          {" "}Data link: {datalink.state.toLowerCase().replaceAll("_", " ")}. {datalink.reason}
          {" "}EW: {ew.state.toLowerCase().replaceAll("_", " ")}. {ew.reason}
        </p>
      </div>
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
