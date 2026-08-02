import type { SimulationResult, Vec3 } from "@/lib/simulation";

type Point = { x: number; y: number };

export function PrintTrajectory({ result }: { result: SimulationResult }) {
  if (!result.frames.length) return <div className="print-trajectory print-empty"><strong>No trajectory was recorded.</strong><span>Run the scenario before printing this section.</span></div>;

  const projected = result.frames.map((frame) => ({
    interceptor: project(frame.interceptor),
    target: project(frame.target),
  }));
  const all = projected.flatMap((frame) => [frame.interceptor, frame.target]);
  const normalized = normalize(all);
  const interceptor = normalized.filter((_, index) => index % 2 === 0);
  const target = normalized.filter((_, index) => index % 2 === 1);
  const closestIndex = result.frames.reduce((best, frame, index, frames) => frame.range < frames[best].range ? index : best, 0);
  const interceptorMarker = interceptor[closestIndex];
  const targetMarker = target[closestIndex];
  const closestFrame = result.frames[closestIndex];

  return <div className="print-trajectory">
    <header><div><span>Print representation</span><strong>Recorded trajectory · closest-approach frame</strong></div><p>Deterministic vector projection generated from this report&apos;s telemetry.</p></header>
    <svg viewBox="0 0 760 270" role="img" aria-label="Printable vector projection of the interceptor and target trajectories">
      <g className="print-grid">
        {[70, 140, 210].map((y) => <line key={`h-${y}`} x1="30" y1={y} x2="730" y2={y}/>)}
        {[120, 240, 360, 480, 600].map((x) => <line key={`v-${x}`} x1={x} y1="25" x2={x} y2="235"/>)}
      </g>
      <path className="print-interceptor-path" d={toPath(interceptor)}/>
      <path className="print-hostile-path" d={toPath(target)}/>
      <line className="print-los-path" x1={interceptorMarker.x} y1={interceptorMarker.y} x2={targetMarker.x} y2={targetMarker.y}/>
      <circle className="print-interceptor-marker" cx={interceptorMarker.x} cy={interceptorMarker.y} r="5"/>
      <rect className="print-hostile-marker" x={targetMarker.x - 4} y={targetMarker.y - 4} width="8" height="8"/>
      <text x={interceptorMarker.x + 9} y={interceptorMarker.y - 8}>FRIENDLY INTERCEPTOR</text>
      <text x={targetMarker.x + 9} y={targetMarker.y - 8}>OPPOSING TRACK</text>
      <text className="print-axis-label" x="30" y="258">LOCAL TRAJECTORY PROJECTION · NOT A GEOGRAPHIC MAP</text>
    </svg>
    <footer><span>Frame {closestFrame.t.toFixed(1)} s</span><span>Closest {Math.round(result.closestApproach)} m</span><span>{closestFrame.phase}</span><span>Energy index {Math.round(closestFrame.energy)}%</span></footer>
  </div>;
}

function project(point: Vec3): Point {
  return { x: point.x - point.y * .34, y: point.z + point.y * .13 };
}

function normalize(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  return points.map((point) => ({
    x: 45 + ((point.x - minX) / width) * 670,
    y: 225 - ((point.y - minY) / height) * 185,
  }));
}

function toPath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}
