"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ProfileId,
  type RaspTrack,
  type Scenario,
  type SimulationResult,
} from "@/lib/simulation";
import type { EngineEntityFrame } from "@/lib/engine/contracts";
import { TargetEffectSummary } from "@/components/TargetEffectSummary";
import { cameraRelativeThreePosition } from "@/lib/geospatial/geodesy";
import {
  selectObserverEntityPresentation,
  selectCanonicalTargetEffect,
  type SelectedDisplayFrame,
} from "@/lib/frontend/selectors";
import {
  selectAuthoredProfilePresentation,
  type AuthoredProfilePresentation,
} from "@/lib/frontend/authored-profile-presentation";
import type { AuthoredRouteProfile } from "@/lib/scenarios";
import type { AuthoredProfileBinding } from "@/lib/report-profile";
import {
  applyTacticalLabelCollisionPolicy,
  presentTacticalSymbol,
  tacticalSymbolAccessibleName,
  type TacticalLabelScreenAnchor,
  type TacticalSymbol,
} from "@/lib/tactical-symbol-contract";

type Props = {
  result: SimulationResult;
  selected: SelectedDisplayFrame;
  profile: ProfileId;
  layers: { interceptor: boolean; target: boolean; lineOfSight: boolean };
  raspTrack?: RaspTrack;
  authoredProfile?: AuthoredRouteProfile;
  authoredProfileBinding?: AuthoredProfileBinding;
  authoredScenario?: Scenario;
  layoutRevision?: number;
  targetEffectOverlay?: boolean;
};

type ThreeState = {
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  symbols: Map<string, import("three").Sprite>;
  labels: Map<string, HTMLSpanElement>;
  presentations: Map<string, TacticalSymbol>;
  declaredRoutes: Map<string, import("three").Line>;
  activeRouteLegs: Map<string, import("three").Line>;
  paths: Map<string, import("three").Line>;
  groundPaths: Map<string, import("three").Line>;
  altitudeCurtains: Map<string, import("three").Mesh>;
  altitudeStems: Map<string, import("three").Line>;
  groundMarkers: Map<string, import("three").Mesh>;
  lineOfSight: import("three").Line;
  uncertainty: import("three").Mesh;
  controls: { dispose: () => void; update: () => void };
  animation: number;
};

const LABEL_EDGE_PADDING_PX = 6;
const FULL_LABEL_WIDTH_PX = 150;
const COMPACT_LABEL_WIDTH_PX = 116;
const LABEL_HEIGHT_PX = 20;

function currentAuthoredLegIntent(
  applicability: AuthoredProfilePresentation,
  entity: EngineEntityFrame,
) {
  if (
    applicability.state !== "MATCHED" ||
    entity.kind !== "AIRCRAFT" ||
    (entity.affiliation !== "BLUE" && entity.affiliation !== "RED") ||
    entity.aircraftControl?.routePointIndex == null
  ) return null;
  const legIndex = Math.max(0, entity.aircraftControl.routePointIndex - 1);
  const legs = entity.affiliation === "BLUE"
    ? applicability.profile?.blue.legs
    : applicability.profile?.red.legs;
  return legs?.[legIndex] ?? null;
}

function labelPosition(
  anchor: TacticalLabelScreenAnchor,
  visibility: "VISIBLE" | "COMPACT",
  bounds: DOMRect,
) {
  const width = visibility === "VISIBLE" ? FULL_LABEL_WIDTH_PX : COMPACT_LABEL_WIDTH_PX;
  const preferredLeft = visibility === "VISIBLE"
    ? anchor.x - width / 2
    : anchor.x + 14;
  const preferredTop = visibility === "VISIBLE" ? anchor.y + 18 : anchor.y - 46;
  const maximumLeft = Math.max(LABEL_EDGE_PADDING_PX, bounds.width - width - LABEL_EDGE_PADDING_PX);
  const maximumTop = Math.max(LABEL_EDGE_PADDING_PX, bounds.height - LABEL_HEIGHT_PX - LABEL_EDGE_PADDING_PX);
  const left = Math.min(Math.max(preferredLeft, LABEL_EDGE_PADDING_PX), maximumLeft);
  const top = Math.min(Math.max(preferredTop, LABEL_EDGE_PADDING_PX), maximumTop);
  return {
    left,
    top,
    edgeState: left === preferredLeft && top === preferredTop ? "CLEAR" : "CLAMPED",
  } as const;
}

