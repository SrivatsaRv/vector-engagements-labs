import type { Vec3 } from "./primitives.ts";

export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const subtract = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const scale = (value: Vec3, factor: number): Vec3 => ({
  x: value.x * factor,
  y: value.y * factor,
  z: value.z * factor,
});
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const magnitude = (value: Vec3) => Math.hypot(value.x, value.y, value.z);
export const normalize = (value: Vec3): Vec3 => {
  const length = magnitude(value);
  return length > 1e-9 ? scale(value, 1 / length) : { x: 1, y: 0, z: 0 };
};
export const clampMagnitude = (value: Vec3, maximum: number): Vec3 => {
  const length = magnitude(value);
  return length > maximum ? scale(value, maximum / length) : value;
};
