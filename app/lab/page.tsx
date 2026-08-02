"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, CircleAlert, CircleHelp, CircleX, Copy, Eye, EyeOff,
  FileText, Flag, Gauge, Layers3, Pause, Play, RotateCcw, Save, Settings2,
  ShieldCheck, Sparkles, Target, TriangleAlert,
} from "lucide-react";
import { LabHome } from "@/components/LabHome";
import { SimulationScene } from "@/components/SimulationScene";
import { TelemetryChart } from "@/components/TelemetryChart";
import { canConduct, validateScenario, type ValidationItem } from "@/lib/scenario-validation";
import { getScenarioDefinition, type ScenarioDefinition } from "@/lib/scenarios";
import {
  explainResult, getFrameAt, getProfile, getProfiles, simulate,
  type ProfileId, type Scenario, type SimulationResult,
} from "@/lib/simulation";

type Workspace = "configure" | "run" | "results";
type EventItem = { id:number; time:number; type:"run"|"fault"|"observation"; title:string; detail:string };
const CONFIGURE_STEPS = ["Brief", "Forces", "Flight", "Conditions", "Review"];

export default function LabPage(){
  const searchParams=useSearchParams();
  const scenarioId=searchParams.get("scenario");
  if(!scenarioId)return <LabHome/>;
  return <LabWorkbench definition={getScenarioDefinition(scenarioId)} startStep={searchParams.get("start")==="guided"?0:4}/>;
}

