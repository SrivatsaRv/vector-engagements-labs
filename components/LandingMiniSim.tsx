"use client";

import Link from "next/link";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SimulationScene } from "@/components/SimulationScene";
import {
  DOMAIN_DETAILS,
  SCENARIO_LIBRARY,
  type EngagementDomain,
} from "@/lib/scenarios";
import {
  createReferencePreview,
  getFrameAt,
} from "@/lib/simulation";
import { domainCapability } from "@/lib/runtime/deployment-capabilities";

const DOMAINS: EngagementDomain[] = ["A2A", "A2G", "G2A", "G2G"];

export function LandingMiniSim() {
  const [domain, setDomain] = useState<EngagementDomain>("A2A");
  const definition = SCENARIO_LIBRARY.find((item) => item.domain === domain);
  if (!definition || domainCapability(domain).state !== "ENABLED") {
    throw new Error("The landing preview selected an unavailable domain.");
  }
  const result = useMemo(
    () => createReferencePreview(definition.scenario),
    [definition],
  );
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frame = getFrameAt(result, time);

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
          return next >= result.timeOfFlight ? 0 : next;
        });
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, result.timeOfFlight]);

  return (
    <section
      className="landing-sim"
      aria-label="Playable engagement model preview"
    >
      <header className="landing-sim-header">
        <div>
          <span className="live-dot" />
          Example · Reference preview
        </div>
        <strong>{definition.title}</strong>
        <time>{time.toFixed(1).padStart(4, "0")} s</time>
      </header>
      <nav className="landing-sim-domains" aria-label="Engagement domain">
        {DOMAINS.map((item) => (
          (() => {
            const capability = domainCapability(item);
            const unavailable = capability.state !== "ENABLED";
            return (
          <button
            key={item}
            className={domain === item ? "active" : ""}
            disabled={unavailable}
            title={unavailable ? capability.reason : undefined}
            onClick={() => {
              setDomain(item);
              setTime(0);
              setPlaying(true);
            }}
          >
            <strong>{item}</strong>
            <span>{DOMAIN_DETAILS[item].label}</span>
          </button>
            );
          })()
        ))}
      </nav>
      <div className="landing-sim-stage">
        <SimulationScene
          result={result}
          time={time}
          profile={definition.scenario.profile}
          layers={{ interceptor: true, target: true, lineOfSight: true }}
        />
        <div className="landing-sim-readout">
          <span>3D separation</span>
          <strong>{(frame.range / 1000).toFixed(1)} km</strong>
          <span>Weapon speed</span>
          <strong>{Math.round(frame.speed)} m/s</strong>
          <span>Mach</span>
          <strong>{frame.mach.toFixed(2)}</strong>
        </div>
        <div className="landing-sim-entities">
          <span>
            <i className="blue-force" />
            <small>FRIENDLY</small>
            {definition.blue}
          </span>
          <span>
            <i className="red-force" />
            <small>OPPOSING</small>
            {definition.red}
          </span>
        </div>
        <div className="landing-sim-scope">
          <span>{definition.targetProfile}</span>
          <small>{definition.theatre}</small>
        </div>
      </div>
      <footer className="landing-sim-footer">
        <button
          aria-label={playing ? "Pause preview" : "Play preview"}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button aria-label="Restart preview" onClick={() => setTime(0)}>
          <RotateCcw size={14} />
        </button>
        <input
          aria-label="Preview timeline"
          type="range"
          min={0}
          max={result.timeOfFlight || 1}
          step={0.1}
          value={time}
          onChange={(event) => {
            setPlaying(false);
            setTime(Number(event.target.value));
          }}
        />
        <span>{frame.phase}</span>
        <Link href={`/workbench?scenario=${definition.id}`}>
          Open full scenario
        </Link>
      </footer>
    </section>
  );
}
