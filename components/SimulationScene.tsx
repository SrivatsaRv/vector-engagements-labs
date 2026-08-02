"use client";

import { useEffect, useRef } from "react";
import {
  getFrameAt,
  type ProfileId,
  type RaspTrack,
  type SimulationResult,
  type Vec3,
} from "@/lib/simulation";

type Props = {
  result: SimulationResult;
  time: number;
  profile: ProfileId;
  layers: { interceptor: boolean; target: boolean; lineOfSight: boolean };
  raspTrack?: RaspTrack;
};

export function SimulationScene({
  result,
  time,
  profile,
  layers,
  raspTrack,
}: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: import("three").WebGLRenderer;
    scene: import("three").Scene;
    camera: import("three").PerspectiveCamera;
    interceptor: import("three").Mesh;
    target: import("three").Mesh;
    lineOfSight: import("three").Line;
    interceptorPath: import("three").Line;
    targetPath: import("three").Line;
    uncertainty: import("three").Mesh;
    controls: { dispose: () => void; update: () => void };
    animation: number;
  } | null>(null);

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
      scene.fog = new THREE.Fog(0xf4f6f7, 100000, 260000);
      const camera = new THREE.PerspectiveCamera(
        42,
        width / height,
        10,
        400000,
      );
      camera.position.set(-45000, 36000, 65000);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(width, height);
      mount.current.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(25000, 3000, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;

      const grid = new THREE.GridHelper(180000, 36, 0xaab2b9, 0xd9dde0);
      scene.add(grid);
      const axes = new THREE.AxesHelper(8000);
      scene.add(axes);
      const makeLine = (color: number, opacity = 1) =>
        new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color,
            transparent: opacity < 1,
            opacity,
          }),
        );
      const interceptorPath = makeLine(0x2f6fb5);
      const targetPath = makeLine(0xa64f43);
      const lineOfSight = makeLine(0x7d8790, 0.55);
      scene.add(interceptorPath, targetPath, lineOfSight);
      const interceptor = new THREE.Mesh(
        new THREE.SphereGeometry(430, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0x2f6fb5 }),
      );
      const target = new THREE.Mesh(
        new THREE.BoxGeometry(800, 280, 800),
        new THREE.MeshBasicMaterial({ color: 0xa64f43 }),
      );
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
      scene.add(interceptor, target, uncertainty);

      const resize = () => {
        if (!mount.current) return;
        const nextWidth = mount.current.clientWidth;
        const nextHeight = mount.current.clientHeight;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      };
      window.addEventListener("resize", resize);
      removeResize = () => window.removeEventListener("resize", resize);
      const render = () => {
        controls.update();
        renderer.render(scene, camera);
        if (state.current)
          state.current.animation = requestAnimationFrame(render);
      };
      state.current = {
        renderer,
        scene,
        camera,
        interceptor,
        target,
        lineOfSight,
        interceptorPath,
        targetPath,
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
      current.renderer.dispose();
      current.renderer.domElement.remove();
      state.current = null;
    };
  }, [profile]);

  useEffect(() => {
    import("three").then((THREE) => {
      const current = state.current;
      const frame = getFrameAt(result, time);
      if (!current || !frame) return;
      const point = (position: Vec3) =>
        new THREE.Vector3(position.x, position.z, position.y);
      const interceptorPosition =
        raspTrack?.perspective === "PAF"
          ? raspTrack.position
          : frame.interceptor;
      const targetPosition =
        raspTrack?.perspective === "IAF" ? raspTrack.position : frame.target;
      current.interceptor.position.copy(point(interceptorPosition));
      current.target.position.copy(point(targetPosition));
      current.uncertainty.visible = Boolean(raspTrack);
      if (raspTrack) {
        current.uncertainty.position.copy(point(raspTrack.position));
        current.uncertainty.scale.setScalar(
          Math.max(350, raspTrack.uncertaintyMeters),
        );
      }
      current.interceptor.visible = layers.interceptor;
      current.target.visible = layers.target;
      current.lineOfSight.visible = layers.lineOfSight;
      current.interceptorPath.visible = layers.interceptor;
      current.targetPath.visible = layers.target;
      const visibleFrames = result.frames.filter((item) => item.t <= time);
      current.interceptorPath.geometry.dispose();
      current.interceptorPath.geometry =
        new THREE.BufferGeometry().setFromPoints(
          visibleFrames.map((item) => point(item.interceptor)),
        );
      current.targetPath.geometry.dispose();
      current.targetPath.geometry = new THREE.BufferGeometry().setFromPoints(
        visibleFrames.map((item) => point(item.target)),
      );
      current.lineOfSight.geometry.dispose();
      current.lineOfSight.geometry = new THREE.BufferGeometry().setFromPoints([
        point(interceptorPosition),
        point(targetPosition),
      ]);
    });
  }, [layers, raspTrack, result, time]);

  return (
    <div
      className="simulation-scene"
      ref={mount}
      aria-label="Three-dimensional engagement geometry visualization"
    />
  );
}
