"use client";

import type { SimulationResult } from "@/lib/simulation";
import type {
  EngineEntityDefinition,
  EngineEntityFrame,
} from "@/lib/engine/contracts";
import {
  selectDisplayFrame,
  selectEntityMetricSeries,
  type EntityMetricSeries,
} from "@/lib/frontend/selectors";

const color = (affiliation: EngineEntityFrame["affiliation"]) =>
  affiliation === "BLUE" ? "#2f6fb5" : affiliation === "RED" ? "#a94f45" : "#65717a";

function pathFor(values: Array<number | null>, minimum: number, maximum: number) {
  const span = Math.max(1e-9, maximum - minimum);
  let drawing = false;
  return values.map((value, index) => {
      if (value === null) {
        drawing = false;
        return "";
      }
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 34 - ((value - minimum) / span) * 30;
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .filter(Boolean)
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
  series: EntityMetricSeries[];
  marker: number;
}) {
  const values = series.flatMap((item) => item.values).filter((value): value is number => value !== null);
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
            <strong>{item.current !== null ? item.current.toFixed(item.current >= 100 ? 0 : 1) : "N/A"}</strong>
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
  const selected = selectDisplayFrame(result, time);
  const frame = selected.frame;
  const marker = (selected.displayTimeSeconds / Math.max(1, result.timeOfFlight)) * 100;
  const entitySeries = (
    selector: (entity: EngineEntityFrame) => number,
    include: (entity: EngineEntityDefinition) => boolean = () => true,
  ): EntityMetricSeries[] =>
    selectEntityMetricSeries(result, selected, selector, include);
  const primaryWeapon = frame.entities.find(
    (entity) => entity.id === result.engineRun.primaryWeaponId,
  );
  const globalMetric = (
    id: string,
    label: string,
    values: number[],
    current: number,
  ): EntityMetricSeries => ({
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
          (entity) => entity.lifecycle !== "STOWED" && entity.initial.fuelKg > 0,
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
