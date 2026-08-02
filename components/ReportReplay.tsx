"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SimulationScene } from "@/components/SimulationScene";
import { getFrameAt, PROFILES, simulate, type ProfileId, type Scenario, type SimulationResult } from "@/lib/simulation";

export function ReportReplay({ scenario, result }: { scenario: Scenario; result: SimulationResult }) {
  const [time, setTime] = useState(() => Math.min(result.timeOfFlight * .42, result.timeOfFlight));
  const [playing, setPlaying] = useState(false);
  const frame = getFrameAt(result, time);
  const comparison = useMemo(() => (Object.keys(PROFILES) as ProfileId[]).map((id) => ({ id, result: simulate(scenario, id) })), [scenario]);

  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    let previous = performance.now();
    let accumulated = 0;
    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      accumulated += delta;
      if (accumulated >= 1 / 30) {
        const elapsed = accumulated;
        accumulated = 0;
        setTime((current) => {
          const next = current + elapsed;
          if (next >= result.timeOfFlight) {
            setPlaying(false);
            return result.timeOfFlight;
          }
          return next;
        });
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, result.timeOfFlight]);

  return <section className="report-replay">
    <header><div><span>Three-dimensional result</span><strong>Engagement geometry replay</strong></div><p>Drag to orbit. The view uses abstract symbols and the exact run recorded in this report.</p></header>
    <div className="report-replay-stage">
      <SimulationScene result={result} time={time} profile={scenario.profile} layers={{ interceptor: true, target: true, lineOfSight: true }}/>
      <div className="report-replay-metrics"><ReportReplayMetric label="Time" value={`${time.toFixed(1)} s`}/><ReportReplayMetric label="Phase" value={frame.phase}/><ReportReplayMetric label="Range" value={`${(frame.range / 1000).toFixed(1)} km`}/><ReportReplayMetric label="Energy" value={`${Math.round(frame.energy)}%`}/></div>
      <div className="report-replay-key"><span><i className="blue-force"/>Interceptor</span><span><i className="report-track"/>Target</span><span><i className="report-los"/>Line of sight</span></div>
    </div>
    <div className="report-replay-controls">
      <button aria-label={playing ? "Pause report replay" : "Play report replay"} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
      <button aria-label="Restart report replay" onClick={() => { setPlaying(false); setTime(0); }}><RotateCcw size={14}/></button>
      <input aria-label="Report replay timeline" type="range" min={0} max={result.timeOfFlight || 1} step={.1} value={time} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }}/>
      <span>{time.toFixed(1)} / {result.timeOfFlight.toFixed(1)} s</span>
    </div>
    <div className="report-profile-results"><header><span>Profile sensitivity</span><strong>Same scenario, three abstract profiles</strong></header><div>{comparison.map(({ id, result: profileResult }) => <article className={profileResult.outcome==="Intercept"?"success":"caution"} key={id}><i className={`profile-${id}`}/><span>{PROFILES[id].short}</span><strong>{profileResult.outcome}</strong><dl><dt>Closest</dt><dd>{Math.round(profileResult.closestApproach)} m</dd><dt>Flight time</dt><dd>{profileResult.timeOfFlight.toFixed(1)} s</dd><dt>End speed</dt><dd>{Math.round(profileResult.endSpeed)} m/s</dd></dl></article>)}</div></div>
  </section>;
}

function ReportReplayMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