function LabWorkbench({definition,startStep}:{definition:ScenarioDefinition;startStep:number}){
  const [scenario,setScenario]=useState<Scenario>(()=>({...definition.scenario}));
  const [result,setResult]=useState(()=>simulate(definition.scenario));
  const [workspace,setWorkspace]=useState<Workspace>("configure");
  const [buildStep,setBuildStep]=useState(startStep);
  const [hasRun,setHasRun]=useState(false);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const [speed,setSpeed]=useState(1);
  const [advanced,setAdvanced]=useState(false);
  const [layers,setLayers]=useState({interceptor:true,target:true,lineOfSight:true});
  const [comparison,setComparison]=useState<Record<ProfileId,SimulationResult>|null>(null);
  const [events,setEvents]=useState<EventItem[]>([{id:1,time:0,type:"run",title:"Setup loaded",detail:`${definition.title} · template ${definition.version}`}]);
  const [conditionArmed,setConditionArmed]=useState(false);
  const [saved,setSaved]=useState(false);
  const validations=useMemo(()=>validateScenario(definition,scenario),[definition,scenario]);
  const profiles=getProfiles(scenario.domain);
  const selectedProfile=profiles[scenario.profile];

  const run=useCallback(()=>{
    const checks=validateScenario(definition,scenario);
    if(!canConduct(checks)){setWorkspace("configure");setBuildStep(4);return}
    const next=simulate(scenario);
    setResult(next);setTime(0);setPlaying(true);setWorkspace("run");setComparison(null);setHasRun(true);
    setEvents(items=>[...items,{id:Date.now(),time:0,type:"run",title:"Baseline run started",detail:`${getProfile(scenario).name} · ${scenario.guidance} path · ${scenario.range/1000} km`}]);
  },[definition,scenario]);

  useEffect(()=>{if(!playing)return;let animation=0;let previous=performance.now();let accumulated=0;const tick=(now:number)=>{const delta=(now-previous)/1000;previous=now;accumulated+=delta;if(accumulated>=1/30){const elapsed=accumulated;accumulated=0;setTime(current=>{const next=current+elapsed*speed;if(next>=result.timeOfFlight){setPlaying(false);return result.timeOfFlight}return next})}animation=requestAnimationFrame(tick)};animation=requestAnimationFrame(tick);return()=>cancelAnimationFrame(animation)},[playing,result.timeOfFlight,speed]);
  useEffect(()=>{const keys=(event:KeyboardEvent)=>{if(event.key===" "){event.preventDefault();setPlaying(value=>!value)}if(event.key==="Enter")run();if(event.key==="ArrowRight")setTime(value=>Math.min(result.timeOfFlight,value+.5));if(event.key==="ArrowLeft")setTime(value=>Math.max(0,value-.5))};window.addEventListener("keydown",keys);return()=>window.removeEventListener("keydown",keys)},[result.timeOfFlight,run]);

  const frame=useMemo(()=>getFrameAt(result,time),[result,time]);
  const injectCondition=()=>{
    const changed=definition.preparedEvent.physicsEffect==="guidance-hold"
      ? {...scenario,guidanceInterruptionAt:time,guidanceInterruptionDuration:definition.preparedEvent.duration}
      : {...scenario,lossIncreaseAt:time,lossIncreaseAmount:8};
    setScenario(changed);setResult(simulate(changed));setConditionArmed(false);setComparison(null);
    setEvents(items=>[...items,{id:Date.now(),time,type:"fault",title:definition.preparedEvent.title,detail:definition.preparedEvent.description}]);
  };
  const addObservation=()=>setEvents(items=>[...items,{id:Date.now(),time,type:"observation",title:"Observation saved",detail:"This model time was marked for the Results timeline."}]);
  const compare=()=>{setComparison({short:simulate(scenario,"short"),medium:simulate(scenario,"medium"),sustained:simulate(scenario,"sustained")});setPlaying(false)};
  const resetRun=()=>{const baseline={...scenario,guidanceInterruptionAt:null,lossIncreaseAt:null};setScenario(baseline);setResult(simulate(baseline));setTime(0);setPlaying(false);setComparison(null);setEvents([{id:Date.now(),time:0,type:"run",title:"Run reset",detail:"Returned to the configured baseline."}])};
  const saveReport=()=>{const payload={scenario,result,events,createdAt:new Date().toISOString(),engine:"browser-point-mass-v0.3",profileVersion:`${definition.domain.toLowerCase()}-profiles-v0.3`,libraryScenario:{id:definition.id,version:definition.version,domain:definition.domain,title:definition.title,scope:definition.scope,targetProfile:definition.targetProfile,theatre:definition.theatre,blue:definition.blue,red:definition.red,environment:definition.environment}};localStorage.setItem("vector:last-report",JSON.stringify(payload));setSaved(true)};

  return <main className="lab-shell">
    <header className="lab-header">
      <Link href="/lab" className="back-link"><ArrowLeft size={15}/>Lab Home</Link>
      <div className="scenario-name"><span>{definition.domain} · Configured template {definition.version}</span><strong>{scenario.name}</strong></div>
      <nav aria-label="Experiment workflow">
        <button className={workspace==="configure"?"active":""} onClick={()=>setWorkspace("configure")}>Configure</button>
        <button className={workspace==="run"?"active":""} onClick={run}>Run</button>
        <button disabled={!hasRun} className={workspace==="results"?"active":""} onClick={()=>setWorkspace("results")}>Results</button>
      </nav>
      <div className="lab-actions"><span><ShieldCheck size={14}/>Educational model</span><button onClick={saveReport}><Save size={14}/>{saved?"Saved":"Save run"}</button>{hasRun&&<Link href="/report" onClick={saveReport}><FileText size={14}/>Report</Link>}</div>
    </header>
    <div className="lab-notice"><CircleAlert size={13}/><span>{definition.scope} Public-data approximation; model assumptions are shown before the run.</span></div>

    {workspace==="configure"&&<ConfigureWorkspace definition={definition} scenario={scenario} setScenario={setScenario} advanced={advanced} setAdvanced={setAdvanced} step={buildStep} setStep={setBuildStep} validations={validations} run={run}/>}
    {workspace==="results"&&<ResultsWorkspace definition={definition} scenario={scenario} result={result} events={events} saveReport={saveReport}/>}
    {workspace==="run"&&<section className="session-layout">
      <aside className="session-left">
        <div className="session-heading"><span>Advanced experiment tools</span><strong>Run 01 · {playing?"Playing":"Paused"}</strong></div>
        <section><h2>Condition injection</h2><button className={conditionArmed?"fault active":"fault"} onClick={()=>setConditionArmed(value=>!value)}><TriangleAlert size={15}/><span><strong>{definition.preparedEvent.title}</strong><small>{definition.preparedEvent.description}</small></span><em>{conditionArmed?"ARMED":"AVAILABLE"}</em></button>{conditionArmed&&<button className="inject" onClick={injectCondition}>Apply at {time.toFixed(1)} s</button>}</section>
        <section><h2>Run tools</h2><button className="tool-button" onClick={addObservation}><Flag size={15}/>Mark observation</button><button className="tool-button" onClick={()=>setPlaying(false)}><Pause size={15}/>Pause run</button><button className="tool-button" onClick={resetRun}><RotateCcw size={15}/>Reset to baseline</button></section>
        <section><h2>Comparison set</h2>{definition.runVariants.map((variant,index)=><div className="run-file" key={variant.title}><span>{variant.title}</span><strong>{index===0?"CURRENT":"READY"}</strong></div>)}</section>
      </aside>
      <section className="simulation-column">
        <div className="sim-topline"><div><span>Model truth view</span><strong>{selectedProfile.name} · {scenario.guidance} path</strong></div><div className="live-metrics"><Metric label="Time" value={`${time.toFixed(1)} s`}/><Metric label="3D separation" value={`${(frame.range/1000).toFixed(1)} km`}/><Metric label="Vehicle speed" value={`${Math.round(frame.speed)} m/s`}/><Metric label="Speed index" value={`${Math.round(frame.energy)}%`}/></div></div>
        <div className="scene-wrap"><SimulationScene result={result} time={time} profile={scenario.profile} layers={layers}/><div className="symbol-key"><span><i className="friendly-symbol"/>Friendly origin</span><span><i className="track-symbol"/>Opposing {definition.targetMotion==="fixed"?"objective":"track"}</span><span><i className="interceptor-symbol"/>Modeled vehicle</span></div><div className="view-note">Abstract geometry · drag to orbit · scroll to zoom</div></div>
        <Playback result={result} time={time} setTime={setTime} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}/>
        <div className="telemetry"><div className="telemetry-title"><strong>Flight telemetry</strong><span><i className="speed-line"/>Speed</span><span><i className="energy-line"/>Speed index</span></div><TelemetryChart result={result} time={time}/></div>
      </section>
      <aside className="session-right">
        <Outcome result={result}/>{comparison?<Comparison scenario={scenario} data={comparison}/>:<Geometry frame={frame}/>}<section className="right-card"><div className="right-title"><Layers3 size={15}/><strong>View layers</strong><span>THIS VIEW</span></div>{Object.entries({interceptor:"Modeled-vehicle path",target:definition.targetMotion==="fixed"?"Fixed-objective reference":"Opposing-track path",lineOfSight:"Separation line"}).map(([key,label])=><button className="layer-toggle" key={key} onClick={()=>setLayers(value=>({...value,[key]:!value[key as keyof typeof value]}))}>{layers[key as keyof typeof layers]?<Eye size={14}/>:<EyeOff size={14}/>}<span>{label}</span><em>VIEW</em></button>)}</section><button className="compare-button" onClick={compare}><Copy size={14}/>Compare {definition.domain} profiles <span>CURRENT SETUP</span></button><div className="explain-card"><Sparkles size={16}/><div><strong>Why this result?</strong><p>{explainResult(scenario,result)}</p></div></div>
      </aside>
    </section>}
  </main>;
}

