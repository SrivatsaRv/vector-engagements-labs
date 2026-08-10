import Link from "next/link";
import { ProductHeader } from "@/components/ProductHeader";
import { ArrowRight, BookOpen, Calendar, Tag } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Engineering Blog | Vector Engagement Labs",
  description: "Technical deep dives into air engagement simulation architecture, physics models, RASP sensing pipelines, and WebAssembly execution.",
  openGraph: {
    title: "Engineering Blog | Vector Engagement Labs",
    description: "Technical deep dives into air engagement simulation architecture, physics models, RASP sensing pipelines, and WebAssembly execution.",
    url: "http://localhost:4317/blog",
    siteName: "Vector Engagement Labs",
    images: [{ url: "https://labs.reachdefence.com/og.png" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Engineering Blog | Vector Engagement Labs",
    description: "Technical deep dives into air engagement simulation architecture, physics models, RASP sensing pipelines, and WebAssembly execution.",
    images: ["https://labs.reachdefence.com/og.png"],
  },
};

export default function BlogIndexPage() {
  const post = {
    title: "What Engagement Simulators Need to Model in 2026",
    slug: "engagement-simulators-2026-revised",
    description: "An in-depth analysis of modern engagement simulation architecture: physics, information flow, state machines, browser execution, and autonomous agent boundaries.",
    date: "August 9, 2026",
    author: "Srivatsa RV & Reach Defence",
    tags: ["Simulation", "Architecture", "Mermaid", "Defence", "WebAssembly"]
  };

  return (
    <div className="min-h-screen bg-[#050811] text-slate-200 flex flex-col font-sans">
      <ProductHeader current="blog" />

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
        {/* Hero Banner */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-xs font-mono text-cyan-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            RESEARCH & ENGINEERING BLOG
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold font-heading text-slate-100 tracking-tight leading-tight mb-6">
            Simulating Complex Air Battles in 2026
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed">
            Technical notes, domain models, state machine specifications, and architectural patterns behind Vector Engagement Labs.
          </p>
        </div>

        {/* Featured Hero Article */}
        <div className="relative group rounded-2xl bg-gradient-to-b from-[#0F172A] to-[#0B0F17] border border-slate-800 p-8 sm:p-12 shadow-2xl overflow-hidden hover:border-cyan-500/40 transition-all duration-300 mb-16">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/20 transition-all"></div>

          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 text-xs font-mono text-cyan-400 mb-4">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800/80 font-bold uppercase tracking-wider">
                  Featured Analysis
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Calendar size={13} />
                  {post.date}
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-100 group-hover:text-cyan-300 transition-colors mb-4">
                <Link href={`/blog/${post.slug}`}>
                  {post.title}
                </Link>
              </h2>

              <p className="text-slate-400 text-base leading-relaxed mb-6">
                {post.description}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded text-xs font-mono bg-slate-900/90 text-cyan-400 border border-slate-800 flex items-center gap-1">
                    <Tag size={11} />
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto pt-6 md:pt-0 border-t md:border-t-0 border-slate-800">
              <Link
                href={`/blog/${post.slug}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold shadow-lg shadow-cyan-500/20 hover:scale-105 transition-transform"
              >
                <span>Read Article</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        {/* All Publications */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold font-heading text-slate-200 border-b border-slate-800 pb-4 flex items-center gap-2">
            <BookOpen size={20} className="text-cyan-400" />
            All Publications
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <article className="rounded-xl bg-[#0B0F17] border border-slate-800/80 p-6 hover:border-cyan-500/30 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-3">
                  <span>{post.author}</span>
                  <span>{post.date}</span>
                </div>

                <h3 className="text-xl font-bold font-heading text-slate-100 hover:text-cyan-400 transition-colors mb-2">
                  <Link href={`/blog/${post.slug}`}>
                    {post.title}
                  </Link>
                </h3>

                <p className="text-slate-400 text-sm line-clamp-3 mb-6">
                  {post.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-900">
                <div className="flex gap-2">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs font-mono text-slate-500">#{tag}</span>
                  ))}
                </div>
                <Link href={`/blog/${post.slug}`} className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-1">
                  <span>Read post</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </article>
          </div>
        </div>
      </main>

      {/* Footer Section */}
      <footer className="border-t border-slate-800/80 bg-[#050811] text-slate-400 text-sm py-16 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="space-y-4 md:col-span-1">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono text-xs font-bold">V</div>
                <span className="font-heading font-extrabold text-slate-100 text-base">Vector Engagement Labs</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Open-source engagement simulation workbench for tactical & operational air combat research. Built by Reach Defence.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-heading font-semibold text-slate-200 text-xs uppercase tracking-wider text-cyan-400">Navigation</h4>
              <ul className="space-y-2 text-xs">
                <li><Link href="/blog" className="hover:text-cyan-400 transition-colors">Engineering Blog</Link></li>
                <li><Link href="/scenarios" className="hover:text-cyan-400 transition-colors">Scenarios</Link></li>
                <li><Link href="/math" className="hover:text-cyan-400 transition-colors">Mathematical Foundations</Link></li>
                <li><Link href="/symbols" className="hover:text-cyan-400 transition-colors">Tactical Icons & Symbols</Link></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-heading font-semibold text-slate-200 text-xs uppercase tracking-wider text-cyan-400">Research Focus</h4>
              <ul className="space-y-2 text-xs">
                <li><span className="text-slate-300">Physics & Guidance</span> &bull; 3DOF Point-Mass</li>
                <li><span className="text-slate-300">RASP Sensor Models</span> &bull; Radar & AEW</li>
                <li><span className="text-slate-300">WebAssembly Engine</span> &bull; Fixed-Step Tick</li>
                <li><span className="text-slate-300">Cloudflare Edge</span> &bull; Hyperdrive & R2</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-heading font-semibold text-slate-200 text-xs uppercase tracking-wider text-cyan-400">Attribution & Source</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Maintained by <a href="https://github.com/SrivatsaRv" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Srivatsa RV</a> & Reach Defence.
              </p>
              <div className="pt-2">
                <a href="https://github.com/SrivatsaRv/vector-engagements-labs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-cyan-400 hover:border-cyan-800 transition-all">
                  View on GitHub
                </a>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p>&copy; 2026 Vector Engagement Labs. Apache 2.0 Licensed.</p>
            <p>Educational & research software. Results are not real-world combat claims.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
