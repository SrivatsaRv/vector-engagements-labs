"use client";

import { useEffect, useRef } from "react";
import {
  getFrameAt,
  type ProfileId,
  type RaspTrack,
  type SimulationResult,
} from "@/lib/simulation";
import type { EngineEntityFrame } from "@/lib/engine/contracts";
import { cameraRelativeThreePosition } from "@/lib/geospatial/geodesy";

type Props = {
  result: SimulationResult;
  time: number;
  profile: ProfileId;
  layers: { interceptor: boolean; target: boolean; lineOfSight: boolean };
  raspTrack?: RaspTrack;
  layoutRevision?: number;
};

type ThreeState = {
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  symbols: Map<string, import("three").Sprite>;
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

export function SimulationScene({ result, time, layers, raspTrack, layoutRevision = 0 }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const state = useRef<ThreeState | null>(null);

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
        if (state.current) state.current.animation = requestAnimationFrame(render);
      };
      state.current = {
        renderer,
        scene,
        camera,
        symbols: new Map(),
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
    import("three").then((THREE) => {
      const current = state.current;
      const frame = getFrameAt(result, time);
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
          });
          symbol = new THREE.Sprite(material);
          const scale = entity.kind === "GUIDED_WEAPON" ? 1750 : 2600;
          symbol.scale.set(scale, scale, 1);
          if (entity.lifecycle === "STOWED") symbol.center.set(1.15, 0.5);
          symbol.renderOrder = 10;
          current.symbols.set(entity.id, symbol);
          current.scene.add(symbol);

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

        let position = entity.position;
        if (raspTrack && entity.id === raspTrack.observedEntityId && raspTrack.visible) {
          position = raspTrack.position;
        }
        symbol.position.copy(point(position));
        const isWeapon = entity.id === result.engineRun.primaryWeaponId;
        const isTarget = entity.id === result.engineRun.primaryTargetId;
        symbol.visible =
          (isWeapon ? layers.interceptor : isTarget ? layers.target : true) &&
          !(raspTrack?.observedEntityId === entity.id && !raspTrack.visible);

        const path = current.paths.get(entity.id)!;
        const points = result.frames
          .filter((sample) => sample.t <= time)
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
      current.uncertainty.visible = Boolean(raspTrack?.visible);
      if (raspTrack?.visible) {
        current.uncertainty.position.copy(point(raspTrack.position));
        current.uncertainty.scale.setScalar(Math.max(350, raspTrack.uncertaintyMeters));
      }
    });
  }, [layers, raspTrack, result, time]);

  return (
    <div
      className="simulation-scene"
      ref={mount}
      aria-label="Three-dimensional engagement geometry with tactical entity symbols"
    />
  );
}
