import Link from "next/link";
import {
  ArrowRight, Check, FileText,
  GitCompare, Play, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { LandingMiniSim } from "@/components/LandingMiniSim";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";
import { ProductHeader } from "@/components/ProductHeader";

export default function LandingPage() {
  return <main className="landing">
    <ProductHeader/>

    <section className="hero">
      <div className="hero-copy"><span className="overline">Web-based combat simulation</span><h1><span>Build the scenario.</span><span>Run the fight.</span></h1><p>Pick both sides, set where and how they meet, then run it. Replay every move on the map or in 3D and see what caused the result.</p><div className="hero-actions"><Link href="/scenarios" className="primary-link"><Play size={16}/>Pick a scenario</Link><Link href="/report?sample=1" className="secondary-link"><FileText size={16}/>Open sample report</Link></div><div className="trust-row"><span><Check size={13}/>Runs in your browser</span><span><Check size={13}/>Live 3D replay</span><span><Check size={13}/>Inputs and math shown</span></div></div>
      <LandingMiniSim/>
    </section>

    <section className="proof-strip"><span>ENTER</span><i/><span>CONSTRUCT</span><i/><span>SIMULATE</span><i/><span>OBSERVE</span><i/><span>EXPLAIN</span><i/><span>COMPARE</span><i/><span>REPORT</span></section>

    <section className="scenario-section" id="scenarios"><div className="scenario-section-heading"><div><span className="overline">Available simulations</span><h2>Start with a run that works.</h2></div><div><p>Choose one of the admitted air-to-air studies. Both sides, weapons, location, weather, and starting positions are already loaded.</p><Link href="/scenarios">View available simulations <ArrowRight size={14}/></Link></div></div><ScenarioLibrary compact/></section>

    <section className="landing-section" id="how"><div className="section-heading"><span>How it works</span><h2>Pick. Change. Run. Review.</h2><p>Start with a complete scenario. Change one object or condition, run it, and inspect the difference.</p></div><div className="journey-grid"><Journey number="01" icon={SlidersHorizontal} title="Pick" copy="Choose a scenario with both sides and the starting conditions already loaded."/><Journey number="02" icon={Play} title="Change" copy="Edit aircraft, weapons, positions, weather, sensors, and team decisions."/><Journey number="03" icon={GitCompare} title="Run" copy="Watch the same run on the map and in 3D. Follow its timeline and telemetry."/><Journey number="04" icon={FileText} title="Review" copy="See what happened, why it happened, and save the full run as a report."/></div></section>

    <section className="open-source-section"><div><span className="overline">Open source by design</span><h2>Inspect the model. Reproduce the run.</h2></div><div><p>Open code makes assumptions visible, lets others test the same result, and gives researchers a clear path to contribute better models.</p><Link href="/about">Why we are building Vector <ArrowRight size={14}/></Link></div></section>

    <section className="method-section" id="method"><div><ShieldCheck size={22}/><h2>No black box.</h2></div><div className="method-points"><article><strong>Know what was loaded</strong><p>See the aircraft, systems, weapons, and public sources used by the run.</p></article><article><strong>Know what was calculated</strong><p>Facts, model inputs, and limits are shown separately. A model result is never presented as a real-world claim.</p></article><article><strong>Run it again</strong><p>The saved run keeps both teams, loadouts, weather, decisions, events, telemetry, and model version together.</p></article></div></section>

    <footer className="landing-footer"><div className="brand"><span>V</span><div><strong>Vector</strong><small>Engagement Labs</small></div></div><p>Built for learning and comparison. Results are not real-world performance predictions.</p><Link href="/about">About Vector <ArrowRight size={14}/></Link></footer>
  </main>;
}

function Journey({number,icon:Icon,title,copy}:{number:string;icon:typeof Play;title:string;copy:string}){return <article className="journey-card"><div><span>{number}</span><Icon size={18}/></div><h3>{title}</h3><p>{copy}</p></article>}
