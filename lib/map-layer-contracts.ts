import type { EngineEntityFrame } from "./engine/contracts.ts";
import type { SimulationResult, Vec3 } from "./simulation.ts";

export type MapOrigin = { longitude: number; latitude: number };
export type MapInstallationRecord = {
  id: string;
  service: "IAF" | "PAF";
  name: string;
  icao_code?: string | null;
  elevation_ft?: number | null;
  runway_info?: string | null;
  installation_type: string;
  longitude: number;
  latitude: number;
};

export function localToLngLat(
  position: Pick<Vec3, "x" | "y">,
  origin: MapOrigin,
) {
  const latitude = origin.latitude + position.y / 111320;
  const longitude =
    origin.longitude +
    position.x / (111320 * Math.cos((origin.latitude * Math.PI) / 180));
  return [longitude, latitude] as [number, number];
}

export function circlePolygon(
  center: [number, number],
  radiusM: number,
) {
  const [longitude, latitude] = center;
  const points = Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * Math.PI * 2;
    return localToLngLat(
      {
        x: Math.cos(angle) * radiusM,
        y: Math.sin(angle) * radiusM,
      },
      { longitude, latitude },
    );
  });
  return [points];
}

export function buildInstallationFeatures(
  installations: MapInstallationRecord[],
) {
  return installations.map((item) => ({
    type: "Feature" as const,
    properties: {
      id: item.id,
      name: item.name,
      service: item.service,
      installationType: item.installation_type,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [item.longitude, item.latitude],
    },
  }));
}

export function buildDeclaredRouteFeatures(
  result: SimulationResult,
  origin: MapOrigin,
) {
  return result.engineRun.scenario.entities
    .filter((entity) => entity.route && entity.route.length > 1)
    .map((entity) => ({
      type: "Feature" as const,
      properties: {
        entityId: entity.id,
        affiliation: entity.affiliation,
        kind: entity.kind,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: entity.route!.map((point) => localToLngLat(point, origin)),
      },
    }));
}

export function buildLaunchFeatures(
  result: SimulationResult,
  origin: MapOrigin,
) {
  return result.engineRun.scenario.entities
    .filter(
      (entity) => Boolean(entity.weapon) && entity.weapon!.launchTimeSeconds !== null,
    )
    .map((entity) => {
      const launchTime = entity.weapon?.launchTimeSeconds ?? 0;
      const frame = result.frames.reduce((closest, candidate) =>
        Math.abs(candidate.t - launchTime) < Math.abs(closest.t - launchTime)
          ? candidate
          : closest,
      );
      const launched = frame.entities.find((candidate) => candidate.id === entity.id);
      const platform = frame.entities.find(
        (candidate) => candidate.id === entity.weapon?.launchPlatformId,
      );
      return {
        type: "Feature" as const,
        properties: {
          entityId: entity.id,
          label: `${entity.designation} launch`,
          affiliation: entity.affiliation,
          modelTime: launchTime,
        },
        geometry: {
          type: "Point" as const,
          coordinates: localToLngLat(
            launched?.position ?? platform?.position ?? entity.initial.position,
            origin,
          ),
        },
      };
    });
}

export function buildTrackFeatures(
  result: SimulationResult,
  frame: { entities: EngineEntityFrame[] },
  time: number,
  origin: MapOrigin,
  hiddenEntityId?: string,
) {
  return frame.entities
    .filter((entity) => entity.id !== hiddenEntityId)
    .flatMap((entity) => {
      const coordinates = result.frames
        .filter((sample) => sample.t <= time)
        .map((sample) => sample.entities.find((item) => item.id === entity.id))
        .filter((item) => item && item.lifecycle !== "STOWED")
        .map((item) => localToLngLat(item!.position, origin));
      if (coordinates.length < 2) return [];
      return [{
        type: "Feature" as const,
        properties: {
          entityId: entity.id,
          affiliation: entity.affiliation,
          kind: entity.kind,
        },
        geometry: { type: "LineString" as const, coordinates },
      }];
    });
}

export function buildDirectionVectorFeatures(
  frame: { entities: EngineEntityFrame[] },
  origin: MapOrigin,
) {
  return frame.entities
    .filter((entity) => entity.lifecycle !== "STOWED")
    .map((entity) => {
      const lengthSeconds = entity.kind === "GUIDED_WEAPON" ? 5 : 12;
      return {
        type: "Feature" as const,
        properties: {
          entityId: entity.id,
          affiliation: entity.affiliation,
          kind: entity.kind,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            localToLngLat(entity.position, origin),
            localToLngLat(
              {
                x: entity.position.x + entity.velocity.x * lengthSeconds,
                y: entity.position.y + entity.velocity.y * lengthSeconds,
              },
              origin,
            ),
          ],
        },
      };
    });
}

export function buildCoverageFeatures(
  result: SimulationResult,
  frame: { entities: EngineEntityFrame[] },
  origin: MapOrigin,
) {
  return result.envelopes.flatMap((envelope) => {
    if (envelope.radiusM <= 0) return [];
    const owner = frame.entities.find((entity) => entity.id === envelope.entityId);
    if (!owner || owner.lifecycle === "STOWED") return [];
    return [{
      type: "Feature" as const,
      properties: {
        id: envelope.id,
        entityId: envelope.entityId,
        kind: envelope.kind,
        affiliation: envelope.affiliation,
        label: envelope.label,
        minimumAltitudeM: envelope.minimumAltitudeM,
        maximumAltitudeM: envelope.maximumAltitudeM,
        valueState: envelope.valueState,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: circlePolygon(localToLngLat(owner.position, origin), envelope.radiusM),
      },
    }];
  });
}
