import Link from "next/link";
import { ArrowRight, BookOpen, Calculator, CircleAlert } from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";
import { ENGINE_VERSION } from "@/lib/engine/version";
import { SCENARIO_PACKAGE_SCHEMA_VERSION } from "@/lib/scenario-package";
import { RASP_SOURCE_CONTRACTS } from "@/lib/simulation";

const equations = [
  {
    id: "atmosphere",
    name: "Standard atmosphere",
    output: "Temperature, pressure, density and speed of sound",
    formula: "T = T₀ − Lh · p = p₀(T/T₀)^(g/RL) · ρ = p/RT · a = √(γRT)",
    meaning:
      "Altitude changes the air through which every aircraft and guided vehicle moves. A study area selects a reference terrain and weather preset; the preset supplies the declared temperature offset and wind vector. The area name itself does not alter the equation.",
    state: "Sourced method",
    source: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-english/",
    sourceLabel: "NASA Glenn · Earth atmosphere equations",
  },
  {
    id: "air-relative",
    name: "Air-relative velocity",
    output: "Velocity used by the drag calculation",
    formula: "v_air = v_ground − v_wind",
    meaning:
      "Wind is a vector, not a generic performance penalty. The selected weather preset supplies east and north components; both are subtracted from ground velocity before drag is calculated.",
    state: "Computed state",
  },
  {
    id: "drag",
    name: "Aerodynamic drag",
    output: "Drag force and deceleration",
    formula: "q = ½ρ|v_air|² · D = q Cᴅ A · a_drag = −D/m · v̂_air",
    meaning:
      "The model combines atmospheric density, air-relative speed, reference area and a declared drag coefficient. The coefficient is a model assumption unless a source states otherwise.",
    state: "Mixed sourced/assumed",
    source: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure-2/",
    sourceLabel: "NASA Glenn · Dynamic pressure",
  },
  {
    id: "propulsion",
    name: "Thrust and mass depletion",
    output: "Powered-flight acceleration and remaining mass",
    formula: "ṁ = (m_launch − m_dry)/t_burn · m(t+Δt) = max(m_dry, m(t) − ṁΔt)",
    meaning:
      "A model coefficient set declares launch mass, dry mass, burn time and thrust. Thrust tapers near the declared modeled speed instead of enforcing a hard maximum speed.",
    state: "Model assumption",
  },
  {
    id: "aircraft-forces",
    name: "Aircraft force and fuel state",
    output: "Lift demand, induced drag, thrust, fuel and turn rate",
    formula: "L = nmg · Cᴅ = Cᴅ₀ + kCʟ² · D = qSCᴅ · ṁ_f = TSFC·T · ω = g√(n²−1)/V",
    meaning:
      "The selected decision and maneuver set load-factor demand. The engine caps it at the aircraft model limit, resolves parasitic and induced drag, consumes fuel from thrust demand, updates mass, and changes heading at the resulting point-mass turn rate.",
    state: "Model assumption",
    source: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/",
    sourceLabel: "NASA Glenn · Drag equation",
  },
  {
    id: "guidance",
    name: "Proportional-navigation demand",
    output: "Commanded lateral acceleration",
    formula: "a_cmd = N · V_c · (ω_LOS × λ̂)",
    meaning:
      "The guidance command depends on closing speed, line-of-sight rotation and the declared navigation constant. Command magnitude is capped by the model’s available acceleration.",
    state: "Model method",
  },
  {
    id: "integration",
    name: "Deterministic 3DOF integration",
    output: "Position and velocity at the next fixed step",
    formula: "vₙ₊₁ = vₙ + aₙΔt · rₙ₊₁ = rₙ + vₙ₊₁Δt",
    meaning:
      "VECTOR uses a 50 ms semi-implicit fixed step. Identical scenario packages and seeds therefore reproduce identical frames in the current engine.",
    state: "Engine contract",
  },
  {
    id: "geometry",
    name: "Relative geometry",
    output: "Separation, closure and line-of-sight rate",
    formula: "r_rel = r_target − r_weapon · R = |r_rel| · V_c = −v_rel·r̂_rel · ω_LOS = |r_rel×v_rel|/R²",
    meaning:
      "These values describe the relationship between the active guided vehicle and its assigned objective. They are not sensor field-of-view measurements.",
    state: "Computed state",
  },
  {
    id: "energy",
    name: "Specific mechanical energy",
    output: "Comparable energy state per unit mass",
    formula: "e = gh + ½|v|²",
    meaning:
      "This combines altitude and speed in joules per kilogram. The separate percentage shown in legacy summaries is normalized weapon speed, not physical total energy.",
    state: "Computed state",
  },
  {
    id: "rasp",
    name: "RASP track quality",
    output: "Track status, age and positional uncertainty",
    formula: "Q = clamp(Q₀ − 0.32·max(Rkm−25,0) − 17·jam − 34·hold) · σ = 120 + 11(100−Q)^1.55",
    meaning:
      "Q₀ is 82 for onboard radar, 78 for data link, 90 for airborne early warning and 72 for visual observation. This is a VECTOR-authored educational information-quality assumption, not a sourced probability or radar-detection equation. Source availability, selected visibility, range, jamming and interruption state affect the perceived track; they never move Model Truth.",
    state: "Model assumption",
  },
  {
    id: "coverage",
    name: "Sensor and engagement envelopes",
    output: "Detection, tracking, engagement and minimum-range volumes",
    formula: "inside(r) ⇔ r_min ≤ |p_target − p_sensor| ≤ r_kind and h_min ≤ h ≤ h_max",
    meaning:
      "The current envelopes are scenario-declared study volumes that follow the owning entity. They are displayed independently and carry a sourced or assumed value state. They are not yet calculated from a radar equation, terrain, radar cross-section, propagation, or electronic attack.",
    state: "Scenario/model assumption",
  },
  {
    id: "termination",
    name: "Run termination",
    output: "Completion or failure reason",
    formula: "complete if R ≤ 180 m · otherwise energy, surface and time-limit checks apply",
    meaning:
      "The 180 m value is a scenario completion threshold. It is not a fuse radius, lethal radius or real-world hit-probability claim.",
    state: "Scenario contract",
  },
];