function ConfigureWorkspace({definition,scenario,setScenario,advanced,setAdvanced,step,setStep,validations,run}:{definition:ScenarioDefinition;scenario:Scenario;setScenario:React.Dispatch<React.SetStateAction<Scenario>>;advanced:boolean;setAdvanced:(value:boolean)=>void;step:number;setStep:(value:number)=>void;validations:ValidationItem[];run:()=>void}){
  const update=<K extends keyof Scenario>(key:K,value:Scenario[K])=>setScenario(current=>({...current,[key]:value}));
  const profiles=getProfiles(scenario.domain);const selectedProfile=profiles[scenario.profile];const fixed=definition.targetMotion==="fixed";
  const headings=[
    ["Brief","What is this run comparing?","This library template is already configured. Edit the run name or purpose only when you want a different comparison."],
    ["Forces","What is launching, and what is the objective?","Choose a mission-appropriate vehicle profile. The profile controls the model envelope, powered-flight time, speed, and turn authority."],
    ["Flight","What are the starting flight conditions?","Adjust the starting distance, elevation, and path. The resulting time, separation, and speed are calculated when the run starts."],
    ["Conditions",fixed?"Which fixed-objective conditions apply?":"How does the opposing track move?",fixed?"A fixed objective cannot maneuver. Adjust environmental loss or prepare a condition change.":"Set target motion and prepare a guidance-information interruption."],
    ["Review","Review the configured experiment.","The template is ready to run when every required check passes. Preset rationale explains why the library chose these starting values."],
  ];
  const advance=()=>step===4?run():setStep(step+1);
  return <section className="build-workspace">
    <aside className="build-steps"><span>Configure experiment</span>{CONFIGURE_STEPS.map((label,index)=><button className={index===step?"active":""} key={label} onClick={()=>setStep(index)} aria-current={index===step?"step":undefined}><i>{index+1}</i>{label}{index<step&&<Check size={13}/>}</button>)}</aside>
    <div className="builder">
      <header><span>Configured template · {step+1} of 5 · {headings[step][0]}</span><h1>{headings[step][1]}</h1><p>{headings[step][2]}</p></header>
      {step===0&&<><div className="configured-note"><Check size={16}/><p><strong>Preconfigured by the scenario library.</strong> You can run it unchanged or alter one variable for a controlled comparison.</p></div><label className="field"><span>Run name</span><input value={scenario.name} onChange={event=>update("name",event.target.value)}/></label><label className="field"><span>What this run compares</span><textarea value={scenario.objective} onChange={event=>update("objective",event.target.value)}/></label><div className="guided-options"><span>Optional comparison focus · replaces the run purpose</span>{definition.focusOptions.map(option=><button key={option.title} onClick={()=>update("objective",option.objective)}><Target size={17}/><strong>{option.title}</strong><small>{option.description}</small></button>)}</div></>}
      {step===1&&<section className="authoring-section"><div className="entity-role-grid"><article><span>FRIENDLY FORCE</span><strong>{definition.blue}</strong><p>{fixed?"Launch origin":"Launcher / intercept origin"}</p></article><article><span className="hostile-label">OPPOSING SIDE</span><strong>{definition.red}</strong><p>{definition.targetProfile}</p></article></div><div className="section-label"><span>{fixed?"Flight-vehicle profile":"Interceptor profile"}</span><small>Changes the physics inputs for this run</small></div><div className="profile-choice">{(Object.keys(profiles) as ProfileId[]).map(id=><button key={id} className={scenario.profile===id?"active":""} onClick={()=>update("profile",id)}><i className={`profile-${id}`}/><strong>{profiles[id].short}</strong><small>{profiles[id].name}</small></button>)}</div><article className="profile-explanation"><strong>{selectedProfile.name}</strong><p>{selectedProfile.description}</p><span>Modeled distance envelope: {selectedProfile.maxRange} km · powered flight: {selectedProfile.burn} s</span></article>{scenario.domain==="A2A"||scenario.domain==="A2G"?<div className="advanced-grid"><Range label="Launch-platform speed" value={scenario.launcherSpeed} min={0} max={450} step={5} unit="m/s" onChange={value=>update("launcherSpeed",value)}/>{!fixed&&<Range label="Opposing-track speed" value={scenario.targetSpeed} min={80} max={450} step={5} unit="m/s" onChange={value=>update("targetSpeed",value)}/>}</div>:<div className="fixed-condition"><strong>Surface launch</strong><p>Initial speed is 0 m/s. The powered-flight model accelerates the vehicle after the run begins.</p></div>}</section>}
      {step===2&&<section className="authoring-section"><div className="compact-controls"><Range label="Starting distance" value={scenario.range/1000} min={5} max={170} unit="km" onChange={value=>update("range",value*1000)}/><Range label={fixed?"Launch elevation":"Launch altitude"} value={scenario.altitude} min={0} max={15000} step={10} unit="m" onChange={value=>update("altitude",value)}/><Range label={fixed?"Objective elevation difference":"Target altitude difference"} value={scenario.targetDelta} min={-12000} max={12000} step={10} unit="m" onChange={value=>update("targetDelta",value)}/></div><div className="geometry-choice"><button className={scenario.guidance==="direct"?"active":""} onClick={()=>update("guidance","direct")}><strong>Direct path</strong><small>Guidance points toward the current objective position without a commanded altitude arc.</small></button><button className={scenario.guidance==="loft"?"active":""} onClick={()=>update("guidance","loft")}><strong>Lofted path</strong><small>The model adds a simplified altitude arc before descending toward the objective.</small></button></div><button className="advanced-toggle" onClick={()=>setAdvanced(!advanced)}><Settings2 size={14}/>{advanced?"Hide additional inputs":"Show additional inputs"}</button>{advanced&&<div className="advanced-grid">{!fixed&&<Range label="Starting aspect" value={scenario.aspect} min={0} max={180} step={5} unit="°" onChange={value=>update("aspect",value)}/>}<Range label="Environmental-loss index" value={scenario.wind} min={0} max={40} step={1} unit="index" onChange={value=>update("wind",value)}/></div>}</section>}
      {step===3&&<section className="authoring-section">{fixed?<div className="fixed-condition"><strong>Fixed objective</strong><p>Objective speed is locked to 0 m/s. Evasive turns and g-demand do not apply to this mission set.</p></div>:<><div className="event-choice"><button className={scenario.maneuver==="steady"?"active":""} onClick={()=>update("maneuver","steady")}><strong>Steady course</strong><small>No commanded target turn.</small></button><button className={scenario.maneuver==="break"?"active":""} onClick={()=>update("maneuver","break")}><strong>Defensive break</strong><small>One turn begins after five model seconds.</small></button><button className={scenario.maneuver==="weave"?"active":""} onClick={()=>update("maneuver","weave")}><strong>Weaving turn</strong><small>Alternating simplified turn demand.</small></button></div><Range label="Opposing-track turn demand" value={scenario.targetG} min={0} max={9} step={.5} unit="g" onChange={value=>update("targetG",value)}/></>}<Range label="Baseline environmental-loss index" value={scenario.wind} min={0} max={40} step={1} unit="index" onChange={value=>update("wind",value)}/><article className="prepared-event"><TriangleAlert size={17}/><div><span>AVAILABLE DURING RUN</span><strong>{definition.preparedEvent.title}</strong><p>{definition.preparedEvent.description}</p></div><em>PHYSICS EFFECT</em></article></section>}
      {step===4&&<section className="review-layout"><div className="review-inputs"><div><span>Run purpose</span><strong>{scenario.name}</strong><p>{scenario.objective}</p><button onClick={()=>setStep(0)}>Edit brief</button></div><div><span>Forces</span><strong>{definition.blue} / {definition.red}</strong><p>{selectedProfile.name}</p><button onClick={()=>setStep(1)}>Edit forces</button></div><div><span>Flight</span><strong>{scenario.range/1000} km · {scenario.guidance} path</strong><p>{scenario.altitude} m launch elevation{fixed?"":` · ${scenario.aspect}° aspect`}</p><button onClick={()=>setStep(2)}>Edit flight</button></div><div><span>Conditions</span><strong>{fixed?"Fixed objective":`${scenario.maneuver} · ${scenario.targetG} g`}</strong><p>Environmental-loss index {scenario.wind} · {definition.preparedEvent.title} available</p><button onClick={()=>setStep(3)}>Edit conditions</button></div></div><ValidationList items={validations}/></section>}
      <footer className="builder-actions"><span>{step===4?(canConduct(validations)?"Configuration passes required checks":"Resolve failed checks before running"):"Changes apply to this experiment only"}</span><div>{step>0&&<button className="back-action" onClick={()=>setStep(step-1)}>Back</button>}<button disabled={step===4&&!canConduct(validations)} onClick={advance}>{step===4?<><Play size={15}/>Run baseline</>:<>Next: {CONFIGURE_STEPS[step+1]}</>}</button></div></footer>
    </div>
    <aside className="builder-summary"><span>Configured template</span><dl><dt>Mission set</dt><dd>{definition.domain} · {definition.title}</dd><dt>Friendly force</dt><dd>{definition.blue}</dd><dt>Opposing side</dt><dd>{definition.red}</dd><dt>Selected profile</dt><dd>{selectedProfile.name}</dd><dt>Starting distance</dt><dd>{scenario.range/1000} km</dd><dt>Environment</dt><dd>{definition.environment}</dd></dl><section className="preset-basis"><strong>Why these presets?</strong><p><b>Profile.</b> {definition.presetRationale.profile}</p><p><b>Flight.</b> {definition.presetRationale.geometry}</p><p><b>Conditions.</b> {definition.presetRationale.conditions}</p></section><div><CircleHelp size={15}/><p>{definition.scope}</p></div></aside>
  </section>;
}

