"use client";

import { getFrameAt, type SimulationResult } from "@/lib/simulation";
import type { EngineEntityFrame } from "@/lib/engine/contracts";

type EntityMetric = {
  id: string;
  label: string;
  affiliation: EngineEntityFrame["affiliation"];
  kind: EngineEntityFrame["kind"];
  values: number[];
  current: number;
};

const color = (affiliation: EngineEntityFrame["affiliation"]) =>
  affiliation === "BLUE" ? "#2f6fb5" : affiliation === "RED" ? "#a94f45" : "#65717a";

function pathFor(values: number[], minimum: number, maximum: number) {
  const span = Math.max(1e-9, maximum - minimum);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 34 - ((value - minimum) / span) * 30;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}
function MetricPanel({
  title,
  unit,
  series,
  marker,
}: {
  title: string;
  unit: string;
  series: EntityMetric[];
  marker: number;
}) {
  const values = series.flatMap((item) => item.values);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  return (
    <section className="telemetry-panel">
      <header>
        <strong>{title}</strong>
        <span>{unit}</span>
      </header>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-label={`${title} over model time`}>
        <path d="M0 4H100M0 19H100M0 34H100" className="telemetry-grid-line" />
        {series.map((item) => (
          <path
            key={item.id}
            d={pathFor(item.values, minimum, maximum)}
            className={item.kind === "GUIDED_WEAPON" ? "telemetry-series weapon" : "telemetry-series"}
            stroke={color(item.affiliation)}
          />
        ))}
        <path d={`M${marker.toFixed(2)} 2V35`} className="telemetry-time-marker" />
      </svg>
      <div className="telemetry-values">
        {series.map((item) => (
          <span key={item.id}>
            <i className={`telemetry-dot ${item.affiliation.toLowerCase()}`} />
            {item.label}
            <strong>{Number.isFinite(item.current) ? item.current.toFixed(item.current >= 100 ? 0 : 1) : "—"}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

export function TelemetryChart({
  result,
  time,
}: {
  result: SimulationResult;
  time: number;
}) {
  const frame = getFrameAt(result, time);
  const marker = (time / Math.max(1, result.timeOfFlight)) * 100;
  const entitySeries = (
    selector: (entity: EngineEntityFrame) => number,
    include: (entity: EngineEntityFrame) => boolean = () => true,
  ): EntityMetric[] =>
    frame.entities.filter(include).map((entity) => ({
      id: entity.id,
      label: entity.designation,
      affiliation: entity.affiliation,
      kind: entity.kind,
      values: result.frames.map((sample) => {
        const state = sample.entities.find((item) => item.id === entity.id);
        return state ? selector(state) : 0;
      }),
      current: selector(entity),
    }));
  const primaryWeapon = frame.entities.find(
    (entity) => entity.id === result.engineRun.primaryWeaponId,
  );
  const globalMetric = (
    id: string,
    label: string,
    values: number[],
    current: number,
  ): EntityMetric => ({
    id,
    label,
    affiliation: "NEUTRAL",
    kind: "GUIDED_WEAPON",
    values,
    current,
  });

  return (
    <div className="telemetry-multiples">
      <MetricPanel
        title="Altitude"
        unit="m"
        marker={marker}
        series={entitySeries((entity) => entity.position.z, (entity) => entity.lifecycle !== "STOWED")}
      />
      <MetricPanel
        title="True speed"
        unit="m/s"
        marker={marker}
        series={entitySeries((entity) => entity.speedMps, (entity) => entity.lifecycle !== "STOWED")}
      />
      <MetricPanel
        title="Specific mechanical energy"
        unit="kJ/kg"
        marker={marker}
        series={entitySeries((entity) => entity.specificEnergyJkg / 1000, (entity) => entity.lifecycle !== "STOWED")}
      />
      <MetricPanel
        title="Fuel and propellant remaining"
        unit="kg"
        marker={marker}
        series={entitySeries(
          (entity) => entity.fuelKg,
          (entity) => entity.lifecycle !== "STOWED" && entity.fuelKg > 0,
        )}
      />
      <MetricPanel
        title="Separation and closure"
        unit="km / 100 m/s"
        marker={marker}
        series={[
          globalMetric("separation", "Separation", result.frames.map((item) => item.range / 1000), frame.range / 1000),
          globalMetric("closure", "Closure", result.frames.map((item) => item.closureRate / 100), frame.closureRate / 100),
        ]}
      />
      <MetricPanel
        title="Acceleration authority"
        unit="g"
        marker={marker}
        series={primaryWeapon ? [
          globalMetric("commanded-g", "Commanded", result.frames.map((item) => item.commandedG), primaryWeapon.commandedG),
          globalMetric("available-g", "Available", result.frames.map((item) => item.availableG), primaryWeapon.availableG),
        ] : []}
      />
    </div>
  );
}