const visualLayers = [
  ["Aircraft and launched weapons", "Recorded entity frames", "Position, orientation, lifecycle and affiliation from the immutable engine record"],
  ["Recorded trajectories", "Recorded entity frames", "Time-ordered positions; the viewer reveals the path only up to current model time"],
  ["Declared routes", "Scenario package", "Authored waypoints; no physics equation is implied"],
  ["Installations", "PostGIS catalog snapshot", "EPSG:4326 point geometry and public-reference identity"],
  ["Sensor coverage", "Compiled entity envelope", "Declared detection or tracking radius, altitude band and value state"],
  ["Engagement envelope", "Compiled entity envelope", "Declared minimum/maximum range and altitude band; not probability of kill"],
  ["IAF and PAF RASP", "Observer-picture samples", "Sensor-source availability plus the documented VECTOR information-quality assumption"],
  ["Telemetry", "Recorded value or formula fallback", "The label identifies the entity, unit, value state and current model time"],
];

const raspSourceRows = Object.values(RASP_SOURCE_CONTRACTS).map((source) => [
  source.label,
  source.requirement,
  `${source.pictureEffect} ${source.physicsEffect}${source.limitation ? ` ${source.limitation}` : ""}`,
]);

export default function MathPage() {
  return (
    <main className="math-page">
      <ProductHeader current="math" />
      <section className="math-hero">
        <span>MODEL TRANSPARENCY · {ENGINE_VERSION}</span>
        <h1>Math behind VECTOR</h1>
        <p>
          Every displayed result should be traceable to an input, an equation,
          a coefficient state, and the exact frames saved with the run.
        </p>
        <div className="math-warning">
          <CircleAlert size={18} />
          <p>
            This is a deterministic educational 3DOF model. Public facts and
            model coefficients remain separate; the equations do not validate
            named-system operational performance.
          </p>
        </div>
      </section>
      <section className="math-index" aria-label="Equation index">
        {equations.map((item, index) => (
          <a href={`#${item.id}`} key={item.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.name}</strong>
          </a>
        ))}
      </section>
      <section className="math-equations">
        {equations.map((item, index) => (
          <article id={item.id} key={item.id}>
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{item.name}</h2>
                <p>{item.output}</p>
              </div>
              <em>{item.state}</em>
            </header>
            <code>{item.formula}</code>
            <p>{item.meaning}</p>
            {item.source && (
              <Link href={item.source} target="_blank" rel="noreferrer">
                <BookOpen size={14} />
                {item.sourceLabel}
                <ArrowRight size={13} />
              </Link>
            )}
          </article>
        ))}
      </section>
      <section className="math-layer-contract" aria-labelledby="rasp-contract-title">
        <header>
          <span>AIR-PICTURE STATE CONTRACT</span>
          <h2 id="rasp-contract-title">What each RASP source actually does</h2>
          <p>These are observer-picture inputs, not interchangeable sensor physics. The selected source must satisfy its dependency before VECTOR displays an opposing-aircraft track.</p>
        </header>
        <div role="table" aria-label="RASP source state matrix">
          {raspSourceRows.map(([source, requirement, effect]) => (
            <article role="row" key={source}>
              <strong role="cell">{source}</strong>
              <span role="cell">{requirement}</span>
              <p role="cell">{effect}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="math-layer-contract" aria-labelledby="layer-contract-title">
        <header>
          <span>DISPLAY PROVENANCE</span>
          <h2 id="layer-contract-title">What generates each rendered layer</h2>
          <p>Not everything on the map is produced by a physics equation. VECTOR distinguishes recorded motion, authored geometry, catalog geography, and model-assumption envelopes.</p>
        </header>
        <div role="table" aria-label="Rendered layer provenance">
          {visualLayers.map(([layer, source, rule]) => (
            <article role="row" key={layer}>
              <strong role="cell">{layer}</strong>
              <span role="cell">{source}</span>
              <p role="cell">{rule}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="math-version-contract" aria-labelledby="version-contract-title">
        <header>
          <span>REPRODUCIBILITY CONTRACT</span>
          <h2 id="version-contract-title">How a displayed result is traced</h2>
          <p>
            Version labels are not decorative. A saved run binds the authored
            package, compiled engine input, and generated frames into one
            replayable record.
          </p>
        </header>
        <ol>
          <li>
            <span>01</span>
            <div><strong>Scenario package</strong><p>{SCENARIO_PACKAGE_SCHEMA_VERSION} · template ID, semantic version, authored inputs and source references</p></div>
          </li>
          <li>
            <span>02</span>
            <div><strong>Content hash</strong><p>SHA-256 of canonical JSON proves which exact package was loaded from PostGIS.</p></div>
          </li>
          <li>
            <span>03</span>
            <div><strong>Compiled model</strong><p>{ENGINE_VERSION} · resolved entities, events, environment and coefficient-set versions</p></div>
          </li>
          <li>
            <span>04</span>
            <div><strong>Recorded frames</strong><p>A second SHA-256 hash binds the telemetry used by Observe, Explain and the printable report.</p></div>
          </li>
        </ol>
      </section>
      <section className="math-run-link">
        <Calculator size={20} />
        <div>
          <strong>Inspect the numbers in context</strong>
          <p>Run a saved scenario, then compare its report provenance with these definitions.</p>
        </div>
        <Link href="/scenarios">Choose a scenario <ArrowRight size={14} /></Link>
      </section>
    </main>
  );
}