function ValidationList({items}:{items:ValidationItem[]}){return <section className="validation-list"><header><span>Required checks</span><strong>{items.filter(item=>item.state==="pass").length} passed · {items.filter(item=>item.state==="error").length} failed</strong></header>{items.map(item=><article className={item.state} key={item.id}>{item.state==="error"?<CircleX size={15}/>:item.state==="warning"?<TriangleAlert size={15}/>:<Check size={15}/>}<div><strong>{item.label}</strong><p>{item.detail}</p></div></article>)}</section>}

function ResultsWorkspace({definition,scenario,result,events,saveReport}:{definition:ScenarioDefinition;scenario:Scenario;result:SimulationResult;events:EventItem[];saveReport:()=>void}){return <section className="debrief-workspace"><header><span>Results</span><h1>{scenario.name}</h1><p>Read the outcome against the configured forces, conditions, and model limits.</p></header><div className="results-overview"><article><span>What was tested</span><strong>{scenario.objective}</strong></article><article><span>Who was involved</span><strong>{definition.blue} / {definition.red}</strong></article><article><span>Conditions</span><strong>{scenario.range/1000} km · {getProfile(scenario).name} · {scenario.guidance}</strong></article><article className={result.successful?"success":"caution"}><span>Model outcome</span><strong>{result.outcome}</strong></article></div><div className="debrief-grid"><article className="debrief-outcome"><span>Explanation</span><h2>{result.outcome}</h2><p>{explainResult(scenario,result)}</p><div><Metric label="Closest separation" value={`${Math.round(result.closestApproach)} m`}/><Metric label="Model time" value={`${result.timeOfFlight.toFixed(1)} s`}/><Metric label="End speed" value={`${Math.round(result.endSpeed)} m/s`}/></div></article><article className="event-log"><h2>Run timeline</h2>{events.map(event=><div key={event.id}><time>{event.time.toFixed(1)} s</time><i className={event.type}/><span><strong>{event.title}</strong><small>{event.detail}</small></span></div>)}</article><article className="debrief-notes"><h2>Experiment notes</h2><textarea defaultValue="Record what changed, what stayed fixed, and which result should be compared next."/><Link href="/report" onClick={saveReport}><FileText size={15}/>Open full report</Link></article></div></section>}

