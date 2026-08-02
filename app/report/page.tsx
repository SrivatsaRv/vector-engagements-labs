"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft, BookOpen, Check, Download, Printer, ShieldCheck,
} from "lucide-react";
import { ReportReplay } from "@/components/ReportReplay";
import { DEFAULT_SCENARIO_DEFINITION } from "@/lib/scenarios";
import {
  buildReportExport, reportExportFilename, type ReportData,
} from "@/lib/report-export";
import { PROFILES, simulate } from "@/lib/simulation";

type ActionState = "idle" | "preparing" | "done" | "error";
type PrintState = "idle" | "preparing" | "printing";

const fallback: ReportData = {
  scenario: DEFAULT_SCENARIO_DEFINITION.scenario,
  result: simulate(DEFAULT_SCENARIO_DEFINITION.scenario),
  events: [
    { id: 1, time: 0, type: "run", title: "Scenario initialized", detail: "Guided crossing-target scenario" },
    { id: 2, time: 12.5, type: "observation", title: "Decision point marked", detail: "Geometry began changing rapidly" },
    { id: 3, time: 18, type: "fault", title: "Track quality degraded", detail: "Prepared 8-second fault introduced" },
  ],
  createdAt: "2026-08-02T10:00:00.000Z",
  engine: "browser-point-mass-v0.2",
  profileVersion: "abstract-v0.2",
  libraryScenario: {
    id: DEFAULT_SCENARIO_DEFINITION.id,
    version: DEFAULT_SCENARIO_DEFINITION.version,
    domain: DEFAULT_SCENARIO_DEFINITION.domain,
    title: DEFAULT_SCENARIO_DEFINITION.title,
    scope: DEFAULT_SCENARIO_DEFINITION.scope,
    targetProfile: DEFAULT_SCENARIO_DEFINITION.targetProfile,
    theatre: DEFAULT_SCENARIO_DEFINITION.theatre,
  },
};

