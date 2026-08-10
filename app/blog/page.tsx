import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Calendar, CircleAlert } from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";
import { MermaidDiagram } from "@/components/MermaidDiagram";

export const metadata: Metadata = {
  title: "What Engagement Simulators Need to Model in 2026 | Vector Engagement Labs",
  description:
    "A design note on how Vector Engagement Labs models physics, information flow, missions, and explainable outcomes in one browser-delivered engagement workbench.",
  openGraph: {
    title: "What Engagement Simulators Need to Model in 2026 | Vector Engagement Labs",
    description:
      "A design note on how Vector Engagement Labs models physics, information flow, missions, and explainable outcomes in one browser-delivered engagement workbench.",
    url: "https://labs.reachdefence.com/blog",
    siteName: "Vector Engagement Labs",
    images: [{ url: "https://labs.reachdefence.com/og.png" }],
    type: "article",
    publishedTime: "2026-08-09T00:00:00.000Z",
    authors: ["Srivatsa RV", "Reach Defence"],
  },
  twitter: {
    card: "summary_large_image",
    title: "What Engagement Simulators Need to Model in 2026 | Vector Engagement Labs",
    description:
      "A design note on how Vector Engagement Labs models physics, information flow, missions, and explainable outcomes in one browser-delivered engagement workbench.",
    images: ["https://labs.reachdefence.com/og.png"],
  },
};

const sectionIndex = [
  { id: "why", label: "Why this simulator exists" },
  { id: "world", label: "One world, several information states" },
  { id: "physics", label: "Mixed fidelity, bounded by purpose" },
  { id: "missions", label: "Missions and doctrine above motion" },
  { id: "record", label: "Why the event record matters" },
];

const commitments = [
  "One deterministic world state and one replayable run record.",
  "Observer picture separated from omniscient model truth.",
  "Mission and doctrine shape behaviour before effect.",
  "Browser delivery without hiding assumptions or provenance.",
];

