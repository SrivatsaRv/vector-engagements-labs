import { BookOpen, Database, ShieldCheck } from "lucide-react";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";
import { ProductHeader } from "@/components/ProductHeader";

export default function ScenariosPage() {
  return <main className="library-page">
    <ProductHeader current="scenarios"/>
    <section className="library-page-intro"><div><span className="overline">Versioned training templates</span><h1>Choose the problem.<br/>Then test the assumptions.</h1></div><div><p>These scenarios configure the same simulation and reporting workflow used by the Instructor Station. Each one names its model scope before you begin.</p><div className="library-trust"><span><Database size={14}/>Stored as typed definitions</span><span><ShieldCheck size={14}/>Synthetic sites only</span><span><BookOpen size={14}/>Provenance in every report</span></div></div></section>
    <section className="library-page-content"><ScenarioLibrary/></section>
    <section className="library-policy"><strong>Regional context policy</strong><p>Generalized South Asian terrain may be used for educational visualization. Precise current base coordinates, operational routes and named-system strike solutions are excluded.</p></section>
  </main>;
}
