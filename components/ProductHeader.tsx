import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ProductHeader({ current }: { current?: "lab" | "scenarios" }) {
  return <header className="landing-nav product-header">
    <Link href="/" className="brand"><span>V</span><div><strong>VECTOR</strong><small>Engagement Lab</small></div></Link>
    <nav aria-label="Product navigation">
      <Link className={current === "lab" ? "active" : ""} href="/lab">Lab Home</Link>
      <Link className={current === "scenarios" ? "active" : ""} href="/scenarios">Scenarios</Link>
      <Link href="/#instructor">Instructor Station</Link>
      <Link href="/report?sample=1">Sample report</Link>
    </nav>
    {current === "lab"
      ? <Link href="/scenarios" className="nav-cta">Choose scenario <ArrowRight size={15}/></Link>
      : <Link href="/lab" className="nav-cta">Open Lab Home <ArrowRight size={15}/></Link>}
  </header>;
}
