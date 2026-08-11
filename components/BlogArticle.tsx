import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, ExternalLink } from "lucide-react";

export function BlogArticle({
  title,
  description,
  published,
  updated,
  readingTime,
  author,
}: {
  title: string;
  description: string;
  published: string;
  updated: string;
  readingTime: string;
  author: string;
}) {
  return (
    <article className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <header className="space-y-6 border-b border-slate-800 pb-10">
        <div className="flex flex-wrap items-center gap-3 text-xs text-cyan-300">
          <Link
            href="/blog"
            className="rounded-full border border-cyan-800/70 bg-cyan-950/50 px-3 py-1 font-semibold uppercase tracking-wider text-cyan-300"
          >
            Back to blog index
          </Link>
          <span className="text-slate-600">•</span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} />
            Published {new Date(published).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 size={12} />
            {readingTime}
          </span>
        </div>

        <div className="max-w-4xl space-y-5">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">
            Research & engineering blog
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-slate-400">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Written by
            </p>
            <p className="mt-1 font-medium text-slate-100">{author}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Updated
            </p>
            <p className="mt-1 font-medium text-slate-100">
              {new Date(updated).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Canonical route
            </p>
            <p className="mt-1 font-medium text-slate-100">/blog</p>
          </div>
        </div>
      </header>

      <div className="mt-12 space-y-12 text-slate-300">
        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-3xl border border-slate-800 bg-[#0B0F17] p-7">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
              Thesis
            </p>
            <p className="mt-4 text-base leading-8 text-slate-300">
              A useful engagement simulator does not start with graphics. It
              starts with the question of what each participant can know, when
              they can know it, and how their behaviour changes when that
              knowledge changes.
            </p>
            <p className="mt-4 text-base leading-8 text-slate-300">
              That is why the interesting boundary is between world truth,
              side-specific tracks, mission intent, and the event record. Once
              those layers are separate, the same run can drive a map, a 3D
              replay, a timeline, and an analysis report without inventing new
              state for each surface.
            </p>
          </div>

          <aside className="rounded-3xl border border-slate-800 bg-slate-950/70 p-7">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
              Practical checklist
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              <li>Preserve the world model separately from observer state.</li>
              <li>Keep sensors, tracks, and sharing as distinct stages.</li>
              <li>Let doctrine constrain behaviour instead of hard-coding it.</li>
              <li>Use mixed fidelity where it changes the analysis.</li>
              <li>Record causality, not just position samples.</li>
            </ul>
          </aside>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            Training simulators and wargames optimise for different kinds of truth
          </h2>
          <p className="leading-8">
            A cockpit trainer can be realistic because the control flow and
            timings are representative enough to rehearse procedure. A
            theatre-scale simulator can be realistic while abstracting many
            individual controls, provided the force-level interactions remain
            credible. Fidelity should therefore be justified by intended use,
            not by habit.
          </p>

          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-cyan-300">
                <tr>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Training simulator</th>
                  <th className="px-4 py-3 font-medium">
                    Engagement / wargaming simulator
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-[#0B0F17] text-slate-300">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">
                    Primary concern
                  </td>
                  <td className="px-4 py-3">
                    Representative operation of a system or crew task
                  </td>
                  <td className="px-4 py-3">
                    Interaction of forces, missions, information, and effects
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">
                    Human interaction
                  </td>
                  <td className="px-4 py-3">Perform procedures inside the system</td>
                  <td className="px-4 py-3">
                    Assign missions, priorities, constraints, and decisions
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">
                    Main validation question
                  </td>
                  <td className="px-4 py-3">
                    Does the training behaviour represent the task?
                  </td>
                  <td className="px-4 py-3">
                    Does the abstraction preserve the interactions we are studying?
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            One world model, several observers
          </h2>
          <p className="leading-8">
            The simulator should not hand every participant the same omniscient
            picture. A radar sees one slice of the world. A networked shooter
            sees a delayed and possibly degraded track. A unit that has lost
            connectivity may be predicting from stale data. Those differences
            are the point.
          </p>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
              Sensing pipeline
            </p>
            <ol className="mt-4 grid gap-3 text-sm leading-7 text-slate-300 md:grid-cols-3">
              <li className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <strong className="block text-slate-100">1. Scan</strong>
                Sensor geometry, field of regard, and timing decide whether a
                measurement can exist.
              </li>
              <li className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <strong className="block text-slate-100">2. Track</strong>
                Measurements become a side-specific estimate with age, quality,
                and provenance.
              </li>
              <li className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
                <strong className="block text-slate-100">3. Share</strong>
                Networks may move that track to another participant, but not
                instantly and not perfectly.
              </li>
            </ol>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            Mixed fidelity is a modelling discipline, not just an optimisation
          </h2>
          <p className="leading-8">
            Not every entity needs the same motion model. A support asset may
            only need a route, speed, and altitude. A fighter in a BVR problem
            needs a more detailed energy model. A close manoeuvre study may need
            even more. The architecture should allow those representations to
            coexist in one scenario.
          </p>
          <blockquote className="rounded-2xl border-l-4 border-cyan-500 bg-cyan-500/5 px-5 py-4 text-sm leading-7 text-slate-300">
            Mixed fidelity works when the model detail changes only where it can
            change the answer.
          </blockquote>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            Missions and doctrine keep large scenarios manageable
          </h2>
          <p className="leading-8">
            A theatre-scale scenario cannot ask a human to issue every turn and
            state change manually. The simulation needs intent, doctrine, and
            tasking that survive as the world changes. That means behaviour
            should read the information available to the participant rather than
            a hidden world truth.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Silent until the doctrine and the geometry justify a search",
              "Track once the observation becomes usable",
              "Evaluate engagement only when the full support chain exists",
              "Hold fire if identification, weapons, or timing are not ready",
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-sm leading-7"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            Time is part of the model
          </h2>
          <p className="leading-8">
            Sensors do not update continuously. Tracks age. Links delay. Weapons
            follow their own cadence. A few seconds can change the outcome even
            when geometry looks nearly identical. The model clock establishes
            order; each subsystem decides when it is due to update.
          </p>
          <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-5">
            <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{`06:18:02  Radar enters search state
06:18:08  Observation generated
06:18:13  Track confirmed
06:18:16  Engagement evaluation begins
06:18:42  Engagement conditions satisfied
06:18:43  Interceptor launched
06:19:03  Support lost
06:20:02  Objective capability degraded`}</pre>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            Browser execution changes distribution
          </h2>
          <p className="leading-8">
            WebAssembly, modern map rendering, and worker-based off-main-thread
            execution make it practical to distribute this kind of simulation
            through a browser without turning the browser into a toy. That does
            not remove compute cost. It changes who can access the model.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            The event record deserves equal status with the map
          </h2>
          <p className="leading-8">
            A useful simulation does not have to invent a story after the fact.
            It can record the causal chain as it runs: what changed, when it
            changed, and why that mattered. That makes the map, the 3D replay,
            the timeline, and the report all read from the same run state.
          </p>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
            <p className="font-medium text-slate-100">Why the SAM did not engage</p>
            <ul className="mt-3 space-y-2 leading-7">
              <li>Target entered geometric coverage</li>
              <li>Off-board track quality was below threshold</li>
              <li>Local radar remained silent under doctrine</li>
              <li>Track matured after the preferred engagement window</li>
            </ul>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-semibold text-slate-100">
            Where Vector Engagement Labs fits
          </h2>
          <p className="leading-8">
            Vector Engagement Labs is an open attempt to build that architecture
            carefully in public. The near-term focus is the air domain: force
            geometry, sensors, communications, doctrine, mission intent, and
            explainable replay. The system should remain useful because the same
            run state feeds the map, 3D view, report, and analysis surfaces.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              Browse scenarios
              <ArrowRight size={14} />
            </Link>
            <a
              href="https://github.com/SrivatsaRv/vector-engagements-labs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-cyan-800 hover:text-cyan-300"
            >
              Repository
              <ExternalLink size={14} />
            </a>
          </div>
        </section>
      </div>
    </article>
  );
}

