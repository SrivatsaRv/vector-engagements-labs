import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ProductHeader({ current }: { current?: "scenarios" | "math" | "symbols" | "blog" }) {
  return <header className="landing-nav product-header">
    <Link href="/" className="brand"><span>V</span><div><strong>Vector</strong><small>Engagement Labs</small></div></Link>
    <nav aria-label="Product navigation">
      <Link className={current === "scenarios" ? "active" : ""} href="/scenarios">Scenarios</Link>
      <Link href="/#how">How it works</Link>
      <Link href="/#advanced">Advanced tools</Link>
      <Link className={current === "symbols" ? "active" : ""} href="/symbols">Symbols</Link>
      <Link className={current === "math" ? "active" : ""} href="/math">Math</Link>
      <Link className={current === "blog" ? "active" : ""} href="/blog">Blog</Link>
      <Link href="/report?sample=1">Sample report</Link>
    </nav>
    <Link href={current === "scenarios" ? "/workbench?scenario=a2a-crossing-intercept" : "/scenarios"} className="nav-cta">{current === "scenarios" ? "Open recommended scenario" : "Choose scenario"} <ArrowRight size={15}/></Link>
  </header>;
}
