"use client";

import { useEffect, useRef } from "react";
import type { SimulationResult } from "@/lib/simulation";

export function TelemetryChart({ result, time }: { result: SimulationResult; time: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const scale = devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    element.width = width * scale;
    element.height = height * scale;
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#e3e6e8";
    context.lineWidth = 1;
    for (let index = 1; index < 4; index += 1) {
      context.beginPath();
      context.moveTo(0, (height * index) / 4);
      context.lineTo(width, (height * index) / 4);
      context.stroke();
    }
    const draw = (values: number[], color: string, maximum: number) => {
      context.beginPath();
      values.forEach((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - 10 - (value / maximum) * (height - 20);
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.stroke();
    };
    draw(result.frames.map((frame) => frame.speed), "#2f6fb5", 1500);
    draw(result.frames.map((frame) => frame.energy * 12), "#b37824", 1500);
    const markerX = (time / Math.max(1, result.timeOfFlight)) * width;
    context.beginPath();
    context.moveTo(markerX, 0);
    context.lineTo(markerX, height);
    context.strokeStyle = "#26313a";
    context.lineWidth = 1;
    context.stroke();
  }, [result, time]);
  return <canvas ref={canvas} aria-label="Speed and energy telemetry chart" />;
}
