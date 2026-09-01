"use client";

import Link from "next/link";
import { ArrowRight, Crosshair, Map, Shield, Target } from "lucide-react";
import { DOMAIN_DETAILS, SCENARIO_LIBRARY } from "@/lib/scenarios";
import { domainCapability } from "@/lib/runtime/deployment-capabilities";

const DOMAIN_ICONS = { A2A: Crosshair, A2G: Target, G2A: Shield, G2G: Map };

export function ScenarioLibrary({ compact = false }: { compact?: boolean }) {
  const admitted = SCENARIO_LIBRARY.filter(
    (item) => domainCapability(item.domain).state === "ENABLED",
  );
  const visible = compact ? admitted.slice(0, 3) : admitted;

  return <div className={compact ? "scenario-library compact" : "scenario-library"}>
    <div className="scenario-card-grid">
      {visible.map((item) => {
        const Icon = DOMAIN_ICONS[item.domain];
        return <article className="scenario-card" key={item.id}>
          <header><span className="scenario-domain"><Icon size={14}/>Air-to-air</span><span>Ready to run</span></header>
          <div className="scenario-card-body"><span>{DOMAIN_DETAILS[item.domain].label}</span><h3>{item.title}</h3><p>{item.summary}</p><dl><div><dt className="force-friendly">Blue Team</dt><dd>{item.blue}</dd></div><div><dt className="force-hostile">Red Team</dt><dd>{item.red}</dd></div><div><dt>Target object</dt><dd>{item.targetProfile}</dd></div><div><dt>Map setting</dt><dd>{item.theatre}</dd></div></dl></div>
          <footer><span>Scenario {item.version}</span><Link href={`/workbench?scenario=${item.id}`}>Review and run <ArrowRight size={13}/></Link></footer>
        </article>;
      })}
    </div>
    <div className="semantic-legend"><span><i className="friendly-key"/>Blue Team</span><span><i className="hostile-key"/>Red Team</span><span><i className="validated-key"/>Ready to run</span><span><i className="assumption-key"/>Limits shown</span></div>
  </div>;
}
