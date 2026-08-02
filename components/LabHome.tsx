import Link from "next/link";
import {
  ArrowRight, BookOpen, Check, CircleDot, FileText, Play,
  ShieldCheck, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";

const stages = [
  { number: "01", title: "Design", copy: "Set intent, entities, geometry, and prepared events.", icon: SlidersHorizontal },
  { number: "02", title: "Validate", copy: "Review scope, assumptions, and repeatable run files.", icon: Check },
  { number: "03", title: "Conduct", copy: "Run the model, observe geometry, and introduce prepared events.", icon: Play },
  { number: "04", title: "Debrief", copy: "Explain the result, compare runs, and generate a record.", icon: FileText },
];

export function LabHome() {
  return <main className="lab-home">
    <ProductHeader current="lab"/>
    <section className="lab-home-hero">
      <div className="lab-home-copy">
        <span className="overline">Lab Home · operational entry</span>
        <h1>What do you want<br/>to test today?</h1>
        <p>Start from a guided template, or browse the complete scenario library. Every route enters the same design, validation, conduct, and debrief workflow.</p>
        <div className="hero-actions">
          <Link className="primary-link" href="/lab?scenario=a2a-crossing-intercept"><Play size={16}/>Start guided scenario</Link>
          <Link className="secondary-link" href="/scenarios"><BookOpen size={16}/>Browse all 8 templates</Link>
        </div>
        <div className="lab-home-status"><ShieldCheck size={16}/><div><strong>Public data mode</strong><span>Synthetic sites, generic profiles, visible assumptions.</span></div></div>
      </div>
      <aside className="lab-home-next" aria-label="Recommended first session">
        <header><span>Recommended first session</span><em>FOUNDATION</em></header>
        <div><CircleDot size={20}/><span>A2A · AIR INTERCEPT</span></div>
        <h2>Crossing-air-target intercept</h2>
        <p>See how range, aspect, and target behaviour change the available intercept window.</p>
        <dl><div><dt>Time</dt><dd>5–8 min</dd></div><div><dt>Entities</dt><dd>2 roles</dd></div><div><dt>Model</dt><dd>Abstract v0.2</dd></div></dl>
        <Link href="/lab?scenario=a2a-crossing-intercept">Configure this run <ArrowRight size={15}/></Link>
      </aside>
    </section>

    <section className="lab-home-flow">
      <header><span className="overline">One continuous workflow</span><h2>The lab keeps context from first question to final report.</h2></header>
      <div>{stages.map(({ number, title, copy, icon: Icon }) => <article key={title}><span>{number}</span><Icon size={18}/><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="lab-home-library">
      <header><div><span className="overline">Quick entry · one template per mission set</span><h2>Choose the training problem.</h2></div><Link href="/scenarios">See all templates <ArrowRight size={14}/></Link></header>
      <ScenarioLibrary compact/>
    </section>

    <section className="lab-home-modes">
      <article><Sparkles size={19}/><div><strong>Enthusiast console</strong><p>Guided authoring, clear model explanations, and no assumed aerospace expertise.</p></div><Link href="/lab?scenario=a2a-crossing-intercept">Begin guided</Link></article>
      <article><SlidersHorizontal size={19}/><div><strong>Instructor workflow</strong><p>Prepared run files, event introduction, session bookmarks, debrief, and reporting.</p></div><Link href="/lab?scenario=a2a-crossing-intercept&mode=instructor">Open Instructor Station</Link></article>
    </section>
  </main>;
}
