import { ProductHeader } from "@/components/ProductHeader";
import { SymbolReference } from "@/components/SymbolReference";

export default function SymbolsPage() {
  return (
    <main className="symbols-page">
      <ProductHeader current="symbols" />
      <section className="symbols-hero">
        <span>VECTOR ANALYSIS DISPLAY · VERSION 0.3</span>
        <h1>Recognisable tactical objects, not generic dots.</h1>
        <p>
          This is a Tacview-style analysis subset, not a NATO symbol set and not
          a claim of Tacview compatibility. Silhouette identifies the object,
          frame and color identify affiliation, and lifecycle determines when
          the object is allowed to appear in the world.
        </p>
      </section>
      <SymbolReference />
    </main>
  );
}
