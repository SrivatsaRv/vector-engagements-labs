import type { EngineEntityFrame } from "./engine/contracts.ts";
import type { SimulationResult, Vec3 } from "./simulation.ts";
import type { RecordedGeographicPosition, ScenarioOrigin } from "./geospatial/contracts.ts";
import { enginePositionToGeographic } from "./scenario-spatial.ts";

export type MapOrigin = { longitude: number; latitude: number };
export type MapInstallationRecord = {
  id: string;
  service: "IAF" | "PAF";
  name: string;
  icao_code?: string | null;
  elevation_ft?: number | null;
  runway_info?: string | null;
  installation_type: string;
  source_id: string;
  longitude: number;
  latitude: number;
  ground_start_supported?: boolean;
  ground_start_runway_id?: string | null;
};

export function localToLngLat(
  position: Pick<Vec3, "x" | "y">,
  origin: MapOrigin,
) {
  if (position.x === 0 && position.y === 0) {
    return [origin.longitude, origin.latitude] as [number, number];
  }
  const scenarioOrigin: ScenarioOrigin = {
    schemaVersion: "vector.scenario-origin.v1",
    id: "map-adapter-origin",
    frame: "ENU",
    geographic: {
      longitudeDeg: origin.longitude,
      latitudeDeg: origin.latitude,
      altitude: { valueM: 0, datum: "ELLIPSOID" },
    },
    transformVersion: "vector.wgs84-ecef-local.v1",
  };
  const geographic = enginePositionToGeographic(
    {
      x: position.x,
      y: position.y,
      z: (position as Partial<Vec3>).z ?? 0,
    },
    scenarioOrigin,
  );
  return [geographic.longitudeDeg, geographic.latitudeDeg] as [number, number];
}

export function recordedLngLat(
  geographicPositions: RecordedGeographicPosition[] | undefined,
  entityId: string,
  fallbackPosition: Pick<Vec3, "x" | "y">,
  origin: MapOrigin,
) {
  const recorded = geographicPositions?.find((item) => item.entityId === entityId);
  return recorded
    ? [recorded.position.longitudeDeg, recorded.position.latitudeDeg] as [number, number]
    : localToLngLat(fallbackPosition, origin);
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
  points[points.length - 1] = points[0];
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
  const events = result.engineRun.events.state === "AVAILABLE"
    ? result.engineRun.events.items
    : [];
  const governedStoreIds = new Set(events.flatMap((event) =>
    event.payload.kind === "AIRBORNE_STORE_TRANSFER_OUTCOME"
      ? [event.payload.storeId]
      : []
  ));
  const transfers = events.flatMap((event) => {
    if (event.payload.kind !== "AIRBORNE_STORE_TRANSFER_OUTCOME" || !event.payload.achieved) return [];
    const payload = event.payload;
    const frame = result.engineRun.frames[event.frameIndex];
    const store = frame?.entities.find((candidate) => candidate.id === payload.storeId);
    const launcher = frame?.entities.find((candidate) => candidate.id === payload.launcherId);
    if (!frame || !store || !launcher) return [];
    return [{
      type: "Feature" as const,
      properties: {
        entityId: payload.storeId,
        launcherId: payload.launcherId,
        stationId: payload.stationId,
        label: `${store.designation} ${payload.operation === "JETTISON" ? "jettison" : "release"}`,
        affiliation: store.affiliation,
        modelTime: event.modelTimeSeconds,
        operation: payload.operation,
        requested: payload.requested,
        accepted: payload.accepted,
        achieved: payload.achieved,
        limiter: payload.limiter,
        cause: payload.cause,
        transferDigest: payload.transferDigest,
      },
      geometry: {
        type: "Point" as const,
        coordinates: recordedLngLat(
          frame.geographicPositions,
          store.id,
          store.position,
          origin,
        ),
      },
    }];
  });
  const legacy = result.engineRun.scenario.entities
    .filter(
      (entity) => Boolean(entity.weapon) && entity.weapon!.launchTimeSeconds !== null &&
        !governedStoreIds.has(entity.id),
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
          coordinates: recordedLngLat(
            frame.geographicPositions,
            launched?.id ?? platform?.id ?? entity.id,
            launched?.position ?? platform?.position ?? entity.initial.position,
            origin,
          ),
        },
      };
    });
  return [...transfers, ...legacy];
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
        .flatMap((sample) => {
          const item = sample.entities.find((candidate) => candidate.id === entity.id);
          if (!item || item.lifecycle === "STOWED") return [];
          return [recordedLngLat(
            sample.geographicPositions,
            item.id,
            item.position,
            origin,
          )];
        });
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
  frame: { entities: EngineEntityFrame[]; geographicPositions?: RecordedGeographicPosition[] },
  origin: MapOrigin,
  hiddenEntityId?: string,
) {
  return frame.entities
    .filter((entity) => entity.lifecycle !== "STOWED" && entity.id !== hiddenEntityId)
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
            recordedLngLat(frame.geographicPositions, entity.id, entity.position, origin),
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
  frame: { entities: EngineEntityFrame[]; geographicPositions?: RecordedGeographicPosition[] },
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
        basis: envelope.basis,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: circlePolygon(
          recordedLngLat(frame.geographicPositions, owner.id, owner.position, origin),
          envelope.radiusM,
        ),
      },
    }];
  });
}