function Range({label,value,min,max,step=1,unit,onChange}:{label:string;value:number;min:number;max:number;step?:number;unit:string;onChange:(value:number)=>void}){return <label className="range-field"><span>{label}</span><output>{Number.isInteger(value)?value:value.toFixed(1)} <small>{unit}</small></output><input type="range" value={value} min={min} max={max} step={step} onChange={event=>onChange(Number(event.target.value))}/></label>}
function Playback({result,time,setTime,playing,setPlaying,speed,setSpeed}:{result:SimulationResult;time:number;setTime:(value:number)=>void;playing:boolean;setPlaying:(value:boolean)=>void;speed:number;setSpeed:(value:number)=>void}){return <div className="playback"><button aria-label="Restart playback" onClick={()=>setTime(0)}><RotateCcw size={14}/></button><button aria-label={playing?"Pause playback":"Play playback"} className="play" onClick={()=>setPlaying(!playing)}>{playing?<Pause size={15}/>:<Play size={15}/>}</button><input aria-label="Run timeline" type="range" min={0} max={result.timeOfFlight||1} step={.1} value={time} onChange={event=>setTime(Number(event.target.value))}/><span>{time.toFixed(1)} / {result.timeOfFlight.toFixed(1)} s</span><div>{[.5,1,2,4].map(value=><button key={value} className={speed===value?"active":""} onClick={()=>setSpeed(value)}>{value}×</button>)}</div></div>}
function Outcome({result}:{result:SimulationResult}){return <section className={`outcome ${result.successful?"success":"caution"}`}><span>Model outcome</span><h2>{result.outcome}</h2><p>{result.reason}</p><div><Metric label="Closest" value={`${Math.round(result.closestApproach)} m`}/><Metric label="Model time" value={`${result.timeOfFlight.toFixed(1)} s`}/><Metric label="End speed" value={`${Math.round(result.endSpeed)} m/s`}/><Metric label="Peak demand" value={`${result.peakDemand.toFixed(1)} g`}/></div></section>}
function Geometry({frame}:{frame:ReturnType<typeof getFrameAt>}){return <section className="right-card"><div className="right-title"><Target size={15}/><strong>Current geometry</strong><span>{frame.phase}</span></div><div className="scope"><i/><b/><small>Relative-position diagram</small></div><div className="geometry-data"><Metric label="LOS rate" value={`${frame.losRate.toFixed(3)} rad/s`}/><Metric label="3D separation" value={`${(frame.range/1000).toFixed(1)} km`}/><Metric label="Speed index" value={`${Math.round(frame.energy)}%`}/></div><p className="derived-note">Calculated by this run. Speed index is vehicle speed normalized to the selected profile; it is not total physical energy.</p></section>}
function Comparison({scenario,data}:{scenario:Scenario;data:Record<ProfileId,SimulationResult>}){const profiles=getProfiles(scenario.domain);return <section className="right-card"><div className="right-title"><Gauge size={15}/><strong>{scenario.domain} profile comparison</strong></div><div className="comparison">{(Object.keys(data) as ProfileId[]).map(id=><div key={id}><strong><i className={`profile-${id}`}/>{profiles[id].short}</strong><span>{data[id].outcome}</span><span>{Math.round(data[id].closestApproach)} m</span><span>{data[id].timeOfFlight.toFixed(1)} s</span></div>)}</div></section>}
function Metric({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><strong>{value}</strong></div>}