export default function BlogPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: "What Engagement Simulators Need to Model in 2026",
    description:
      "A design note on how Vector Engagement Labs models physics, information flow, missions, and explainable outcomes in one browser-delivered engagement workbench.",
    image: "https://labs.reachdefence.com/og.png",
    datePublished: "2026-08-09T00:00:00.000Z",
    author: {
      "@type": "Organization",
      name: "Srivatsa RV & Reach Defence",
      url: "https://reachdefence.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Vector Engagement Labs",
      url: "https://labs.reachdefence.com",
    },
    url: "https://labs.reachdefence.com/blog",
  };

  return (
    <main className="blog-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductHeader current="blog" />

      <section className="blog-hero">
        <span>ENGINEERING NOTE · AUGUST 2026</span>
        <h1>What Engagement Simulators Need to Model in 2026</h1>
        <p>
          Vector Engagement Labs is not trying to imitate a glossy editorial
          site. This page exists to explain the model boundaries, information
          contracts, and design choices that make the workbench worth trusting.
        </p>
        <div className="blog-meta">
          <span>
            <Calendar size={14} />
            August 9, 2026
          </span>
          <span>
            <BookOpen size={14} />
            Srivatsa RV &amp; Reach Defence
          </span>
        </div>
        <div className="blog-warning">
          <CircleAlert size={18} />
          <p>
            This is research software. The point is causal coherence, explicit
            assumptions, and reproducible records — not implied operational
            validation for named systems.
          </p>
        </div>
      </section>

      <section className="blog-index" aria-label="Blog section index">
        {sectionIndex.map((item, index) => (
          <a href={`#${item.id}`} key={item.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.label}</strong>
          </a>
        ))}
      </section>

      <section className="blog-summary">
        <div>
          <span className="overline">Release-facing summary</span>
          <h2>What changes when this model is treated seriously</h2>
          <p>
            A credible engagement simulator cannot be built from geometry alone.
            It needs bounded physics, side-specific information state, mission
            intent, and a run record that explains why an outcome occurred.
          </p>
        </div>
        <ul>
          {commitments.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <article className="blog-article">
        <section id="why">
          <header>
            <span>01</span>
            <div>
              <h2>Why this simulator exists</h2>
              <p>
                The useful question is not how cinematic a run looks. It is
                whether the model preserves the interactions needed to study a
                tactical or operational decision.
              </p>
            </div>
          </header>
          <div>
            <p>
              Military simulation is being pulled between specialist trainers,
              synthetic environments, autonomy testing, and theatre-scale
              wargaming. Those are not the same products, but they increasingly
              share one requirement: a coherent world in which motion,
              observation, communication, behaviour, and effect all agree with
              each other.
            </p>
            <p>
              That is the design space Vector Engagement Labs is working in. The
              browser shell is just the delivery surface. The real work is in
              keeping physics truth, observer picture, scenario intent, and
              replay evidence separate enough that the output can be challenged.
            </p>
            <blockquote>
              <strong>
                What does the model need to get right for the decision or
                behaviour we want to study?
              </strong>
            </blockquote>
          </div>
        </section>

        <section id="world">
          <header>
            <span>02</span>
            <div>
              <h2>One world, several information states</h2>
              <p>
                The engine knows the real state. Participants should only act on
                what their sensors, tracks, and communications make available.
              </p>
            </div>
          </header>
          <div>
            <p>
              A defending fighter should not receive omniscient truth because
              the simulation engine has it. A surface battery should not engage
              because a range circle looks persuasive on the map. Side-specific
              observer picture is where simple simulators usually lose
              credibility.
            </p>
            <MermaidDiagram
              code={`flowchart LR
    WORLD["World state"] --> SENSOR["Sensors"]
    SENSOR --> OBS["Observations"]
    OBS --> TRACK["Tracks"]
    TRACK --> COMMS["Information sharing"]
    COMMS --> BEHAVIOUR["Mission behaviour"]
    BEHAVIOUR --> ACTION["Actions"]
    ACTION --> EFFECT["Effects"]
    EFFECT --> WORLD

    TIME["Model time"] --> WORLD
    TIME --> SENSOR
    TIME --> COMMS
    TIME --> BEHAVIOUR
    TIME --> EFFECT`}
            />
            <p>
              Once those boundaries are explicit, assets like AEW, data links,
              radar silence, and interruption states start to matter for the
              right reasons instead of being treated as decorative toggles.
            </p>
          </div>
        </section>

        <section id="physics">
          <header>
            <span>03</span>
            <div>
              <h2>Mixed fidelity, bounded by purpose</h2>
              <p>
                Every object in the scenario does not need the same physical
                model, but the high-consequence objects do need explicit,
                deterministic constraints.
              </p>
            </div>
          </header>
          <div>
            <p>
              The same run may contain a fighter that benefits from a
              three-dimensional point-mass model, a support asset that can be
              represented with route and speed constraints, and a static
              installation that matters only as defended geometry and
              capability. What matters is that the chosen abstraction is stated
              and compatible with the study question.
            </p>
            <div className="blog-note">
              <strong>Vector rule</strong>
              <p>
                Fidelity is justified by intended use. Added detail without
                analytical consequence is cost, not accuracy.
              </p>
            </div>
            <p>
              That is why VECTOR treats public facts, model assumptions, and
              derived state as separate things throughout the app, report, and
              run record.
            </p>
          </div>
        </section>

        <section id="missions">
          <header>
            <span>04</span>
            <div>
              <h2>Missions and doctrine belong above motion</h2>
              <p>
                Compute is not the only scale problem. Human control becomes the
                bottleneck well before the processor does.
              </p>
            </div>
          </header>
          <div>
            <p>
              Large scenarios need intent that survives changing geometry.
              Missions define objectives. Doctrine constrains behaviour. Tasks
              express the current responsibility of a unit. Motion and emissions
              then follow from available information and role, not from
              constant manual steering.
            </p>
            <MermaidDiagram
              code={`flowchart LR
    TRUTH["Entity in world"] --> SCAN["Sensor opportunity"]
    SCAN --> MEASURE["Measurement"]
    MEASURE --> TRACK["Track update"]
    TRACK --> CLASS["Classification / identity"]
    CLASS --> SHARE["Network distribution"]
    SHARE --> DECIDE["Decision"]`}
            />
            <p>
              This is what keeps a scenario from collapsing into special cases.
              A battery can remain silent while off-board surveillance is
              sufficient. A fighter can change behaviour because a side-specific
              track degraded. An engagement can be held for doctrine or track
              quality rather than because the UI script wanted drama.
            </p>
          </div>
        </section>

        <section id="record">
          <header>
            <span>05</span>
            <div>
              <h2>Why the event record matters</h2>
              <p>
                The map is important, but the explanation surface is the run
                record: what changed, when it changed, and why it changed.
              </p>
            </div>
          </header>
          <div>
            <p>
              The simulator already knows when a track matured, when a sensor
              changed state, when a route was crossed, and when an effect
              altered capability. Recording those transitions produces something
              more useful than a post-hoc story: it produces a challengeable
              causal chain.
            </p>
            <div className="blog-note">
              <strong>Release implication</strong>
              <p>
                A saved run should bind scenario package, compiled input, and
                frame record tightly enough that the report can be regenerated
                from admitted evidence rather than presentation state.
              </p>
            </div>
            <p>
              That is why the browser workbench, the report route, and the
              versioned VECTOR Simulation Record all exist in the same contract.
            </p>
          </div>
        </section>
      </article>

      <section className="blog-cta">
        <div>
          <span>Use the workbench</span>
          <strong>Inspect the same assumptions in the live product surface</strong>
          <p>
            Run a scenario, compare the report provenance, and inspect the math
            page if you want the underlying model contract in full.
          </p>
        </div>
        <div>
          <Link href="/scenarios">
            Choose a scenario <ArrowRight size={14} />
          </Link>
          <Link href="/math">
            Review the math contract <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </main>
  );
}
