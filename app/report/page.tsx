"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft, BookOpen, Check, Download, Printer, ShieldCheck,
} from "lucide-react";
import { DEFAULT_SCENARIO, PROFILES, simulate, type Scenario, type SimulationResult } from "@/lib/simulation";

type ReportData = {
  scenario: Scenario;
  result: SimulationResult;
  events: Array<{ id:number; time:number; type:string; title:string; detail:string }>;
  createdAt: string;
  engine: string;
  profileVersion: string;
};

const fallback: ReportData = {
  scenario: DEFAULT_SCENARIO,
  result: simulate(DEFAULT_SCENARIO),
  events: [
    { id: 1, time: 0, type: "run", title: "Scenario initialized", detail: "Guided crossing-target scenario" },
    { id: 2, time: 12.5, type: "observation", title: "Decision point marked", detail: "Geometry began changing rapidly" },
    { id: 3, time: 18.0, type: "fault", title: "Track quality degraded", detail: "Prepared 8-second fault introduced" },
  ],
  createdAt: "2026-08-02T10:00:00.000Z",
  engine: "browser-point-mass-v0.1",
  profileVersion: "abstract-v0.2",
};

export default function ReportPage(){
  const [data,setData]=useState<ReportData>(fallback);
  useEffect(()=>{const timer=window.setTimeout(()=>{const stored=localStorage.getItem("vector:last-report");if(stored){try{setData(JSON.parse(stored) as ReportData)}catch{setData(fallback)}}},0);return()=>window.clearTimeout(timer)},[]);
  const {scenario,result}=data;
  return <main className="report-page"><header className="report-nav"><Link href="/lab"><ArrowLeft size={15}/>Back to lab</Link><div><button onClick={()=>window.print()}><Printer size={14}/>Print</button><button onClick={()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const href=URL.createObjectURL(blob);const link=document.createElement("a");link.href=href;link.download="vector-scenario-report.json";link.click();URL.revokeObjectURL(href)}}><Download size={14}/>Export JSON</button></div></header><article className="report-sheet"><header><div className="report-brand"><span>V</span><div><strong>VECTOR</strong><small>Engagement Lab</small></div></div><div className="report-id"><span>Session report</span><strong>VEC–2026–001</strong></div></header><section className="report-title"><span>Educational engagement simulation</span><h1>{scenario.name}</h1><p>{scenario.objective}</p><div><span><ShieldCheck size={13}/>Reproducible run</span><span>Generated {new Date(data.createdAt).toLocaleDateString()}</span></div></section><section className="report-summary"><div className={result.outcome==="Intercept"?"report-result success":"report-result caution"}><span>Model outcome</span><strong>{result.outcome}</strong><p>{result.reason}</p></div><div className="report-metrics"><ReportMetric label="Closest approach" value={`${Math.round(result.closestApproach)} m`}/><ReportMetric label="Time of flight" value={`${result.timeOfFlight.toFixed(1)} s`}/><ReportMetric label="End speed" value={`${Math.round(result.endSpeed)} m/s`}/><ReportMetric label="Peak demand" value={`${result.peakDemand.toFixed(1)} g`}/></div></section><div className="report-columns"><div><ReportSection title="Scenario configuration"><dl><dt>Profile</dt><dd>{PROFILES[scenario.profile].name}</dd><dt>Guidance</dt><dd>{scenario.guidance}</dd><dt>Launch range</dt><dd>{scenario.range/1000} km</dd><dt>Launch altitude</dt><dd>{scenario.altitude} m</dd><dt>Target altitude Δ</dt><dd>{scenario.targetDelta} m</dd><dt>Target behaviour</dt><dd>{scenario.maneuver}</dd><dt>Wind</dt><dd>{scenario.wind} m/s</dd></dl></ReportSection><ReportSection title="Instructor assessment"><p>The participant recognized the changing geometry and reassessed after the information-quality fault. Repeat with a higher target manoeuvre demand to test transfer of learning.</p><div className="recommendation"><Check size={14}/><span><strong>Recommendation</strong>Repeat with controlled variation</span></div></ReportSection></div><div><ReportSection title="Session timeline"><div className="report-timeline">{data.events.map(event=><div key={event.id}><time>{event.time.toFixed(1)} s</time><i className={event.type}/><span><strong>{event.title}</strong><small>{event.detail}</small></span></div>)}</div></ReportSection><ReportSection title="Provenance"><dl><dt>Engine</dt><dd>{data.engine}</dd><dt>Profile library</dt><dd>{data.profileVersion}</dd><dt>Random seed</dt><dd>{scenario.seed}</dd><dt>Source class</dt><dd>Public / illustrative</dd><dt>Review state</dt><dd>Demonstration</dd></dl></ReportSection></div></div><section className="report-disclaimer"><BookOpen size={16}/><p>This result is produced by a public-data model using user-selected assumptions. It does not represent verified weapon performance, current operational deployment, or an actual engagement prediction.</p></section><footer><span>VECTOR Engagement Lab</span><span>Page 1 of 1</span></footer></article></main>
}

function ReportMetric({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}
function ReportSection({title,children}:{title:string;children:React.ReactNode}){return <section className="report-section"><h2>{title}</h2>{children}</section>}
