import { ProductHeader } from "@/components/ProductHeader";
import { SymbolReference } from "@/components/SymbolReference";

export default function SymbolsPage() {
  return (
    <main className="symbols-page">
      <ProductHeader current="symbols" />
      <section className="symbols-hero">
        <span>VECTOR TACTICAL LANGUAGE · VERSION 0.1</span>
        <h1>The symbols used on the map, in 3D, and in reports.</h1>
        <p>
          Affiliation is encoded by both color and frame geometry. The inner
          glyph identifies the simulated object class; the model designation
          remains text beside the symbol.
        </p>
      </section>
      <SymbolReference />
    </main>
  );
}
