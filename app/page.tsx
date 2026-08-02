import Link from "next/link";
import {
  ArrowRight, Boxes, Check, CircleDot, FileText, GitBranch,
  GitCompare, Play, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { LandingMiniSim } from "@/components/LandingMiniSim";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";
import { ProductHeader } from "@/components/ProductHeader";

export default function LandingPage() {
  return <main className="landing">
    <ProductHeader/>

    <section className="hero">
      <div className="hero-copy"><span className="overline">Browser-based engagement experiments</span><h1>Understand the engagement.<br/>Not just the outcome.</h1><p>Choose an air or surface engagement, select the Blue Team and Red Team objects, adjust the starting conditions, and compare the result. Every run shows which inputs were calculated and which effects remain outside the model.</p><div className="hero-actions"><Link href="/scenarios" className="primary-link"><Play size={16}/>Choose a scenario</Link><Link href="/report?sample=1" className="secondary-link"><FileText size={16}/>View sample report</Link></div><div className="trust-row"><span><Check size={13}/>No install</span><span><Check size={13}/>Live model preview</span><span><Check size={13}/>Assumptions visible</span></div></div>
      <LandingMiniSim/>
    </section>

    <section className="proof-strip"><span>ENTER</span><i/><span>CONSTRUCT</span><i/><span>SIMULATE</span><i/><span>OBSERVE</span><i/><span>EXPLAIN</span><i/><span>COMPARE</span><i/><span>REPORT</span></section>

    <section className="scenario-section" id="scenarios"><div className="scenario-section-heading"><div><span className="overline">Scenario library · ready starting points</span><h2>Begin with the engagement type.</h2></div><div><p>Choose Air Intercept, Air-to-Surface, Surface-to-Air Defence, or Surface Strike. Each scenario opens with named Blue Team and Red Team objects, starting geometry, and conditions already configured.</p><Link href="/scenarios">View all scenarios <ArrowRight size={14}/></Link></div></div><ScenarioLibrary compact/></section>

    <section className="landing-section" id="how"><div className="section-heading"><span>One clear loop</span><h2>Built for curious minds,<br/>not aerospace specialists.</h2><p>Start from a complete scenario. Replace an object or change one condition; the model explains the resulting geometry and outcome.</p></div><div className="journey-grid"><Journey number="01" icon={SlidersHorizontal} title="Enter" copy="Choose a complete template and read the engagement question, forces, and declared model limits."/><Journey number="02" icon={Play} title="Construct" copy="Adjust the Blue Team, Red Team, loadouts, starting flight state, information picture, and decisions."/><Journey number="03" icon={GitCompare} title="Simulate & observe" copy="Run the fixed-step model and inspect synchronized map, 3D, RASP, timeline, and telemetry views."/><Journey number="04" icon={FileText} title="Explain, compare & report" copy="Read why the result occurred, rerun a controlled variant, then save the exact frames and sources."/></div></section>

    <section className="instructor-section" id="advanced"><div className="instructor-copy"><span className="overline">Advanced when you need it</span><h2>Turn one run into a proper experiment.</h2><p>The same VECTOR workspace can hold controlled variations, repeatable runs, injected conditions, comparisons, and a shareable result—without switching to a different user mode.</p><Link href="/workbench?scenario=a2a-crossing-intercept">Open the experiment workspace <ArrowRight size={14}/></Link></div><div className="instructor-board"><Feature icon={GitBranch} title="Scenario variants" copy="Save alternate objects, starting geometry, flight paths, or target behaviour."/><Feature icon={Boxes} title="Repeatable run sets" copy="Run a baseline and named variations from recorded starting conditions."/><Feature icon={CircleDot} title="Condition injection" copy="Introduce a prepared information or environmental change and record when it occurred."/><Feature icon={FileText} title="Replay and report" copy="Review the timeline, compare outcomes, explain the result, and preserve the evidence."/></div></section>

    <section className="method-section" id="method"><div><ShieldCheck size={22}/><h2>Confidence through transparency</h2></div><div className="method-points"><article><strong>Named objects, sourced fields</strong><p>Aircraft variants, fitted systems, weapons, and compatibility records show their public sources and research gaps.</p></article><article><strong>Facts and assumptions stay separate</strong><p>Published facts never become a universal launch zone or motor curve. Every study boundary is labeled as a model assumption.</p></article><article><strong>Reproducible by design</strong><p>Teams, loadouts, sensor states, atmosphere, decisions, events, telemetry, and model versions are frozen with the saved run.</p></article></div></section>

    <footer className="landing-footer"><div className="brand"><span>V</span><div><strong>VECTOR</strong><small>Engagement Lab</small></div></div><p>Educational simulation using public-data assumptions. Not a verified performance or operational prediction.</p><Link href="/scenarios">Browse scenarios <ArrowRight size={14}/></Link></footer>
  </main>;
}

function Journey({number,icon:Icon,title,copy}:{number:string;icon:typeof Play;title:string;copy:string}){return <article className="journey-card"><div><span>{number}</span><Icon size={18}/></div><h3>{title}</h3><p>{copy}</p></article>}
function Feature({icon:Icon,title,copy}:{icon:typeof Play;title:string;copy:string}){return <article><Icon size={18}/><div><h3>{title}</h3><p>{copy}</p></div></article>}
