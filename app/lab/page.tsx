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
import { TargetEffectSummary } from "@/components/TargetEffectSummary";
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
  selectCanonicalTargetEffect,
  selectCurrentGeometry,
  selectDisplayFrame,
  selectRecordedTrackState,
  selectRouteTransitionStates,
} from "@/lib/frontend/selectors";
import {
  AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2,
  authorGenericAirborneStoreTransfer,
  bindRunwayEvidence,
  createDefaultAirMissionDefinition,
  synchronizeScenarioAirMission,
  updateScenarioAirMissionRoutePoint,
} from "@/lib/air-mission";
import { CURRENT_COMPILED_MODEL_PACK } from "@/lib/engine/weapon-admission";
import { NumericAuthoringInput } from "@/components/NumericAuthoringInput";
import {
  MAX_WGS84_FRACTION_DIGITS,
  type NumericAuthority,
} from "@/lib/scenario-control-authority";

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

type CatalogEnvironmentPack = {
  id: string;
  version: string;
  digest: string;
  study_area_id: string;
  weather_preset_id: string;
  terrain_digest: string;
  atmosphere_digest: string;
  valid_from: string;
  valid_until: string;
};

type CatalogRunway = {
  id: string;
  installation_id: string;
  source_runway_id: string;
  true_heading_deg: number | string;
  reciprocal_true_heading_deg: number | string;
  length_m: number | string;
  width_m: number | string;
  surface: string;
  closed_in_source: boolean;
  centreline: { type: "LineString"; coordinates: [[number, number], [number, number]] };
  threshold_elevations_msl_m: { low: number; high: number };
  mission_start_eligibility: "PUBLIC_EDUCATIONAL" | "INELIGIBLE";
};

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
  const [catalogRunways, setCatalogRunways] = useState<CatalogRunway[]>([]);
  const [catalogEnvironmentPacks, setCatalogEnvironmentPacks] = useState<CatalogEnvironmentPack[]>([]);
  const [catalogStudyAreas, setCatalogStudyAreas] = useState<StudyArea[]>([]);
  const [catalogCredibility, setCatalogCredibility] =
    useState<CatalogCredibilityAdmission | null>(null);
  const [spatialInputsValid, setSpatialInputsValid] = useState(true);
  const [invalidAuthoringControls, setInvalidAuthoringControls] = useState<Set<string>>(
    () => new Set(),
  );
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
  const authoringInputsValid = invalidAuthoringControls.size === 0;
  const setAuthoringControlValidity = useCallback((controlId: string, valid: boolean) => {
    setInvalidAuthoringControls((current) => {
      const next = new Set(current);
      if (valid) next.delete(controlId);
      else next.add(controlId);
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, []);
  const validations = useMemo(() => {
    const items = validateScenario(definition, scenario);
    return spatialInputsValid && authoringInputsValid
      ? items
      : [
          ...items,
          {
            id: "authored-flight-input",
            label: "An authored input is invalid",
            detail: authoringInputsValid
              ? "Correct the marked start or route value in Place & flight."
              : `Correct ${invalidAuthoringControls.size} malformed numeric input${invalidAuthoringControls.size === 1 ? "" : "s"} before admission.`,
            state: "error" as const,
          },
        ];
  }, [authoringInputsValid, definition, invalidAuthoringControls.size, scenario, spatialInputsValid]);
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
          runways?: CatalogRunway[];
          environmentPacks?: CatalogEnvironmentPack[];
          simulationModels?: Parameters<typeof registerDatabaseSimulationModels>[0];
          scenarioTemplates?: StoredScenarioPackage[];
          credibilityAdmissions?: CatalogCredibilityAdmission[];
          installationCatalogue?: {
            schemaVersion: "vector.installation-catalogue.v2";
            id: string;
            version: string;
            digest: string;
            coverage: { declaredServiceCoverage: string; includedRecordCount: number };
            records: Array<{ id: string; sourceId: string; longitude: number; latitude: number }>;
            runways: Array<{ id: string; installationId: string; missionStartEligibility: string }>;
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
            payload.installationCatalogue.schemaVersion !== "vector.installation-catalogue.v2" ||
            payload.installationCatalogue.id !== INSTALLATION_CATALOGUE_IDENTITY.id ||
            payload.installationCatalogue.version !== INSTALLATION_CATALOGUE_IDENTITY.version ||
            payload.installationCatalogue.digest !== INSTALLATION_CATALOGUE_IDENTITY.digest ||
            payload.installationCatalogue.coverage.declaredServiceCoverage !== "BOUNDED_PUBLIC_REFERENCE_FIXTURE" ||
            payload.installationCatalogue.coverage.includedRecordCount !== payload.installations?.length ||
            payload.installationCatalogue.records.length !== payload.installations?.length ||
            payload.installationCatalogue.runways.length !== payload.runways?.length ||
            payload.environmentPacks?.length !== 12 ||
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
          setCatalogRunways(payload.runways ?? []);
          setCatalogEnvironmentPacks(payload.environmentPacks ?? []);
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
    setScenario((current) => {
      const next = typeof action === "function" ? action(current) : action;
      return next.airMission !== current.airMission
        ? next
        : synchronizeScenarioAirMission(next, CURRENT_COMPILED_MODEL_PACK);
    });
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
    if (!spatialInputsValid || !authoringInputsValid || !canConduct(checks)) {
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
  }, [authoringInputsValid, catalogState, definition, draftRevision, scenario, simulationClient, spatialInputsValid]);

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
          runways={catalogRunways}
          environmentPacks={catalogEnvironmentPacks}
          spatialInputsValid={spatialInputsValid}
          onSpatialValidityChange={setSpatialInputsValid}
          onAuthoringControlValidity={setAuthoringControlValidity}
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
              <button
                type="button"
                className="compact-results-navigation"
                onClick={() => setWorkspace("results")}
              >
                Explain &amp; report
              </button>
            </div>
            <div
              className={`scene-wrap ${playbackSurface === "MAP" ? "map-surface" : "three-d-surface"}`}
            >
              <div className="environment-pack-identity" role="status">
                Environment {result.engineRun.scenario.geospatial.environmentPack.identity.version} · {result.engineRun.scenario.geospatial.environmentPack.identity.digest.slice(0, 20)}… · {result.engineRun.scenario.geospatial.environmentPack.coverage.verticalDatum} · {result.engineRun.scenario.geospatial.environmentPack.validity.startsAt}
              </div>
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
                  targetEffectOverlay
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
  runways,
  environmentPacks,
  spatialInputsValid,
  onSpatialValidityChange,
  onAuthoringControlValidity,
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
  runways: CatalogRunway[];
  environmentPacks: CatalogEnvironmentPack[];
  spatialInputsValid: boolean;
  onSpatialValidityChange: (valid: boolean) => void;
  onAuthoringControlValidity: (controlId: string, valid: boolean) => void;
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
  const selectedEnvironmentPack = environmentPacks.find((pack) =>
    pack.study_area_id === scenario.studyAreaId && pack.weather_preset_id === scenario.weatherPresetId);
  const blueGroundStartAvailable = runways.some((runway) =>
    runway.id === scenario.spatialPlan?.blue.originReference?.runwayId
    && runway.mission_start_eligibility === "PUBLIC_EDUCATIONAL");
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
  const setMissionStartPosture = (posture: NonNullable<Scenario["airMission"]>["start"]["posture"]) => {
    setScenario((current) => {
      if (!current.airMission || !current.spatialPlan || current.domain !== "A2A") return current;
      if (posture === "AIRBORNE") {
        return {
          ...current,
          airMission: {
            ...current.airMission,
            start: {
              posture: "AIRBORNE",
              flightPlanId: current.airMission.flightPlans[0].id,
              routePointId: current.airMission.flightPlans[0].routePoints[0].id,
            },
          },
        };
      }
      const origin = current.spatialPlan.blue.originReference;
      const installation = installations.find((item) => item.id === origin?.installationId);
      const sourceRunway = runways.find((item) => item.id === origin?.runwayId
        && item.installation_id === installation?.id
        && item.mission_start_eligibility === "PUBLIC_EDUCATIONAL");
      if (!origin || !installation || !sourceRunway?.centreline || !sourceRunway.threshold_elevations_msl_m) return current;
      const elevationM = Number(sourceRunway.threshold_elevations_msl_m.low);
      const longitude = Number(sourceRunway.centreline.coordinates[0][0]);
      const latitude = Number(sourceRunway.centreline.coordinates[0][1]);
      const threshold = { longitude, latitude, elevation: { valueM: elevationM, datum: "MSL" as const } };
      const runwayMaterial = {
        id: sourceRunway.id,
        threshold,
        end: {
          longitude: Number(sourceRunway.centreline.coordinates[1][0]),
          latitude: Number(sourceRunway.centreline.coordinates[1][1]),
          elevation: { valueM: Number(sourceRunway.threshold_elevations_msl_m.high), datum: "MSL" as const },
        },
        headingDeg: Number(sourceRunway.true_heading_deg),
        lengthM: Number(sourceRunway.length_m),
        widthM: Number(sourceRunway.width_m),
        surface: "PAVED" as const,
        operationalState: "OPEN" as const,
      };
      const nextPlan: ScenarioSpatialPlan = {
        ...current.spatialPlan,
        blue: {
          ...current.spatialPlan.blue,
          position: { longitude, latitude, altitudeM: elevationM, verticalDatum: "MSL" },
          route: current.spatialPlan.blue.route.map((point, index) => index === 0
            ? { longitude, latitude, altitudeM: elevationM, verticalDatum: "MSL" }
            : point),
        },
      };
      const synchronized = synchronizeScenarioAirMission({
        ...current,
        spatialPlan: nextPlan,
        altitude: elevationM,
      }, CURRENT_COMPILED_MODEL_PACK);
      return {
        ...synchronized,
        airMission: {
          ...synchronized.airMission!,
          start: {
            posture,
            installationId: origin?.installationId ?? "",
            installationSourceId: origin?.sourceId ?? "",
            runway: bindRunwayEvidence(runwayMaterial, {
              state: "SOURCED",
              sourceId: `${INSTALLATION_CATALOGUE_IDENTITY.id}@${INSTALLATION_CATALOGUE_IDENTITY.version}:${sourceRunway.source_runway_id}:${INSTALLATION_CATALOGUE_IDENTITY.digest}`,
            }),
            readinessDelaySeconds: posture === "GROUND_ALERT_QRA" ? 300 : 0,
            taxiFidelity: "ABSTRACTED",
            takeoffCondition: "Runway open, compatibility admitted, and readiness delay elapsed.",
            rejectedTakeoffCondition: "Runway closes or the admitted ground envelope is violated before release.",
          },
        },
      };
    });
  };
  const reverseMissionRunwayDirection = () => {
    setScenario((current) => {
      if (
        !current.airMission ||
        !current.spatialPlan ||
        current.domain !== "A2A"
      ) return current;
      const mission = current.airMission;
      if (mission.start.posture === "AIRBORNE") return current;
      const start = mission.start;
      const sourceRunway = runways.find((item) =>
        item.id === start.runway.id &&
        item.installation_id === start.installationId &&
        item.mission_start_eligibility === "PUBLIC_EDUCATIONAL",
      );
      if (!sourceRunway?.centreline || !sourceRunway.threshold_elevations_msl_m) return current;
      const currentlyForward = Math.abs(
        start.runway.headingDeg - Number(sourceRunway.true_heading_deg),
      ) < 1e-6;
      const thresholdIndex = currentlyForward ? 1 : 0;
      const endIndex = currentlyForward ? 0 : 1;
      const thresholdElevationM = Number(
        currentlyForward
          ? sourceRunway.threshold_elevations_msl_m.high
          : sourceRunway.threshold_elevations_msl_m.low,
      );
      const endElevationM = Number(
        currentlyForward
          ? sourceRunway.threshold_elevations_msl_m.low
          : sourceRunway.threshold_elevations_msl_m.high,
      );
      const longitude = Number(sourceRunway.centreline.coordinates[thresholdIndex][0]);
      const latitude = Number(sourceRunway.centreline.coordinates[thresholdIndex][1]);
      const runway = bindRunwayEvidence({
        id: sourceRunway.id,
        threshold: {
          longitude,
          latitude,
          elevation: { valueM: thresholdElevationM, datum: "MSL" },
        },
        end: {
          longitude: Number(sourceRunway.centreline.coordinates[endIndex][0]),
          latitude: Number(sourceRunway.centreline.coordinates[endIndex][1]),
          elevation: { valueM: endElevationM, datum: "MSL" },
        },
        headingDeg: Number(
          currentlyForward
            ? sourceRunway.reciprocal_true_heading_deg
            : sourceRunway.true_heading_deg,
        ),
        lengthM: Number(sourceRunway.length_m),
        widthM: Number(sourceRunway.width_m),
        surface: "PAVED",
        operationalState: "OPEN",
      }, {
        state: "SOURCED",
        sourceId: `${INSTALLATION_CATALOGUE_IDENTITY.id}@${INSTALLATION_CATALOGUE_IDENTITY.version}:${sourceRunway.source_runway_id}:${INSTALLATION_CATALOGUE_IDENTITY.digest}`,
      });
      const spatialPlan: ScenarioSpatialPlan = {
        ...current.spatialPlan,
        blue: {
          ...current.spatialPlan.blue,
          position: { longitude, latitude, altitudeM: thresholdElevationM, verticalDatum: "MSL" },
          route: current.spatialPlan.blue.route.map((point, index) => index === 0
            ? { longitude, latitude, altitudeM: thresholdElevationM, verticalDatum: "MSL" }
            : point),
        },
      };
      const synchronized = synchronizeScenarioAirMission({
        ...current,
        spatialPlan,
        altitude: thresholdElevationM,
      }, CURRENT_COMPILED_MODEL_PACK);
      return {
        ...synchronized,
        airMission: {
          ...synchronized.airMission!,
          start: { ...start, runway },
        },
      };
    });
  };
  const updateMissionRoutePoint = (
    index: number,
    patch: Partial<NonNullable<Scenario["airMission"]>["flightPlans"][number]["routePoints"][number]>,
  ) => {
    setScenario((current) => updateScenarioAirMissionRoutePoint(current, index, patch));
  };
  const authorStoreTransfer = () => {
    setScenario((current) => {
      if (!current.airMission) return current;
      return {
        ...current,
        airMission: authorGenericAirborneStoreTransfer({
          mission: current.airMission,
          modelPack: CURRENT_COMPILED_MODEL_PACK,
          storeOrdinal: 1,
          operation: "RELEASE",
          requestedTimeSeconds: current.airMission.start.posture === "AIRBORNE" ? 0 : 20,
          installedDragAreaM2: 0.08,
          valueState: "USER_AUTHORED",
        }),
      };
    });
  };
  const updateStoreTransfer = (
    patch: Partial<NonNullable<NonNullable<Scenario["airMission"]>["assignments"][number]["storeTransferPlan"]>["requests"][number]>,
  ) => {
    setScenario((current) => {
      if (!current.airMission?.assignments[0].storeTransferPlan?.requests[0]) return current;
      const airMission = structuredClone(current.airMission);
      Object.assign(airMission.assignments[0].storeTransferPlan!.requests[0], patch);
      return { ...current, airMission };
    });
  };
  const clearStoreTransfer = () => {
    setScenario((current) => {
      if (!current.airMission) return current;
      const airMission = structuredClone(current.airMission);
      delete airMission.assignments[0].storeTransferPlan;
      return { ...current, airMission };
    });
  };
  const updateMissionLegRole = (
    index: number,
    role: NonNullable<Scenario["airMission"]>["flightPlans"][number]["legs"][number]["role"],
  ) => {
    if (!scenario.airMission) return;
    const flightPlans = structuredClone(scenario.airMission.flightPlans);
    flightPlans[0].legs[index].role = role;
    update("airMission", { ...scenario.airMission, flightPlans });
  };
  type CapTasks = Extract<NonNullable<Scenario["airMission"]>["tasks"], { kind: "COMBAT_AIR_PATROL" }>;
  const updateCapTasks = (patch: Partial<CapTasks>) => {
    setScenario((current) => {
      if (!current.airMission || current.airMission.tasks.kind !== "COMBAT_AIR_PATROL") return current;
      return {
        ...current,
        airMission: {
          ...current.airMission,
          tasks: { ...current.airMission.tasks, ...patch },
        },
      };
    });
  };
  const updateCapAreaVertex = (
    areaKey: "patrolArea" | "prosecutionArea",
    vertexIndex: number,
    coordinate: "longitude" | "latitude",
    value: number,
  ) => {
    setScenario((current) => {
      if (!current.airMission || current.airMission.tasks.kind !== "COMBAT_AIR_PATROL") return current;
      const tasks = structuredClone(current.airMission.tasks);
      const area = tasks[areaKey];
      if (!area) return current;
      area.vertices[vertexIndex][coordinate] = value;
      return { ...current, airMission: { ...current.airMission, tasks } };
    });
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
                data-control-id="scenario.name"
                value={scenario.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </label>
            <label className="field">
              <span>What this run compares</span>
              <textarea
                data-control-id="scenario.objective"
                value={scenario.objective}
                onChange={(event) => update("objective", event.target.value)}
              />
            </label>
            {scenario.airMission && (
              <section className="air-mission-editor" aria-label="Air mission contract">
                <header>
                  <span>AIR MISSION · {scenario.airMission.schemaVersion}</span>
                  <strong>Mission intent compiled with the flight, fuel, loadout, and start artifact.</strong>
                  <p>These are causal authored fields, not report labels. Run admission binds their exact digest.</p>
                </header>
                <div className="advanced-grid">
                  <label className="field">
                    <span>Mission class</span>
                    <select
                      data-control-id="airMission.missionClass"
                      aria-label="Mission class"
                      data-vector-overlay-exempt="ua-native-select"
                      value={scenario.airMission.missionClass}
                      onChange={(event) => update("airMission", createDefaultAirMissionDefinition({
                        scenario,
                        missionClass: event.target.value as NonNullable<Scenario["airMission"]>["missionClass"],
                        modelPack: CURRENT_COMPILED_MODEL_PACK,
                      }))}
                    >
                      <option value="TACTICAL_INTERCEPT">Tactical Intercept</option>
                      <option value="COMBAT_AIR_PATROL">Combat Air Patrol</option>
                      <option value="FIGHTER_SWEEP">Fighter Sweep</option>
                      <option value="ESCORT">Escort</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Engagement regime</span>
                    <select
                      data-control-id="airMission.regime"
                      aria-label="Engagement regime"
                      data-vector-overlay-exempt="ua-native-select"
                      value={scenario.airMission.regime}
                      onChange={(event) => update("airMission", {
                        ...scenario.airMission!,
                        regime: event.target.value as NonNullable<Scenario["airMission"]>["regime"],
                      })}
                    >
                      <option value="BVR">BVR</option>
                      <option value="WVR_BFM">WVR / BFM</option>
                      <option value="UNRESTRICTED_TRANSITION">Unrestricted / transition</option>
                    </select>
                  </label>
                </div>
                {scenario.airMission.tasks.kind === "COMBAT_AIR_PATROL" && (
                  <div className="cap-contract" role="group" aria-label="CAP defaults">
                    <div className="advanced-grid">
                      <Range
                        controlId="airMission.tasks.cap.onStationMinutes"
                        label="CAP on-station time"
                        value={scenario.airMission.tasks.onStationMinutes}
                        min={5}
                        max={180}
                        step={5}
                        unit="min"
                        onChange={(value) => updateCapTasks({ onStationMinutes: value })}
                      />
                      <label className="field">
                        <span>On-station count</span>
                        <NumericAuthoringInput
                          controlId="airMission.tasks.cap.onStationCount"
                          ariaLabel="CAP on-station count"
                          value={scenario.airMission.tasks.onStationCount}
                          authority={numericAuthority(1, 64, 0, "aircraft", true)}
                          onChange={(value) => updateCapTasks({ onStationCount: value! })}
                          onValidityChange={onAuthoringControlValidity}
                        />
                      </label>
                      <label className="field">
                        <span>Flight size</span>
                        <NumericAuthoringInput
                          controlId="airMission.tasks.cap.flightSize"
                          ariaLabel="CAP flight size"
                          value={scenario.airMission.tasks.flightSize}
                          authority={numericAuthority(1, 64, 0, "aircraft", true)}
                          onChange={(value) => updateCapTasks({ flightSize: value! })}
                          onValidityChange={onAuthoringControlValidity}
                        />
                      </label>
                      <label className="field">
                        <span>Patrol pattern</span>
                        <select data-control-id="airMission.tasks.cap.patrolPattern" aria-label="CAP patrol pattern" data-vector-overlay-exempt="ua-native-select" value={scenario.airMission.tasks.patrolPattern} onChange={() => updateCapTasks({ patrolPattern: "RACETRACK" })}>
                          <option value="RACETRACK">Racetrack</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Investigation limit (m)</span>
                        <NumericAuthoringInput
                          controlId="airMission.tasks.cap.investigationLimitM"
                          ariaLabel="CAP investigation limit"
                          value={scenario.airMission.tasks.investigationLimitM}
                          authority={numericAuthority(1, 2_000_000, 0, "m")}
                          onChange={(value) => updateCapTasks({ investigationLimitM: value! })}
                          onValidityChange={onAuthoringControlValidity}
                        />
                      </label>
                      <label className="field">
                        <span>Prosecution limit (m)</span>
                        <NumericAuthoringInput
                          controlId="airMission.tasks.cap.prosecutionLimitM"
                          ariaLabel="CAP prosecution limit"
                          value={scenario.airMission.tasks.prosecutionLimitM}
                          authority={numericAuthority(1, 2_000_000, 0, "m")}
                          onChange={(value) => updateCapTasks({ prosecutionLimitM: value! })}
                          onValidityChange={onAuthoringControlValidity}
                        />
                      </label>
                      <Range
                        controlId="airMission.fuel.reservePercent"
                        label="Fuel reserve"
                        value={scenario.airMission.fuel.reservePercent}
                        min={5}
                        max={50}
                        step={5}
                        unit="%"
                        onChange={(value) => update("airMission", {
                          ...scenario.airMission!,
                          fuel: { ...scenario.airMission!.fuel, reservePercent: value },
                        })}
                      />
                      <label className="field">
                        <span>Weapon RTB threshold</span>
                        <NumericAuthoringInput
                          controlId="airMission.fuel.weaponRtbThreshold"
                          ariaLabel="CAP weapon RTB threshold"
                          value={scenario.airMission.fuel.weaponRtbThreshold}
                          authority={numericAuthority(0, 64, 0, "stores", true)}
                          onChange={(value) => update("airMission", { ...scenario.airMission!, fuel: { ...scenario.airMission!.fuel, weaponRtbThreshold: value! } })}
                          onValidityChange={onAuthoringControlValidity}
                        />
                      </label>
                      <label className="field">
                        <span>Emission policy</span>
                        <select
                          data-control-id="airMission.policies.emission"
                          aria-label="Emission policy"
                          data-vector-overlay-exempt="ua-native-select"
                          value={scenario.airMission.policies.emission}
                          onChange={(event) => update("airMission", {
                            ...scenario.airMission!,
                            policies: { ...scenario.airMission!.policies, emission: event.target.value as "ACTIVE" | "SILENT" },
                          })}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="SILENT">Silent</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Weapon policy</span>
                        <select data-control-id="airMission.policies.weapon" aria-label="Weapon policy" data-vector-overlay-exempt="ua-native-select" value={scenario.airMission.policies.weapon} onChange={(event) => update("airMission", { ...scenario.airMission!, policies: { ...scenario.airMission!.policies, weapon: event.target.value as NonNullable<Scenario["airMission"]>["policies"]["weapon"] } })}>
                          <option value="HOLD">Hold</option>
                          <option value="TIGHT">Tight</option>
                          <option value="FREE_WITHIN_BOUNDARY">Free within boundary</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Recovery</span>
                        <input data-control-id="airMission.recoveryCondition" aria-label="Recovery policy" value={scenario.airMission.recoveryCondition} onChange={(event) => update("airMission", { ...scenario.airMission!, recoveryCondition: event.target.value })} />
                      </label>
                      <label className="field">
                        <span>Recovery installation</span>
                        <select data-control-id="airMission.fuel.recoveryInstallationId" aria-label="Recovery installation" data-vector-overlay-exempt="ua-native-select" value={scenario.airMission.fuel.recoveryInstallationId ?? ""} onChange={(event) => update("airMission", { ...scenario.airMission!, fuel: { ...scenario.airMission!.fuel, recoveryInstallationId: event.target.value || null } })}>
                          <option value="">Not assigned</option>
                          {installations.map((installation) => <option key={installation.id} value={installation.id}>{installation.name}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span>Divert installation</span>
                        <select data-control-id="airMission.fuel.divertInstallationId" aria-label="Divert installation" data-vector-overlay-exempt="ua-native-select" value={scenario.airMission.fuel.divertInstallationId ?? ""} onChange={(event) => update("airMission", { ...scenario.airMission!, fuel: { ...scenario.airMission!.fuel, divertInstallationId: event.target.value || null } })}>
                          <option value="">Not assigned</option>
                          {installations.map((installation) => <option key={installation.id} value={installation.id}>{installation.name}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span>Completion</span>
                        <input data-control-id="airMission.tasks.cap.completionCondition" aria-label="CAP completion condition" value={scenario.airMission.tasks.completionCondition} onChange={(event) => updateCapTasks({ completionCondition: event.target.value })} />
                      </label>
                    </div>
                    {(["patrolArea", "prosecutionArea"] as const).map((areaKey) => {
                      const area = scenario.airMission!.tasks.kind === "COMBAT_AIR_PATROL" ? scenario.airMission!.tasks[areaKey] : null;
                      return area ? (
                        <fieldset className="mission-area-editor" key={areaKey}>
                          <legend>{areaKey === "patrolArea" ? "Patrol area" : "Prosecution area"} · WGS84 polygon</legend>
                          <div className="mission-area-vertices">
                            {area.vertices.map((vertex, index) => (
                              <div key={`${area.id}-${index}`}>
                                <label className="field">
                                  <span>Vertex {index + 1} longitude</span>
                                  <NumericAuthoringInput
                                    controlId={`airMission.tasks.cap.${areaKey}.vertices[${index}].longitude`}
                                    ariaLabel={`${areaKey} vertex ${index + 1} longitude`}
                                    value={vertex.longitude}
                                    authority={numericAuthority(-180, 180, MAX_WGS84_FRACTION_DIGITS, "deg_WGS84")}
                                    onChange={(value) => updateCapAreaVertex(areaKey, index, "longitude", value!)}
                                    onValidityChange={onAuthoringControlValidity}
                                  />
                                </label>
                                <label className="field">
                                  <span>Vertex {index + 1} latitude</span>
                                  <NumericAuthoringInput
                                    controlId={`airMission.tasks.cap.${areaKey}.vertices[${index}].latitude`}
                                    ariaLabel={`${areaKey} vertex ${index + 1} latitude`}
                                    value={vertex.latitude}
                                    authority={numericAuthority(-90, 90, MAX_WGS84_FRACTION_DIGITS, "deg_WGS84")}
                                    onChange={(value) => updateCapAreaVertex(areaKey, index, "latitude", value!)}
                                    onValidityChange={onAuthoringControlValidity}
                                  />
                                </label>
                              </div>
                            ))}
                          </div>
                        </fieldset>
                      ) : null;
                    })}
                  </div>
                )}
              </section>
            )}
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
                    controlId="scenario.bluePlatformId"
                    label="Aircraft variant"
                    value={scenario.bluePlatformId}
                    options={launchPlatforms}
                    team="blue"
                    onChange={selectBluePlatform}
                  />
                )}
                <ObjectPicker
                  controlId="scenario.blueSystemId"
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
                  controlId="scenario.blueWeaponQuantity"
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
                  controlId="scenario.redObjectId"
                  label={fixed ? "Fixed objective" : "Aircraft variant"}
                  value={scenario.redObjectId}
                  options={opposingObjects}
                  team="red"
                  onChange={selectRedPlatform}
                />
                {scenario.domain === "A2A" && redSystems.length > 0 && (
                  <>
                    <ObjectPicker
                      controlId="scenario.redSystemId"
                      label="Selected weapon"
                      value={scenario.redSystemId}
                      options={redSystems}
                      team="red"
                      onChange={(value) => update("redSystemId", value)}
                    />
                    <Quantity
                      controlId="scenario.redWeaponQuantity"
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
                  controlId="scenario.launcherSpeed"
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
                    controlId="scenario.targetSpeed"
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
                  controlId="scenario.blueFuelPercent"
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
                    controlId="scenario.redFuelPercent"
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
                    <small>
                      {selectedEnvironmentPack
                        ? `Environment ${selectedEnvironmentPack.version} · ${selectedEnvironmentPack.digest.slice(0, 20)}… · terrain ${selectedEnvironmentPack.terrain_digest.slice(0, 16)}… · atmosphere ${selectedEnvironmentPack.atmosphere_digest.slice(0, 16)}…`
                        : "Selected environment pack is not admitted by PostGIS."}
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
            {scenario.airMission && (
              <section className="air-mission-start-editor" aria-label="Mission start and recovery">
                <header>
                  <span>START & RECOVERY</span>
                  <strong>One compiled start posture; no coordinate-only base or runway substitution.</strong>
                  <p>Ground geometry is the exact sourced runway artifact admitted by the selected immutable environment pack. Aircraft ground-performance limits remain separately labelled model assumptions.</p>
                </header>
                <label className="field">
                  <span>Start posture</span>
                  <select
                    data-control-id="airMission.start.posture"
                    aria-label="Start posture"
                    data-vector-overlay-exempt="ua-native-select"
                    value={scenario.airMission.start.posture}
                    onChange={(event) => setMissionStartPosture(event.target.value as NonNullable<Scenario["airMission"]>["start"]["posture"])}
                  >
                    <option value="AIRBORNE">Airborne</option>
                    <option value="PARKING" disabled={!blueGroundStartAvailable}>Parking / ground start</option>
                    <option value="RUNWAY" disabled={!blueGroundStartAvailable}>Runway start</option>
                    <option value="GROUND_ALERT_QRA" disabled={!blueGroundStartAvailable}>Ground alert / QRA</option>
                  </select>
                </label>
                {scenario.airMission.start.posture === "AIRBORNE" ? (
                  <div className="fixed-condition">
                    <strong>Airborne route entry</strong>
                    <p>{scenario.airMission.start.flightPlanId} · {scenario.airMission.start.routePointId} · exact WGS84/MSL route-point identity</p>
                  </div>
                ) : (
                  <div className="ground-start-contract">
                    {!scenario.airMission.start.installationId && (
                      <div className="study-context-unavailable" role="alert">
                        <strong>Select a Blue origin installation before admitting a ground start.</strong>
                        <span>The compiler will not choose a base, runway, or source identity from coordinates.</span>
                      </div>
                    )}
                    <div className="advanced-grid">
                      <div className="fixed-condition">
                        <strong>Sourced runway · {scenario.airMission.start.runway.id}</strong>
                        <p>{scenario.airMission.start.runway.headingDeg.toFixed(1)}° true · {scenario.airMission.start.runway.lengthM.toFixed(1)} × {scenario.airMission.start.runway.widthM.toFixed(1)} m · {scenario.airMission.start.runway.surface.toLowerCase()}</p>
                        <button type="button" className="tool-button" onClick={reverseMissionRunwayDirection}>
                          Reverse takeoff direction
                        </button>
                      </div>
                      <label className="field">
                        <span>Readiness delay (s)</span>
                        <NumericAuthoringInput
                          controlId="airMission.start.readinessDelaySeconds"
                          ariaLabel="Readiness delay"
                          value={scenario.airMission.start.readinessDelaySeconds}
                          authority={numericAuthority(0, 86_400, 0, "s")}
                          onChange={(value) => update("airMission", {
                            ...scenario.airMission!,
                            start: { ...scenario.airMission!.start, readinessDelaySeconds: value! } as NonNullable<Scenario["airMission"]>["start"],
                          })}
                          onValidityChange={onAuthoringControlValidity}
                        />
                      </label>
                    </div>
                    <dl className="mission-start-readback">
                      <div><dt>Installation</dt><dd>{scenario.airMission.start.installationId || "UNKNOWN"} · source {scenario.airMission.start.installationSourceId || "UNKNOWN"}</dd></div>
                      <div><dt>Threshold</dt><dd>{scenario.airMission.start.runway.threshold.longitude.toFixed(6)}, {scenario.airMission.start.runway.threshold.latitude.toFixed(6)} · {scenario.airMission.start.runway.threshold.elevation.valueM.toFixed(1)} m MSL</dd></div>
                      <div><dt>Runway end</dt><dd>{scenario.airMission.start.runway.end.longitude.toFixed(6)}, {scenario.airMission.start.runway.end.latitude.toFixed(6)} · {scenario.airMission.start.runway.end.elevation.valueM.toFixed(1)} m MSL</dd></div>
                      <div><dt>Evidence</dt><dd>{scenario.airMission.start.runway.evidence.state.replaceAll("_", " ").toLowerCase()} · {scenario.airMission.start.runway.evidence.digest.slice(0, 16)}</dd></div>
                      <div><dt>Taxi fidelity</dt><dd>Abstracted · first frame remains on the threshold with zero speed</dd></div>
                      <div><dt>Takeoff</dt><dd>{scenario.airMission.start.takeoffCondition}</dd></div>
                      <div><dt>Rejected takeoff</dt><dd>{scenario.airMission.start.rejectedTakeoffCondition}</dd></div>
                    </dl>
                  </div>
                )}
                <div className="flight-plan-contract" role="region" aria-label="Airborne store transfer">
                  <span>AIRBORNE STORE TRANSFER · generic public educational</span>
                  {scenario.airMission.assignments[0].storeTransferPlan?.requests[0] ? (() => {
                    const request = scenario.airMission!.assignments[0].storeTransferPlan!.requests[0];
                    return (
                      <fieldset>
                        <legend>{request.storeEntityId} · {request.stationId}</legend>
                        <div className="advanced-grid">
                          <label className="field">
                            <span>Operation</span>
                            <select
                              data-control-id="airMission.assignments[0].storeTransfer.requests[0].operation"
                              aria-label="Store transfer operation"
                              data-vector-overlay-exempt="ua-native-select"
                              value={request.operation}
                              onChange={(event) => updateStoreTransfer({ operation: event.target.value as typeof request.operation })}
                            >
                              <option value="RELEASE">Release · generic guided path</option>
                              <option value="JETTISON">Jettison · unpowered coast</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Requested model time (s)</span>
                            <NumericAuthoringInput
                              controlId="airMission.assignments[0].storeTransfer.requests[0].requestedTimeSeconds"
                              ariaLabel="Store transfer requested time"
                              value={request.requestedTimeSeconds}
                              authority={numericAuthority(0, 300, 3, "s")}
                              onChange={(value) => updateStoreTransfer({ requestedTimeSeconds: value! })}
                              onValidityChange={onAuthoringControlValidity}
                            />
                          </label>
                          <label className="field">
                            <span>Installed drag area (m²)</span>
                            <NumericAuthoringInput
                              controlId="airMission.assignments[0].storeTransfer.requests[0].installedDragAreaM2"
                              ariaLabel="Store installed drag area"
                              value={request.installedDragAreaM2}
                              authority={numericAuthority(
                                AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2.minimum,
                                AIRBORNE_STORE_TRANSFER_INSTALLED_DRAG_AREA_M2.maximum,
                                3,
                                "m2",
                              )}
                              onChange={(value) => updateStoreTransfer({ installedDragAreaM2: value! })}
                              onValidityChange={onAuthoringControlValidity}
                            />
                          </label>
                        </div>
                        <p>
                          Exact authored request · {request.valueState.toLowerCase().replaceAll("_", " ")} · no named-aircraft/store, safe-separation, landing, or recovery fidelity.
                        </p>
                        <button type="button" className="tool-button" onClick={clearStoreTransfer}>
                          Remove transfer request
                        </button>
                      </fieldset>
                    );
                  })() : (
                    <div className="fixed-condition">
                      <strong>No airborne transfer request authored.</strong>
                      <p>The compiler will not invent operation, time, station, store, or installed drag authority.</p>
                      <button type="button" className="tool-button" onClick={authorStoreTransfer}>
                        Author store 1 transfer request
                      </button>
                    </div>
                  )}
                </div>
                <div className="flight-plan-contract" role="region" aria-label="Mission flight plan constraints">
                  <span>FLIGHT PLAN · vector.flight-plan.v1</span>
                  {scenario.airMission.flightPlans[0].routePoints.map((point, index) => (
                    <fieldset key={point.id}>
                      <legend>{point.id} · {point.turnMethod.replaceAll("_", " ").toLowerCase()}</legend>
                      <div className="advanced-grid">
                        <label className="field">
                          <span>Task reference</span>
                          <select
                            data-control-id={`airMission.flightPlans[0].routePoints[${index}].taskRef`}
                            aria-label={`${point.id} task reference`}
                            data-vector-overlay-exempt="ua-native-select"
                            value={point.taskRef ?? ""}
                            onChange={(event) => updateMissionRoutePoint(index, { taskRef: (event.target.value || null) as typeof point.taskRef })}
                          >
                            <option value="">No task reference</option>
                            <option value={index === 0 ? "MISSION_START" : scenario.airMission!.missionClass}>
                              {index === 0 ? "Mission start" : scenario.airMission!.missionClass.replaceAll("_", " ").toLowerCase()}
                            </option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Longitude (WGS84 deg)</span>
                          <NumericAuthoringInput
                            controlId={`airMission.flightPlans[0].routePoints[${index}].longitude`}
                            ariaLabel={`${point.id} longitude`}
                            value={point.position.longitude}
                            authority={numericAuthority(-180, 180, MAX_WGS84_FRACTION_DIGITS, "deg_WGS84")}
                            onChange={(value) => updateMissionRoutePoint(index, { position: { ...point.position, longitude: value! } })}
                            onValidityChange={onAuthoringControlValidity}
                          />
                        </label>
                        <label className="field">
                          <span>Latitude (WGS84 deg)</span>
                          <NumericAuthoringInput
                            controlId={`airMission.flightPlans[0].routePoints[${index}].latitude`}
                            ariaLabel={`${point.id} latitude`}
                            value={point.position.latitude}
                            authority={numericAuthority(-90, 90, MAX_WGS84_FRACTION_DIGITS, "deg_WGS84")}
                            onChange={(value) => updateMissionRoutePoint(index, { position: { ...point.position, latitude: value! } })}
                            onValidityChange={onAuthoringControlValidity}
                          />
                        </label>
                        <label className="field">
                          <span>Altitude (m MSL)</span>
                          <NumericAuthoringInput
                            controlId={`airMission.flightPlans[0].routePoints[${index}].altitudeMslM`}
                            ariaLabel={`${point.id} altitude metres MSL`}
                            value={point.position.altitude.valueM}
                            authority={numericAuthority(0, 30_000, 1, "m_MSL")}
                            onChange={(value) => updateMissionRoutePoint(index, { position: { ...point.position, altitude: { ...point.position.altitude, valueM: value! } } })}
                            onValidityChange={onAuthoringControlValidity}
                          />
                        </label>
                        <label className="field">
                          <span>Turn method</span>
                          <select
                            data-control-id={`airMission.flightPlans[0].routePoints[${index}].turnMethod`}
                            aria-label={`${point.id} turn method`}
                            data-vector-overlay-exempt="ua-native-select"
                            value={point.turnMethod}
                            disabled={index === 0}
                            onChange={(event) => updateMissionRoutePoint(index, { turnMethod: event.target.value as typeof point.turnMethod })}
                          >
                            {(index === 0 ? ["START"] : ["FLY_BY", "FLY_OVER"] as const).map((method) => <option key={method} value={method}>{method.replaceAll("_", " ").toLowerCase()}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span>Acceptance radius (m)</span>
                          <NumericAuthoringInput
                            controlId={`airMission.flightPlans[0].routePoints[${index}].acceptanceRadiusM`}
                            ariaLabel={`${point.id} acceptance radius metres`}
                            value={point.acceptanceRadiusM}
                            disabled={index === 0 || point.turnMethod === "FLY_OVER"}
                            authority={numericAuthority(1, 25_000, 1, "m")}
                            onChange={(value) => updateMissionRoutePoint(index, { acceptanceRadiusM: value! })}
                            onValidityChange={onAuthoringControlValidity}
                          />
                        </label>
                        <label className="field">
                          <span>ETA (model s, optional)</span>
                          <NumericAuthoringInput
                            controlId={`airMission.flightPlans[0].routePoints[${index}].etaSeconds`}
                            ariaLabel={`${point.id} ETA`}
                            value={point.constraint.etaSeconds}
                            authority={numericAuthority(0, 86_400, 3, "s", false, true)}
                            onChange={(value) => updateMissionRoutePoint(index, {
                              constraint: {
                                ...point.constraint,
                                etaSeconds: value ?? undefined,
                              },
                            })}
                            onValidityChange={onAuthoringControlValidity}
                          />
                        </label>
                        <label className="field">
                          <span>TOT (model s, optional)</span>
                          <NumericAuthoringInput
                            controlId={`airMission.flightPlans[0].routePoints[${index}].totalTimeOnTargetSeconds`}
                            ariaLabel={`${point.id} total time on target`}
                            value={point.constraint.totalTimeOnTargetSeconds}
                            authority={numericAuthority(0, 86_400, 3, "s", false, true)}
                            onChange={(value) => updateMissionRoutePoint(index, {
                              constraint: {
                                ...point.constraint,
                                totalTimeOnTargetSeconds: value ?? undefined,
                              },
                            })}
                            onValidityChange={onAuthoringControlValidity}
                          />
                        </label>
                        <label className="field checkbox-field">
                          <span>Constraint lock</span>
                          <input
                            data-control-id={`airMission.flightPlans[0].routePoints[${index}].constraintLocked`}
                            type="checkbox"
                            aria-label={`${point.id} constraint lock`}
                            checked={point.constraint.locked}
                            onChange={(event) => updateMissionRoutePoint(index, {
                              constraint: { ...point.constraint, locked: event.target.checked },
                            })}
                          />
                        </label>
                      </div>
                    </fieldset>
                  ))}
                  {scenario.airMission.flightPlans[0].legs.map((leg, index) => (
                    <label className="field" key={leg.id}>
                      <span>{leg.id} · {leg.fromPointId} → {leg.toPointId}</span>
                      <select
                        data-control-id={`airMission.flightPlans[0].legs[${index}].role`}
                        aria-label={`${leg.id} role`}
                        data-vector-overlay-exempt="ua-native-select"
                        value={leg.role}
                        onChange={(event) => updateMissionLegRole(index, event.target.value as typeof leg.role)}
                      >
                        {(["DEPARTURE", "TRANSIT", "INGRESS", "INTERCEPT_ATTACK", "ON_STATION_PATROL", "REFUEL", "EGRESS", "RECOVERY", "DIVERT"] as const).map((role) => (
                          <option value={role} key={role}>{role.replaceAll("_", " ").toLowerCase()}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <small>
                    TAS {scenario.airMission.flightPlans[0].routePoints[0].constraint.speed.kind === "TAS"
                      ? `${scenario.airMission.flightPlans[0].routePoints[0].constraint.speed.valueMps} m/s`
                      : `Mach ${scenario.airMission.flightPlans[0].routePoints[0].constraint.speed.value}`} · WGS84 / metres MSL
                  </small>
                </div>
              </section>
            )}
            <div className="compact-controls">
              <Range
                controlId="scenario.range"
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
                controlId="scenario.altitude"
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
                  controlId="scenario.cruiseAltitude"
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
                controlId="scenario.targetDelta"
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
                      controlId="scenario.aspect"
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
                    controlId="scenario.temperatureOffset"
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
              controlId="scenario.wind"
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
  const transferOutcomes = result.engineRun.events.state === "AVAILABLE"
    ? result.engineRun.events.items.filter(
        (event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME",
      )
    : [];
  const finalTargetEffect = selectCanonicalTargetEffect(
    result,
    selectDisplayFrame(result, result.timeOfFlight),
  );
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
          <TargetEffectSummary selection={finalTargetEffect} />
        </article>
        <article className="event-log">
          <h2>What happened</h2>
          {finalTargetEffect.eventId && "modelTimeSeconds" in finalTargetEffect.projection && (
            <div data-testid="results-target-effect-event">
              <time>{finalTargetEffect.projection.modelTimeSeconds.toFixed(2)} s</time>
              <i className="target-effect" />
              <span>
                <strong>{finalTargetEffect.presentation.label}</strong>
                <small>{finalTargetEffect.presentation.headline}</small>
              </span>
            </div>
          )}
          {transferOutcomes.map((event) => event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME" && (
            <div key={event.id} data-testid="results-airborne-store-transfer">
              <time>{event.modelTimeSeconds.toFixed(2)} s</time>
              <i className={event.payload.achieved ? "run" : "fault"} />
              <span>
                <strong>{event.payload.operation} {event.payload.achieved ? "achieved" : "rejected"}</strong>
                <small>{event.payload.storeId} · {event.payload.stationId} · {event.payload.limiter} · {event.payload.cause}</small>
              </span>
            </div>
          ))}
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
  controlId,
  label,
  value,
  team,
  onChange,
}: {
  controlId: string;
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
          data-control-id={`${controlId}.decrement`}
          type="button"
          disabled={value <= 0}
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <output>{value}</output>
        <button
          data-control-id={`${controlId}.increment`}
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
  controlId,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  controlId: string;
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
        data-control-id={controlId}
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

const numericAuthority = (
  minimum: number,
  maximum: number,
  precision: number,
  unit: string,
  integer = false,
  nullable = false,
): NumericAuthority => ({
  kind: "NUMBER",
  minimum,
  maximum,
  integer,
  nullable,
  precision,
  unit,
});

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