const affiliationColor = (affiliation: EngineEntityFrame["affiliation"]) =>
  affiliation === "BLUE" ? "#2f6fb5" : affiliation === "RED" ? "#a94f45" : "#606b73";

function drawFrame(
  context: CanvasRenderingContext2D,
  entity: EngineEntityFrame,
) {
  const color = affiliationColor(entity.affiliation);
  context.clearRect(0, 0, 128, 128);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 6;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (entity.lifecycle === "STOWED") context.setLineDash([10, 7]);
  context.beginPath();
  if (entity.affiliation === "RED") {
    context.moveTo(64, 5);
    context.lineTo(123, 64);
    context.lineTo(64, 123);
    context.lineTo(5, 64);
    context.closePath();
  } else if (entity.affiliation === "NEUTRAL") {
    context.rect(8, 8, 112, 112);
  } else {
    context.arc(64, 64, 57, 0, Math.PI * 2);
  }
  context.stroke();
  context.setLineDash([]);

  context.save();
  context.translate(64, 64);
  context.beginPath();
  if (entity.kind === "AIRCRAFT") {
    context.moveTo(0, -34);
    context.lineTo(8, -8);
    context.lineTo(35, 5);
    context.lineTo(35, 14);
    context.lineTo(8, 8);
    context.lineTo(5, 28);
    context.lineTo(15, 36);
    context.lineTo(0, 31);
    context.lineTo(-15, 36);
    context.lineTo(-5, 28);
    context.lineTo(-8, 8);
    context.lineTo(-35, 14);
    context.lineTo(-35, 5);
    context.lineTo(-8, -8);
    context.closePath();
    context.fill();
  } else if (entity.kind === "GUIDED_WEAPON") {
    context.moveTo(-26, 24);
    context.lineTo(22, -24);
    context.lineTo(34, -28);
    context.lineTo(30, -16);
    context.lineTo(-18, 30);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(-7, 5);
    context.lineTo(15, 27);
    context.moveTo(-16, 14);
    context.lineTo(-18, -10);
    context.stroke();
  } else if (entity.kind === "RADAR") {
    context.arc(0, 5, 26, Math.PI, Math.PI * 1.5);
    context.stroke();
    context.beginPath();
    context.moveTo(-18, 18);
    context.lineTo(20, -20);
    context.lineTo(14, 14);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(0, 17);
    context.lineTo(0, 31);
    context.moveTo(-14, 31);
    context.lineTo(14, 31);
    context.stroke();
  } else if (
    entity.kind === "AIR_DEFENCE_SYSTEM" ||
    entity.kind === "SURFACE_LAUNCHER"
  ) {
    context.rect(-29, 17, 58, 15);
    context.moveTo(-18, 13);
    context.lineTo(14, -20);
    context.moveTo(-2, 13);
    context.lineTo(30, -19);
    context.stroke();
  } else if (entity.kind === "BASE") {
    context.moveTo(-12, -31);
    context.lineTo(12, 31);
    context.moveTo(-23, -18);
    context.lineTo(4, -27);
    context.moveTo(-7, 24);
    context.lineTo(21, 15);
    context.stroke();
  } else {
    context.rect(-21, -21, 42, 42);
    context.moveTo(0, -32);
    context.lineTo(0, 32);
    context.moveTo(-32, 0);
    context.lineTo(32, 0);
    context.stroke();
  }
  context.restore();
}

