'use client';
import { useEffect, useRef } from 'react';

export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = await import('mermaid');
        mermaid.default.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'Inter, system-ui, sans-serif',
          themeVariables: {
            darkMode: true,
            background: '#0B0F17',
            primaryColor: '#0F172A',
            primaryTextColor: '#F8FAFC',
            primaryBorderColor: '#38BDF8',
            lineColor: '#38BDF8',
            secondaryColor: '#1E1B4B',
            tertiaryColor: '#0F172A',
            nodeBorder: '#00F0FF',
            clusterBkg: '#090D16',
            clusterBorder: '#1E293B',
            titleColor: '#00F0FF',
            edgeLabelBackground: '#0F172A'
          }
        });

        if (!containerRef.current) {
          return;
        }

        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const result = await mermaid.default.render(id, code.trim());
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = result.svg;
        }
      } catch (error: unknown) {
        console.error('Mermaid render error:', error);
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="mermaid-container my-8 overflow-x-auto rounded-xl border border-cyan-950/60 bg-[#0B0F17]/90 p-6 shadow-2xl backdrop-blur-md flex justify-center">
      <div ref={containerRef} className="w-full flex justify-center text-center font-mono text-sm text-cyan-400" />
    </div>
  );
}
