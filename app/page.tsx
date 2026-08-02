import Link from "next/link";
import {
  ArrowRight, Boxes, Check, CircleDot, FileText, GitBranch,
  GraduationCap, Layers3, Play, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { LandingMiniSim } from "@/components/LandingMiniSim";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";

export default function LandingPage() {
  return <main className="landing">
    <header className="landing-nav">
      <Link href="/" className="brand"><span>V</span><div><strong>VECTOR</strong><small>Engagement Lab</small></div></Link>
      <nav><Link href="#scenarios">Scenarios</Link><Link href="#how">How it works</Link><Link href="#instructor">Instructor Station</Link><Link href="#method">Method</Link></nav>
      <Link href="/lab" className="nav-cta">Open the lab <ArrowRight size={15}/></Link>
    </header>

    <section className="hero">
      <div className="hero-copy"><span className="overline">Browser-based simulation · public-data models</span><h1>Understand the engagement.<br/>Not just the outcome.</h1><p>Build abstract air-to-air, air-to-ground, ground-to-air and ground-to-ground scenarios. Watch the geometry develop, test assumptions, and produce a replayable report without presenting public estimates as verified performance.</p><div className="hero-actions"><Link href="/scenarios" className="primary-link"><Play size={16}/>Choose a scenario</Link><Link href="/report?sample=1" className="secondary-link"><FileText size={16}/>View sample report</Link></div><div className="trust-row"><span><Check size={13}/>No install</span><span><Check size={13}/>Live model preview</span><span><Check size={13}/>Assumptions visible</span></div></div>
      <LandingMiniSim/>
    </section>

    <section className="proof-strip"><span>CONSTRUCT</span><i/><span>SIMULATE</span><i/><span>OBSERVE</span><i/><span>EXPLAIN</span><i/><span>REPORT</span></section>

    <section className="scenario-section" id="scenarios"><div className="scenario-section-heading"><div><span className="overline">Scenario library · versioned templates</span><h2>Begin with the engagement domain.</h2></div><div><p>Every card opens a configured, reproducible lab state. Regional examples use generalized terrain and synthetic sites rather than real installation coordinates.</p><Link href="/scenarios">View all scenarios <ArrowRight size={14}/></Link></div></div><ScenarioLibrary compact/></section>

    <section className="landing-section" id="how"><div className="section-heading"><span>One clear loop</span><h2>Built for curious minds,<br/>not aerospace specialists.</h2><p>The guided experience begins with intent and geometry. Advanced variables remain available when you need them.</p></div><div className="journey-grid"><Journey number="01" icon={SlidersHorizontal} title="Build" copy="Choose a training question, initial geometry, target behaviour, and one abstract interceptor class."/><Journey number="02" icon={Play} title="Simulate" copy="Run a deterministic browser model and watch trajectories develop in an abstract 3D space."/><Journey number="03" icon={Layers3} title="Understand" copy="Inspect energy, line of sight, phases, assumptions, and the factors that shaped the outcome."/><Journey number="04" icon={FileText} title="Report" copy="Capture the scenario, model version, replay events, observations, and limitations in one record."/></div></section>

    <section className="instructor-section" id="instructor"><div className="instructor-copy"><span className="overline">Advanced when you need it</span><h2>An Instructor Station beneath the enthusiast console.</h2><p>Turn a single experiment into a repeatable training session without changing the visual language or forcing every user into professional controls.</p><Link href="/lab?mode=instructor">Explore instructor mode <ArrowRight size={14}/></Link></div><div className="instructor-board"><Feature icon={GitBranch} title="Scenario branches" copy="Prepare alternate trajectories and decision-triggered events."/><Feature icon={Boxes} title="Run files" copy="Create baseline, degraded, and repeatable seeded variations."/><Feature icon={CircleDot} title="Fault introduction" copy="Arm prepared training faults with explicit consequences."/><Feature icon={GraduationCap} title="Brief & debrief" copy="Replay what happened, what the learner knew, and why it mattered."/></div></section>

    <section className="method-section" id="method"><div><ShieldCheck size={22}/><h2>Confidence through transparency</h2></div><div className="method-points"><article><strong>Abstract profiles first</strong><p>The initial library uses generic classes, not claims about named real-world weapons.</p></article><article><strong>Every assumption visible</strong><p>Model scope, exclusions, version, inputs, and source categories travel with the report.</p></article><article><strong>Reproducible by design</strong><p>Scenario values, run seed, events, and results are preserved for replay and comparison.</p></article></div></section>

    <footer className="landing-footer"><div className="brand"><span>V</span><div><strong>VECTOR</strong><small>Engagement Lab</small></div></div><p>Educational simulation using public-data assumptions. Not a verified performance or operational prediction.</p><Link href="/scenarios">Browse scenarios <ArrowRight size={14}/></Link></footer>
  </main>;
}

function Journey({number,icon:Icon,title,copy}:{number:string;icon:typeof Play;title:string;copy:string}){return <article className="journey-card"><div><span>{number}</span><Icon size={18}/></div><h3>{title}</h3><p>{copy}</p></article>}
function Feature({icon:Icon,title,copy}:{icon:typeof Play;title:string;copy:string}){return <article><Icon size={18}/><div><h3>{title}</h3><p>{copy}</p></div></article>}
