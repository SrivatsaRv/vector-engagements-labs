"use client";

import Link from "next/link";
import { ArrowRight, Crosshair, Map, Shield, Target } from "lucide-react";
import { useState } from "react";
import { DOMAIN_DETAILS, SCENARIO_LIBRARY, type EngagementDomain } from "@/lib/scenarios";

const DOMAINS: EngagementDomain[] = ["A2A", "A2G", "G2A", "G2G"];
const DOMAIN_ICONS = { A2A: Crosshair, A2G: Target, G2A: Shield, G2G: Map };

export function ScenarioLibrary({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState<EngagementDomain | "ALL">(compact ? "ALL" : "A2A");
  const visible = SCENARIO_LIBRARY.filter((item) => {
    if (compact) return SCENARIO_LIBRARY.find((candidate) => candidate.domain === item.domain)?.id === item.id;
    return selected === "ALL" || item.domain === selected;
  });

  return <div className={compact ? "scenario-library compact" : "scenario-library"}>
    {!compact && <nav className="library-filters" aria-label="Filter scenario library">
      <button className={selected === "ALL" ? "active" : ""} onClick={() => setSelected("ALL")}>All scenarios <span>{SCENARIO_LIBRARY.length}</span></button>
      {DOMAINS.map((domain) => <button key={domain} className={selected === domain ? "active" : ""} onClick={() => setSelected(domain)}>{domain}<span>{SCENARIO_LIBRARY.filter((item) => item.domain === domain).length}</span></button>)}
    </nav>}
    <div className="scenario-card-grid">
      {visible.map((item) => {
        const Icon = DOMAIN_ICONS[item.domain];
        return <article className="scenario-card" key={item.id}>
          <header><span className="scenario-domain"><Icon size={14}/>{item.domain}</span><span>{item.complexity}</span></header>
          <div className="scenario-card-body"><span>{DOMAIN_DETAILS[item.domain].label}</span><h3>{item.title}</h3><p>{item.summary}</p><dl><div><dt>Blue</dt><dd>{item.blue}</dd></div><div><dt>Red</dt><dd>{item.red}</dd></div><div><dt>Target</dt><dd>{item.targetProfile}</dd></div><div><dt>Context</dt><dd>{item.theatre}</dd></div></dl></div>
          <footer><span>Model {item.version}</span><Link href={`/lab?scenario=${item.id}`}>Configure run <ArrowRight size={13}/></Link></footer>
        </article>;
      })}
    </div>
  </div>;
}
