import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";

const facts = [
  ["Runs fully in your browser", "No login is required for the current public demo."],
  ["Physics and visual replay", "Vector combines deterministic physics, map and 3D playback, telemetry, and reports."],
  ["Inputs stay visible", "Each run shows what was loaded, what was calculated, and where assumptions remain."],
];

const faq = [
  ["Is this a real-world performance prediction?", "No. The current public studies use generic educational models. Named aircraft and weapons are presentation context unless a model pack is explicitly admitted."],
  ["Why open source?", "Open code lets people inspect assumptions, reproduce results, find errors, and contribute better models."],
  ["What is coming next?", "Admitted radar and sensor models, two-sided weapon employment, richer aircraft physics, and bounded virtual pilots."],
];

export default function AboutPage() {
  return <main className="about-page">
    <ProductHeader current="about" />
    <section className="about-hero">
      <span>ABOUT VECTOR</span>
      <h1>We are building a realistic warfare simulation platform.</h1>
      <p>Vector is an open source place to build, run, inspect, and compare combat simulations in a web browser.</p>
      <Link href="/scenarios">Open an available simulation <ArrowRight size={14}/></Link>
    </section>
    <section className="about-facts" aria-label="What Vector provides">
      {facts.map(([title, copy]) => <article key={title}><Check size={16}/><div><h2>{title}</h2><p>{copy}</p></div></article>)}
    </section>
    <section className="about-open-source">
      <span>OPEN SOURCE</span>
      <h2>Build trust through inspection.</h2>
      <p>Simulation claims should be testable. Open source gives users and researchers a shared record of the code, data, assumptions, tests, and limits behind each result.</p>
    </section>
    <section className="about-faq" aria-labelledby="about-faq-title">
      <header><span>FAQ</span><h2 id="about-faq-title">Three short answers.</h2></header>
      <div>{faq.map(([question, answer]) => <article key={question}><h3>{question}</h3><p>{answer}</p></article>)}</div>
    </section>
  </main>;
}
