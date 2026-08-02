"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SimulationScene } from "@/components/SimulationScene";
import { PrintTrajectory } from "@/components/PrintTrajectory";
import {
  buildRaspTrack,
  getFrameAt,
  getProfile,
  type Scenario,
  type SimulationResult,
} from "@/lib/simulation";

export function ReportReplay({
  scenario,
  result,
}: {
  scenario: Scenario;
  result: SimulationResult;
}) {
  const [time, setTime] = useState(() =>
    Math.min(result.timeOfFlight * 0.42, result.timeOfFlight),
  );
  const [playing, setPlaying] = useState(false);
  const frame = getFrameAt(result, time);
  const iafTrack = useMemo(
    () => buildRaspTrack(scenario, frame, "IAF"),
    [frame, scenario],
  );
  const pafTrack = useMemo(
    () => buildRaspTrack(scenario, frame, "PAF"),
    [frame, scenario],
  );
  const profile = getProfile(scenario);
  const airCombat = scenario.domain === "A2A";

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

  return (
    <section className="report-replay">
      <header>
        <div>
          <span>Three-dimensional result</span>
          <strong>Engagement geometry replay</strong>
        </div>
        <p>
          Drag to orbit. Standardized markers show the exact run recorded in
          this report without requiring asset artwork.
        </p>
      </header>
      <div className="report-replay-stage">
        <SimulationScene
          result={result}
          time={time}
          profile={scenario.profile}
          layers={{ interceptor: true, target: true, lineOfSight: true }}
        />
        <div className="report-replay-metrics">
          <ReportReplayMetric label="Time" value={`${time.toFixed(1)} s`} />
          <ReportReplayMetric label="Phase" value={frame.phase} />
          <ReportReplayMetric
            label="3D separation"
            value={`${(frame.range / 1000).toFixed(1)} km`}
          />
          <ReportReplayMetric
            label="Weapon speed"
            value={`${Math.round(frame.speed)} m/s`}
          />
          <ReportReplayMetric label="Mach" value={frame.mach.toFixed(2)} />
        </div>
        <div className="report-replay-key">
          <span>
            <i className="blue-force" />
            {airCombat ? "Friendly interceptor" : "Blue flight vehicle"}
          </span>
          <span>
            <i className="red-force" />
            {airCombat ? "Opposing track" : "Fixed objective"}
          </span>
          <span>
            <i className="report-los" />
            Line of sight
          </span>
        </div>
      </div>
      <PrintTrajectory
        result={result}
        fixedObjective={!airCombat && scenario.targetSpeed === 0}
      />
      <div className="report-replay-controls">
        <button
          aria-label={playing ? "Pause report replay" : "Play report replay"}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          aria-label="Restart report replay"
          onClick={() => {
            setPlaying(false);
            setTime(0);
          }}
        >
          <RotateCcw size={14} />
        </button>
        <input
          aria-label="Report replay timeline"
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
        <span>
          {time.toFixed(1)} / {result.timeOfFlight.toFixed(1)} s
        </span>
      </div>
      <div className="report-profile-results">
        <header>
          <span>
            {airCombat
              ? `What each side could see at ${time.toFixed(1)} s`
              : "Recorded model state and declared assumptions"}
          </span>
          <strong>
            {airCombat
              ? "Model Truth remains separate from both air pictures"
              : "Fixed-objective runs do not generate an air situation picture"}
          </strong>
        </header>
        <div>
          {airCombat ? (
            <>
              <article>
                <i className="profile-medium" />
                <span>IAF RASP · {iafTrack.trackId}</span>
                <strong>{iafTrack.status}</strong>
                <dl>
                  <dt>Source</dt>
                  <dd>{iafTrack.source}</dd>
                  <dt>Confidence</dt>
                  <dd>{iafTrack.confidence}%</dd>
                  <dt>Uncertainty</dt>
                  <dd>±{iafTrack.uncertaintyMeters} m</dd>
                </dl>
              </article>
              <article>
                <i className="profile-sustained" />
                <span>PAF RASP · {pafTrack.trackId}</span>
                <strong>{pafTrack.status}</strong>
                <dl>
                  <dt>Source</dt>
                  <dd>{pafTrack.source}</dd>
                  <dt>Confidence</dt>
                  <dd>{pafTrack.confidence}%</dd>
                  <dt>Uncertainty</dt>
                  <dd>±{pafTrack.uncertaintyMeters} m</dd>
                </dl>
              </article>
            </>
          ) : (
            <>
              <article>
                <i className="profile-medium" />
                <span>Objective state</span>
                <strong>
                  {scenario.targetSpeed === 0 ? "Fixed" : "Moving"}
                </strong>
                <dl>
                  <dt>Starting distance</dt>
                  <dd>{scenario.range / 1000} km</dd>
                  <dt>Elevation difference</dt>
                  <dd>{scenario.targetDelta} m</dd>
                </dl>
              </article>
              <article>
                <i className="profile-sustained" />
                <span>Flight configuration</span>
                <strong>{scenario.guidance} path</strong>
                <dl>
                  <dt>Environmental loss</dt>
                  <dd>{scenario.wind}</dd>
                  <dt>Model seed</dt>
                  <dd>{scenario.seed}</dd>
                </dl>
              </article>
            </>
          )}
          <article>
            <i className="profile-short" />
            <span>Weapon study model</span>
            <strong>{profile.name}</strong>
            <dl>
              <dt>Study limit</dt>
              <dd>{profile.maxRange} km</dd>
              <dt>Powered flight</dt>
              <dd>{profile.burn} s</dd>
              <dt>Status</dt>
              <dd>Assumption</dd>
            </dl>
          </article>
        </div>
      </div>
    </section>
  );
}

function ReportReplayMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