export default function ReportPage() {
  const searchParams = useSearchParams();
  const sampleMode = searchParams.get("sample") === "1";
  const [data, setData] = useState<ReportData>(fallback);
  const [exportState, setExportState] = useState<ActionState>("idle");
  const [printState, setPrintState] = useState<PrintState>("idle");

  useEffect(() => {
    if (sampleMode) return;
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem("vector:last-report");
      if (!stored) return;
      try {
        setData(JSON.parse(stored) as ReportData);
      } catch {
        setData(fallback);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sampleMode]);

  useEffect(() => {
    const beforePrint = () => setPrintState("printing");
    const afterPrint = () => setPrintState("idle");
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  const { scenario, result } = data;
  const libraryScenario = data.libraryScenario ?? fallback.libraryScenario!;
  const driver = scenario.maneuver === "steady"
    ? `${scenario.guidance} trajectory and initial range`
    : `${scenario.maneuver} target behaviour and remaining energy`;

  const printReport = () => {
    setPrintState("preparing");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  };

  const exportJson = () => {
    setExportState("preparing");
    try {
      const payload = buildReportExport(data, libraryScenario, sampleMode ? "example" : "last-saved");
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = reportExportFilename(libraryScenario, data.createdAt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 500);
      setExportState("done");
      window.setTimeout(() => setExportState("idle"), 2200);
    } catch {
      setExportState("error");
    }
  };

  return <main className="report-page">
    <header className="report-nav">
      <Link href={`/lab?scenario=${libraryScenario.id}`}><ArrowLeft size={15}/>Back to lab</Link>
      <div className="report-output-actions">
        <span className="report-output-scope">Output · this report</span>
        <button disabled={printState !== "idle"} aria-busy={printState !== "idle"} className={printState === "preparing" ? "is-loading" : ""} onClick={printReport}><Printer size={14}/>{printLabel(printState)}</button>
        <button disabled={exportState === "preparing"} aria-busy={exportState === "preparing"} className={exportState === "error" ? "is-error" : exportState === "preparing" ? "is-loading" : ""} onClick={exportJson}><Download size={14}/>{exportLabel(exportState)}</button>
      </div>
    </header>
    <article className="report-sheet">
      <header>
        <div className="report-brand"><span>V</span><div><strong>VECTOR</strong><small>Engagement Lab</small></div></div>
        <div className="report-id"><span>{sampleMode ? "Example result" : "Last saved session"} · {libraryScenario.domain}</span><strong>VEC–2026–001</strong></div>
      </header>
      <section className="report-title">
        <span>{sampleMode ? "Example report" : "Saved session report"} · {libraryScenario.id}</span>
        <h1>{scenario.name}</h1>
        <p>{scenario.objective}</p>
        <div><span className="report-public-mode"><ShieldCheck size={13}/>Public data mode</span><span><Check size={13}/>Reproducible run</span><span>Generated {formatReportDate(data.createdAt)}</span></div>
      </section>
      <section className="report-summary">
        <div className={result.outcome === "Intercept" ? "report-result success" : "report-result caution"}><span>Model outcome</span><strong>{result.outcome}</strong><p>{result.reason}</p></div>
        <div className="report-metrics"><ReportMetric label="Closest approach" value={`${Math.round(result.closestApproach)} m`}/><ReportMetric label="Time of flight" value={`${result.timeOfFlight.toFixed(1)} s`}/><ReportMetric label="End speed" value={`${Math.round(result.endSpeed)} m/s`}/><ReportMetric label="Peak demand" value={`${result.peakDemand.toFixed(1)} g`}/></div>
      </section>
      <section className="report-findings">
        <div><span>Interpretation</span><strong>{result.outcome === "Intercept" ? "The modeled geometry closed inside the intercept threshold." : "The modeled geometry did not close inside the intercept threshold."}</strong></div>
        <div><span>Primary driver</span><strong>{driver}</strong></div>
        <div><span>Read this as</span><strong>A sensitivity result—not verified system performance.</strong></div>
      </section>
      <ReportReplay scenario={scenario} result={result}/>
      <div className="report-columns">
        <div>
          <ReportSection title="Scenario configuration"><dl><dt>Domain</dt><dd>{libraryScenario.domain}</dd><dt>Target profile</dt><dd>{libraryScenario.targetProfile}</dd><dt>Theatre</dt><dd>{libraryScenario.theatre}</dd><dt>Profile</dt><dd>{PROFILES[scenario.profile].name}</dd><dt>Guidance</dt><dd>{scenario.guidance}</dd><dt>Launch range</dt><dd>{scenario.range / 1000} km</dd><dt>Launch altitude</dt><dd>{scenario.altitude} m</dd><dt>Target altitude Δ</dt><dd>{scenario.targetDelta} m</dd><dt>Target behaviour</dt><dd>{scenario.maneuver}</dd><dt>Wind</dt><dd>{scenario.wind} m/s</dd></dl></ReportSection>
          <ReportSection title="Instructor assessment"><p>The participant recognized the changing geometry and reassessed after the information-quality fault. Repeat with a higher target manoeuvre demand to test transfer of learning.</p><div className="recommendation"><Check size={14}/><span><strong>Recommendation</strong>Repeat with controlled variation</span></div></ReportSection>
        </div>
        <div>
          <ReportSection title="Session timeline"><div className="report-timeline">{data.events.map((event) => <div key={event.id}><time>{event.time.toFixed(1)} s</time><i className={event.type}/><span><strong>{event.title}</strong><small>{event.detail}</small></span></div>)}</div></ReportSection>
          <ReportSection title="Provenance"><dl><dt>Scenario library</dt><dd>{libraryScenario.id} · {libraryScenario.version}</dd><dt>Engine</dt><dd>{data.engine}</dd><dt>Profile library</dt><dd>{data.profileVersion}</dd><dt>Model scope</dt><dd>{libraryScenario.scope}</dd><dt>Random seed</dt><dd>{scenario.seed}</dd><dt>Source class</dt><dd>Public / illustrative</dd><dt>Review state</dt><dd>Demonstration</dd></dl></ReportSection>
        </div>
      </div>
      <section className="report-disclaimer"><BookOpen size={16}/><p>This result is produced by a public-data model using user-selected assumptions. It does not represent verified weapon performance, current operational deployment, or an actual engagement prediction.</p></section>
      <footer><span>VECTOR Engagement Lab</span><span>Public data mode · Reproducible record</span></footer>
    </article>
  </main>;
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="report-section"><h2>{title}</h2>{children}</section>;
}

function formatReportDate(value: string) {
  return value.slice(0, 10);
}

function printLabel(state: PrintState) {
  if (state === "preparing") return "Preparing";
  if (state === "printing") return "Print dialog open";
  return "Print / PDF";
}

function exportLabel(state: ActionState) {
  if (state === "preparing") return "Preparing";
  if (state === "done") return "JSON downloaded";
  if (state === "error") return "Export failed";
  return "Export JSON";
}