export function SimulationScene({
  result,
  selected,
  layers,
  raspTrack,
  authoredProfile,
  authoredProfileBinding,
  authoredScenario,
  layoutRevision = 0,
  targetEffectOverlay = false,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const state = useRef<ThreeState | null>(null);
  const [threeReadyRevision, setThreeReadyRevision] = useState(0);
  const targetEffect = selectCanonicalTargetEffect(result, selected);
  const profileApplicability = useMemo(
    () => selectAuthoredProfilePresentation(
      result,
      authoredProfile && authoredProfileBinding && authoredScenario
        ? {
            profile: authoredProfile,
            binding: authoredProfileBinding,
            currentScenario: authoredScenario,
          }
        : undefined,
    ),
    [authoredProfile, authoredProfileBinding, authoredScenario, result],
  );
  const declaredRouteCount = result.engineRun.scenario.entities.filter(
    (entity) => (entity.route?.length ?? 0) > 1,
  ).length;
  const activeRouteLegCount = selected.frame?.entities.filter(
    (entity) => entity.aircraftControl?.routePointIndex != null,
  ).length ?? 0;
  const achievedTrailCount = selected.frame.entities.filter((entity) =>
    result.frames.filter((frame) =>
      frame.t <= selected.displayTimeSeconds &&
      frame.entities.some((candidate) =>
        candidate.id === entity.id && candidate.lifecycle !== "STOWED")
    ).length > 1
  ).length;
  const altitudeStemCount = selected.frame.entities.filter(
    (entity) => entity.lifecycle !== "STOWED" && entity.position.z > 25,
  ).length;
  const launchedStoreCount = selected.frame.entities.filter(
    (entity) => entity.kind === "GUIDED_WEAPON" && entity.lifecycle !== "STOWED",
  ).length;

  useEffect(() => {
    if (!mount.current) return;
    let disposed = false;
    let removeResize: (() => void) | undefined;

    Promise.all([
      import("three"),
      import("three/examples/jsm/controls/OrbitControls.js"),
    ]).then(([THREE, { OrbitControls }]) => {
      if (disposed || !mount.current) return;
      const width = mount.current.clientWidth;
      const height = mount.current.clientHeight;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf4f6f7);
      scene.fog = new THREE.Fog(0xf4f6f7, 100000, 300000);
      const camera = new THREE.PerspectiveCamera(42, width / height, 10, 500000);
      camera.position.set(-45000, 36000, 65000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(width, height);
      mount.current.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(25000, 3000, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;

      scene.add(new THREE.GridHelper(220000, 44, 0xaab2b9, 0xd9dde0));
      const lineOfSight = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: 0x7d8790, transparent: true, opacity: 0.55 }),
      );
      scene.add(lineOfSight);
      const uncertainty = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xc8842c,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
        }),
      );
      uncertainty.rotation.x = -Math.PI / 2;
      uncertainty.visible = false;
      scene.add(uncertainty);

      const resize = () => {
        if (!mount.current) return;
        const nextWidth = mount.current.clientWidth;
        const nextHeight = mount.current.clientHeight;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount.current);
      window.addEventListener("resize", resize);
      removeResize = () => {
        resizeObserver.disconnect();
        window.removeEventListener("resize", resize);
      };
      const render = () => {
        controls.update();
        renderer.render(scene, camera);
        const bounds = renderer.domElement.getBoundingClientRect();
        const currentState = state.current;
        const anchors: TacticalLabelScreenAnchor[] = [];
        for (const [id, label] of currentState?.labels ?? []) {
          const symbol = currentState?.symbols.get(id);
          if (!symbol?.visible || bounds.width === 0 || bounds.height === 0) {
            label.hidden = true;
            label.dataset.labelVisibility = "HIDDEN";
            label.dataset.collisionState = "OFFSCREEN";
            continue;
          }
          const projected = symbol.position.clone().project(camera);
          const outsideClip = projected.z < -1 || projected.z > 1;
          label.hidden = outsideClip;
          if (outsideClip) {
            label.dataset.labelVisibility = "HIDDEN";
            label.dataset.collisionState = "OFFSCREEN";
            continue;
          }
          const x = (projected.x * 0.5 + 0.5) * bounds.width;
          const y = (-projected.y * 0.5 + 0.5) * bounds.height;
          anchors.push({ id, x, y });
        }
        const presentations = applyTacticalLabelCollisionPolicy(
          [...(currentState?.presentations.values() ?? [])],
          anchors,
        );
        let visibleLabelCount = 0;
        let hiddenLabelCount = 0;
        for (const presentation of presentations) {
          const label = currentState?.labels.get(presentation.id);
          const anchor = anchors.find((candidate) => candidate.id === presentation.id);
          const visibility = presentation.label.visibility;
          if (!label || !anchor || visibility === "HIDDEN") {
            if (label) {
              label.hidden = true;
              label.dataset.labelVisibility = "HIDDEN";
              label.dataset.collisionState = anchor ? "HIDDEN" : "OFFSCREEN";
            }
            hiddenLabelCount += 1;
            continue;
          }
          const placement = labelPosition(anchor, visibility, bounds);
          label.hidden = false;
          label.dataset.labelVisibility = visibility;
          label.dataset.collisionState = "CLEAR";
          label.dataset.edgeState = placement.edgeState;
          label.classList.toggle("is-compact", visibility === "COMPACT");
          label.style.transform = `translate3d(${placement.left}px, ${placement.top}px, 0)`;
          visibleLabelCount += 1;
        }
        if (mount.current) {
          mount.current.dataset.visibleLabelCount = String(visibleLabelCount);
          mount.current.dataset.hiddenLabelCount = String(hiddenLabelCount);
        }
        if (currentState) currentState.animation = requestAnimationFrame(render);
      };
      state.current = {
        renderer,
        scene,
        camera,
        symbols: new Map(),
        labels: new Map(),
        presentations: new Map(),
        declaredRoutes: new Map(),
        activeRouteLegs: new Map(),
        paths: new Map(),
        groundPaths: new Map(),
        altitudeCurtains: new Map(),
        altitudeStems: new Map(),
        groundMarkers: new Map(),
        lineOfSight,
        uncertainty,
        controls,
        animation: 0,
      };
      setThreeReadyRevision((value) => value + 1);
      render();
    });

    return () => {
      disposed = true;
      removeResize?.();
      const current = state.current;
      if (!current) return;
      cancelAnimationFrame(current.animation);
      current.controls.dispose();
      current.scene.traverse((object) => {
        if ("geometry" in object) (object.geometry as import("three").BufferGeometry).dispose?.();
        if ("material" in object) {
          const material = object.material as import("three").Material & { map?: import("three").Texture };
          material.map?.dispose();
          material.dispose?.();
        }
      });
      current.renderer.dispose();
      for (const label of current.labels.values()) label.remove();
      current.renderer.domElement.remove();
      state.current = null;
    };
  }, []);

  useEffect(() => {
    const current = state.current;
    const mountElement = mount.current;
    if (!current || !mountElement) return;
    const frame = requestAnimationFrame(() => {
      const width = mountElement.clientWidth;
      const height = mountElement.clientHeight;
      if (!width || !height) return;
      current.camera.aspect = width / height;
      current.camera.updateProjectionMatrix();
      current.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      current.renderer.setSize(width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutRevision]);

  useEffect(() => {
    let cancelled = false;
    void import("three").then((THREE) => {
      const current = state.current;
      if (cancelled || !current) return;
      const point = (position: EngineEntityFrame["position"]) => {
        const [x, y, z] = cameraRelativeThreePosition(position);
        return new THREE.Vector3(x, y, z);
      };
      const scenarioEntities = result.engineRun.scenario.entities;

      for (const [entityId, declaredRoute] of [...current.declaredRoutes]) {
        const definition = scenarioEntities.find((candidate) => candidate.id === entityId);
        if (definition?.route && definition.route.length > 1) {
          declaredRoute.geometry.dispose();
          declaredRoute.geometry = new THREE.BufferGeometry().setFromPoints(
            definition.route.map(point),
          );
          declaredRoute.computeLineDistances();
          continue;
        }

        current.scene.remove(declaredRoute);
        declaredRoute.geometry.dispose();
        const routeMaterials = Array.isArray(declaredRoute.material)
          ? declaredRoute.material
          : [declaredRoute.material];
        for (const material of routeMaterials) material.dispose();
        current.declaredRoutes.delete(entityId);

        const activeRouteLeg = current.activeRouteLegs.get(entityId);
        if (activeRouteLeg) {
          current.scene.remove(activeRouteLeg);
          activeRouteLeg.geometry.dispose();
          const legMaterials = Array.isArray(activeRouteLeg.material)
            ? activeRouteLeg.material
            : [activeRouteLeg.material];
          for (const material of legMaterials) material.dispose();
          current.activeRouteLegs.delete(entityId);
        }
      }

      for (const definition of scenarioEntities) {
        if (
          !definition.route ||
          definition.route.length < 2 ||
          !current.symbols.has(definition.id) ||
          current.declaredRoutes.has(definition.id)
        ) continue;
        const declaredRoute = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(definition.route.map(point)),
          new THREE.LineDashedMaterial({
            color: affiliationColor(definition.affiliation),
            transparent: true,
            opacity: 0.34,
            dashSize: 1_300,
            gapSize: 850,
          }),
        );
        declaredRoute.computeLineDistances();
        declaredRoute.renderOrder = 2;
        current.declaredRoutes.set(definition.id, declaredRoute);
        current.scene.add(declaredRoute);

        const activeRouteLeg = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: affiliationColor(definition.affiliation),
            transparent: true,
            opacity: 0.88,
          }),
        );
        activeRouteLeg.renderOrder = 3;
        current.activeRouteLegs.set(definition.id, activeRouteLeg);
        current.scene.add(activeRouteLeg);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [result.engineRun.scenario, threeReadyRevision]);

  useEffect(() => {
    import("three").then((THREE) => {
      const current = state.current;
      const frame = selected.frame;
      if (!current || !frame) return;
      const point = (position: EngineEntityFrame["position"]) => {
        const [x, y, z] = cameraRelativeThreePosition(position);
        return new THREE.Vector3(x, y, z);
      };

      for (const entity of frame.entities.filter((item) => item.lifecycle !== "STOWED")) {
        let symbol = current.symbols.get(entity.id);
        if (!symbol) {
          const canvas = document.createElement("canvas");
          canvas.width = 128;
          canvas.height = 128;
          const context = canvas.getContext("2d");
          if (!context) continue;
          drawFrame(context, entity);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            opacity: entity.lifecycle === "TERMINATED" ? 0.48 : 1,
          });
          symbol = new THREE.Sprite(material);
          const scale = entity.kind === "GUIDED_WEAPON" ? 1750 : 2600;
          symbol.scale.set(scale, scale, 1);
          if (entity.lifecycle === "STOWED") symbol.center.set(1.15, 0.5);
          symbol.userData.lifecycle = entity.lifecycle;
          symbol.renderOrder = 10;
          current.symbols.set(entity.id, symbol);
          current.scene.add(symbol);

          const label = document.createElement("span");
          label.className = `simulation-entity-label is-${entity.affiliation.toLowerCase()}`;
          label.dataset.entityId = entity.id;
          label.dataset.affiliation = entity.affiliation;
          label.dataset.entityKind = entity.kind;
          label.dataset.collisionState = "OFFSCREEN";
          label.dataset.edgeState = "CLEAR";
          label.setAttribute("role", "img");
          mount.current?.appendChild(label);
          current.labels.set(entity.id, label);

          const definition = result.engineRun.scenario.entities.find(
            (candidate) => candidate.id === entity.id,
          );
          if (definition?.route && definition.route.length > 1) {
            const declaredRoute = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(definition.route.map(point)),
              new THREE.LineDashedMaterial({
                color: affiliationColor(entity.affiliation),
                transparent: true,
                opacity: 0.34,
                dashSize: 1_300,
                gapSize: 850,
              }),
            );
            declaredRoute.computeLineDistances();
            declaredRoute.renderOrder = 2;
            current.declaredRoutes.set(entity.id, declaredRoute);
            current.scene.add(declaredRoute);

            const activeRouteLeg = new THREE.Line(
              new THREE.BufferGeometry(),
              new THREE.LineBasicMaterial({
                color: affiliationColor(entity.affiliation),
                transparent: true,
                opacity: 0.88,
              }),
            );
            activeRouteLeg.renderOrder = 3;
            current.activeRouteLegs.set(entity.id, activeRouteLeg);
            current.scene.add(activeRouteLeg);
          }

          const path = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
              color: affiliationColor(entity.affiliation),
              transparent: true,
              opacity: entity.kind === "GUIDED_WEAPON" ? 0.95 : 0.55,
            }),
          );
          current.paths.set(entity.id, path);
          current.scene.add(path);

          const groundPath = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({
              color: affiliationColor(entity.affiliation),
              transparent: true,
              opacity: 0.28,
              dashSize: 900,
              gapSize: 650,
            }),
          );
          current.groundPaths.set(entity.id, groundPath);
          current.scene.add(groundPath);

          const altitudeCurtain = new THREE.Mesh(
            new THREE.BufferGeometry(),
            new THREE.MeshBasicMaterial({
              color: affiliationColor(entity.affiliation),
              transparent: true,
              opacity: entity.kind === "GUIDED_WEAPON" ? 0.1 : 0.065,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          altitudeCurtain.renderOrder = 1;
          current.altitudeCurtains.set(entity.id, altitudeCurtain);
          current.scene.add(altitudeCurtain);

          const altitudeStem = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({
              color: affiliationColor(entity.affiliation),
              transparent: true,
              opacity: 0.52,
              dashSize: 600,
              gapSize: 360,
            }),
          );
          current.altitudeStems.set(entity.id, altitudeStem);
          current.scene.add(altitudeStem);

          const groundMarker = new THREE.Mesh(
            new THREE.CircleGeometry(entity.kind === "GUIDED_WEAPON" ? 420 : 650, 28),
            new THREE.MeshBasicMaterial({
              color: affiliationColor(entity.affiliation),
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          groundMarker.rotation.x = -Math.PI / 2;
          current.groundMarkers.set(entity.id, groundMarker);
          current.scene.add(groundMarker);
        }

        if (symbol.userData.lifecycle !== entity.lifecycle) {
          const material = symbol.material as import("three").SpriteMaterial;
          const canvas = material.map?.image;
          if (canvas instanceof HTMLCanvasElement) {
            const context = canvas.getContext("2d");
            if (context) {
              drawFrame(context, entity);
              material.map!.needsUpdate = true;
            }
          }
          material.opacity = entity.lifecycle === "TERMINATED" ? 0.48 : 1;
          symbol.userData.lifecycle = entity.lifecycle;
        }

        const observerPresentation = selectObserverEntityPresentation(raspTrack, entity.id);
        if (observerPresentation.state === "HIDDEN") {
          symbol.visible = false;
          current.presentations.delete(entity.id);
          const label = current.labels.get(entity.id);
          if (label) label.hidden = true;
          const declaredRoute = current.declaredRoutes.get(entity.id);
          if (declaredRoute) declaredRoute.visible = false;
          const activeRouteLeg = current.activeRouteLegs.get(entity.id);
          if (activeRouteLeg) activeRouteLeg.visible = false;
          current.paths.get(entity.id)!.visible = false;
          current.groundPaths.get(entity.id)!.visible = false;
          current.altitudeCurtains.get(entity.id)!.visible = false;
          current.altitudeStems.get(entity.id)!.visible = false;
          current.groundMarkers.get(entity.id)!.visible = false;
          continue;
        }
        const position = entity.position;
        symbol.position.copy(point(position));
        const isWeapon = entity.id === result.engineRun.primaryWeaponId;
        const isTarget = entity.id === result.engineRun.primaryTargetId;
        symbol.visible =
          isWeapon ? layers.interceptor : isTarget ? layers.target : true;
        const label = current.labels.get(entity.id);
        if (label) {
          const presentation = presentTacticalSymbol({
            id: entity.id,
            designation: entity.designation,
            kind: entity.kind,
            affiliation: entity.affiliation,
            lifecycle: entity.lifecycle,
            symbolRole: entity.symbolRole,
            headingRad: entity.headingRad,
            headingRequired: true,
            valueState: "WORLD",
          });
          current.presentations.set(entity.id, presentation);
          const authoredIntent = currentAuthoredLegIntent(profileApplicability, entity);
          label.textContent = `${presentation.label.text} · ${Math.round(entity.position.z)} m${authoredIntent ? ` · ${authoredIntent} — authored intent; no autonomous selection` : ""}`;
          label.setAttribute(
            "aria-label",
            `${tacticalSymbolAccessibleName(presentation)}, altitude ${Math.round(entity.position.z)} metres${authoredIntent ? `, ${authoredIntent.toLowerCase()} authored intent; no autonomous selection` : ""}`,
          );
          label.dataset.lifecycle = entity.lifecycle;
          label.dataset.authoredIntent = authoredIntent ?? "UNAVAILABLE";
          label.dataset.profileApplicability = profileApplicability.state;
          label.classList.toggle("is-terminated", entity.lifecycle === "TERMINATED");
          label.classList.toggle("is-weapon", entity.kind === "GUIDED_WEAPON");
          label.hidden = !symbol.visible;
        }
        const definition = result.engineRun.scenario.entities.find(
          (candidate) => candidate.id === entity.id,
        );
        const declaredRoute = current.declaredRoutes.get(entity.id);
        const activeRouteLeg = current.activeRouteLegs.get(entity.id);
        if (declaredRoute) declaredRoute.visible = symbol.visible;
        if (
          activeRouteLeg &&
          definition?.route &&
          entity.aircraftControl?.routePointIndex != null
        ) {
          const toIndex = entity.aircraftControl.routePointIndex;
          const fromIndex = Math.max(0, toIndex - 1);
          const from = definition.route[fromIndex];
          const to = definition.route[toIndex];
          activeRouteLeg.geometry.dispose();
          activeRouteLeg.geometry = new THREE.BufferGeometry().setFromPoints(
            from && to ? [point(from), point(to)] : [],
          );
          activeRouteLeg.visible = symbol.visible && Boolean(from && to && fromIndex !== toIndex);
        } else if (activeRouteLeg) {
          activeRouteLeg.visible = false;
        }

        const path = current.paths.get(entity.id)!;
        const points = result.frames
          .filter((sample) => sample.t <= selected.displayTimeSeconds)
          .map((sample) => sample.entities.find((item) => item.id === entity.id))
          .filter((item): item is EngineEntityFrame => Boolean(item))
          .filter((item) => item.lifecycle !== "STOWED")
          .map((item) => point(item.position));
        path.geometry.dispose();
        path.geometry = new THREE.BufferGeometry().setFromPoints(points);
        path.visible = symbol.visible && points.length > 1;

        const groundPoints = points.map((sample) => new THREE.Vector3(sample.x, 12, sample.z));
        const groundPath = current.groundPaths.get(entity.id)!;
        groundPath.geometry.dispose();
        groundPath.geometry = new THREE.BufferGeometry().setFromPoints(groundPoints);
        groundPath.computeLineDistances();
        groundPath.visible = symbol.visible && groundPoints.length > 1;

        const curtainPositions: number[] = [];
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const next = points[index];
          curtainPositions.push(
            previous.x, 10, previous.z,
            previous.x, previous.y, previous.z,
            next.x, next.y, next.z,
            previous.x, 10, previous.z,
            next.x, next.y, next.z,
            next.x, 10, next.z,
          );
        }
        const curtain = current.altitudeCurtains.get(entity.id)!;
        curtain.geometry.dispose();
        curtain.geometry = new THREE.BufferGeometry();
        curtain.geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(curtainPositions, 3),
        );
        curtain.visible = symbol.visible && curtainPositions.length > 0;

        const displayed = point(position);
        const altitudeStem = current.altitudeStems.get(entity.id)!;
        altitudeStem.geometry.dispose();
        altitudeStem.geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(displayed.x, 10, displayed.z),
          displayed,
        ]);
        altitudeStem.computeLineDistances();
        altitudeStem.visible = symbol.visible && position.z > 25;

        const groundMarker = current.groundMarkers.get(entity.id)!;
        groundMarker.position.set(displayed.x, 14, displayed.z);
        groundMarker.visible = symbol.visible && position.z > 25;
      }

      for (const [id, symbol] of current.symbols) {
        if (!frame.entities.some((entity) => entity.id === id && entity.lifecycle !== "STOWED")) {
          symbol.visible = false;
          current.presentations.delete(id);
          const label = current.labels.get(id);
          if (label) label.hidden = true;
          const declaredRoute = current.declaredRoutes.get(id);
          if (declaredRoute) declaredRoute.visible = false;
          const activeRouteLeg = current.activeRouteLegs.get(id);
          if (activeRouteLeg) activeRouteLeg.visible = false;
          current.paths.get(id)!.visible = false;
          current.groundPaths.get(id)!.visible = false;
          current.altitudeCurtains.get(id)!.visible = false;
          current.altitudeStems.get(id)!.visible = false;
          current.groundMarkers.get(id)!.visible = false;
        }
      }

      const primaryWeapon = frame.entities.find(
        (entity) => entity.id === result.engineRun.primaryWeaponId,
      );
      const primaryTarget = frame.entities.find(
        (entity) => entity.id === result.engineRun.primaryTargetId,
      );
      if (primaryWeapon && primaryTarget && primaryWeapon.lifecycle !== "STOWED") {
        current.lineOfSight.geometry.dispose();
        current.lineOfSight.geometry = new THREE.BufferGeometry().setFromPoints([
          point(primaryWeapon.position),
          point(primaryTarget.position),
        ]);
      }
      current.lineOfSight.visible = layers.lineOfSight && Boolean(primaryWeapon && primaryTarget);
      current.uncertainty.visible = false;
    });
  }, [layers, profileApplicability, raspTrack, result, selected, threeReadyRevision]);

  return (
    <>
      <div
        className="simulation-scene"
        ref={mount}
        aria-label="Three-dimensional engagement geometry with tactical entity symbols"
        data-display-frame-index={selected.frameIndex}
        data-display-time={selected.displayTimeSeconds}
        data-effect-state={targetEffect.presentation.state}
        data-effect-class={targetEffect.presentation.effectClass ?? "NONE"}
        data-effect-event-id={targetEffect.eventId ?? "UNAVAILABLE"}
        data-declared-route-count={declaredRouteCount}
        data-active-route-leg-count={activeRouteLegCount}
        data-achieved-trail-count={achievedTrailCount}
        data-altitude-stem-count={altitudeStemCount}
        data-launched-store-count={launchedStoreCount}
        data-label-policy="TACTICAL_LABEL_POLICY_V1"
        data-authored-profile-applicability={profileApplicability.state}
        data-authored-profile-applicability-reason={profileApplicability.reason}
      />
      {targetEffectOverlay && (
        <div className="simulation-target-effect-overlay">
          <TargetEffectSummary selection={targetEffect} compact />
        </div>
      )}
    </>
  );
}
