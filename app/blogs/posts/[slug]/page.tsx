import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";
import { BlogShareAndComments } from "@/components/BlogShareAndComments";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { formatBlogDate, getBlogPost } from "@/lib/blog";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} | Vector Engagement Labs`,
    description: post.summary,
    openGraph: {
      title: `${post.title} | Vector Engagement Labs`,
      description: post.summary,
      url: `https://labs.reachdefence.com/blogs/posts/${post.slug}`,
      siteName: "Vector Engagement Labs",
      images: [{ url: "https://labs.reachdefence.com/og.png" }],
      type: "article",
      publishedTime: `${post.publishedAt}T00:00:00.000Z`,
      modifiedTime: `${post.updatedAt}T00:00:00.000Z`,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | Vector Engagement Labs`,
      description: post.summary,
      images: ["https://labs.reachdefence.com/og.png"],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    image: "https://labs.reachdefence.com/og.png",
    datePublished: `${post.publishedAt}T00:00:00.000Z`,
    dateModified: `${post.updatedAt}T00:00:00.000Z`,
    author: {
      "@type": "Organization",
      name: post.author,
      url: "https://reachdefence.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Vector Engagement Labs",
      url: "https://labs.reachdefence.com",
    },
    url: `https://labs.reachdefence.com/blogs/posts/${post.slug}`,
  };

  return (
    <main className="blog-post-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductHeader current="blog" />

      <article className="blog-post-shell">
        <Link href="/blogs" className="blog-post-back">
          <ArrowLeft size={14} />
          Back to blogs
        </Link>

        <header className="blog-post-header">
          <span className="blog-post-category">{post.category}</span>
          <h1>{post.title}</h1>
          <p>{post.summary}</p>

          <dl className="blog-post-meta">
            <div>
              <dt>Written by</dt>
              <dd>{post.author}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatBlogDate(post.publishedAt)}</dd>
            </div>
            <div>
              <dt>Reading time</dt>
              <dd>{post.readingTimeMinutes} minutes</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatBlogDate(post.updatedAt)}</dd>
            </div>
          </dl>

          <ul className="blog-post-tags" aria-label="Article tags">
            {post.tags.map((tag) => (
              <li key={tag}>#{tag}</li>
            ))}
          </ul>
        </header>

        <section className="blog-post-content">
          <p>
            Military simulation is increasingly asked to do two things at once:
            preserve enough technical structure to support causal claims, and
            remain usable as a browser-delivered product surface.
          </p>

          <p>
            That tension is where Vector Engagement Labs sits. We are not trying
            to produce an attractive animation that implies trust. We are trying
            to produce a scenario workbench where the user can inspect what was
            assumed, what was observed, and why a result unfolded.
          </p>

          <div className="blog-post-callout blog-post-callout-strong">
            <strong>At a glance</strong>
            <ul>
              <li>Geometry alone is insufficient. The platform has to preserve why a participant acted.</li>
              <li>Model detail is justified only when it changes the judgement a user can make.</li>
              <li>Saved records, reports, and replay need the same authority as the visual run.</li>
              <li>Browser delivery is viable only when expensive work is bounded and explained.</li>
            </ul>
          </div>

          <h2>A visible trajectory is not yet an explainable result</h2>

          <p>
            A run can look persuasive while still hiding the important contract
            boundaries. A fighter track on a map tells the operator where motion
            ended up. It does not say whether the simulated participant acted on
            observed information, stale information, or omniscient truth leaked
            from the engine.
          </p>

          <p>
            That is why Vector separates world state from observer picture. The
            engine needs exact state to advance the scenario. Simulated
            participants should not automatically get that same privilege.
          </p>

          <p>
            In practical terms, this means an operator should be able to answer
            four separate questions after a run: what physically happened, what
            each side could observe, what doctrine or mission state permitted,
            and which event caused the final outcome. If those threads collapse
            into one blended state stream, the product becomes visually
            interesting but analytically weak.
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
  EFFECT --> WORLD`}
          />

          <h2>Fidelity is only justified when it changes the judgement</h2>

          <p>
            Every extra model detail carries an implementation and verification
            cost. So the standard is not “more detail is better.” The standard
            is whether the added detail changes the decision under study.
          </p>

          <p>
            Some entities need explicit three-dimensional point-mass dynamics.
            Others only need route, speed, and timing constraints. The system is
            more honest when these differences are stated plainly than when they
            are hidden behind a generic realism claim.
          </p>

          <p>
            That distinction matters commercially as much as technically. If a
            browser workbench pretends that every entity is modelled to the same
            depth, the user cannot judge where the platform is strong and where
            it is intentionally abstract. Explicit fidelity boundaries make the
            product more trustworthy, not less.
          </p>

          <div className="blog-post-callout">
            <strong>Vector rule</strong>
            <p>
              Fidelity is justified by intended use. Added detail without
              analytical consequence is cost, not accuracy.
            </p>
          </div>

          <h2>A useful run has to preserve its evidence chain</h2>

          <p>
            The product cannot ask the user to trust a conclusion they cannot
            reconstruct. Scenario inputs, admitted model packs, environment
            assumptions, engine version, and recorded frames need one stable
            provenance chain. Without that chain, “report export” is merely a
            screenshot with better typography.
          </p>

          <p>
            This is especially important when comparing two variants. A
            comparison only says something meaningful if both variants inherit
            the same base scenario, differ by an explicit patch, and carry the
            same replay and report contract. Otherwise the user is comparing
            presentation artifacts rather than scenario outcomes.
          </p>

          <div className="blog-post-callout">
            <strong>Release implication</strong>
            <p>
              The report route, saved run snapshot, and VECTOR Simulation Record
              must all agree on the same package identity and frame history.
            </p>
          </div>

          <h2>Missions and doctrine belong above geometry</h2>

          <p>
            A theatre-scale scenario stops being usable if every turn, sensor
            state, and engagement decision requires manual control. That is why
            mission and doctrine sit above movement. Intent must survive as the
            geometry changes.
          </p>

          <p>
            A battery can remain silent while off-board surveillance is
            sufficient. A fighter can break because its side-specific track
            degraded. An engagement can be held for doctrine, track quality, or
            support state. Those behaviours are more credible when they arise
            from explicit state instead of UI scripting.
          </p>

          <p>
            The user experience consequence is straightforward: the workbench
            needs to expose mission state in readable language, not bury it in
            implementation detail. The analyst should be able to tell whether a
            non-launch occurred because of geometry, identification quality,
            emission policy, support loss, or a user-authored doctrine limit.
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

          <h2>Browser delivery changes the engineering standard</h2>

          <p>
            A desktop or trainer stack can sometimes hide latency behind machine
            class or installation complexity. A browser product cannot. The
            frame loop, map interaction, authored state, and playback surfaces
            all have to remain legible on ordinary hardware while still showing
            enough evidence to justify the result.
          </p>

          <p>
            That pushes architecture in a particular direction: deterministic
            fixed-step execution, bounded input sizes, explicit scenario limits,
            Worker-isolated heavy work, and a rendering layer that never
            silently changes the underlying run contract. Responsiveness is not
            an aesthetic preference here. It is part of analytical integrity.
          </p>

          <div className="blog-post-callout">
            <strong>Browser constraint</strong>
            <p>
              If the platform must choose between an unbounded “realistic”
              feature and a bounded explainable one, the bounded explainable
              feature is the correct product choice.
            </p>
          </div>

          <h2>The run record deserves equal status with the map</h2>

          <p>
            The map is one reasoning surface. The event record is another. If a
            user asks why a weapon did not launch, the answer should not depend
            on retrospective storytelling. It should be reconstructible from the
            saved scenario package, compiled runtime input, and recorded state
            transitions.
          </p>

          <p>
            That is why the workbench, report route, and VECTOR Simulation
            Record are tied together. A saved result should be reproducible from
            admitted evidence, not from UI memory.
          </p>

          <p>
            The important consequence is cultural as well as technical. A
            simulation platform becomes more useful when it can say “this claim
            is supported” and equally when it can say “this claim is outside the
            current model boundary.” A product that cannot express its limits is
            not ready to inform decisions.
          </p>

          <h2>What this means for Vector Engagement Labs</h2>

          <p>
            The current release direction is therefore not “make the page look
            like a simulator.” It is to make the browser workbench act like a
            governed analytical instrument: declared assumptions, explicit
            state, deterministic playback, readable outputs, and discussion that
            stays attached to the same product surface.
          </p>

          <p>
            That is also why this blog exists inside the application rather than
            as a disconnected marketing surface. The engineering notes, report
            routes, scenario tools, and evidence chain need to live in one
            coherent system if users are going to trust what the platform is
            saying.
          </p>
        </section>

        <BlogShareAndComments title={post.title} slug={post.slug} />
      </article>
    </main>
  );
}
