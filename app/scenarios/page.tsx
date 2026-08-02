import { BookOpen, Database, ShieldCheck } from "lucide-react";
import { ScenarioLibrary } from "@/components/ScenarioLibrary";
import { ProductHeader } from "@/components/ProductHeader";

export default function ScenariosPage() {
  return (
    <main className="library-page">
      <ProductHeader current="scenarios" />
      <section className="library-page-intro">
        <div>
          <span className="overline">Versioned experiment scenarios</span>
          <h1>
            Choose the engagement.
            <br />
            Then test the conditions.
          </h1>
        </div>
        <div>
          <p>
            Every scenario opens ready to run with forces, starting geometry, a
            flight profile, and declared model limits. Use it unchanged or
            adjust one condition for comparison.
          </p>
          <div className="library-trust">
            <span>
              <Database size={14} />
              Versioned starting state
            </span>
            <span>
              <ShieldCheck size={14} />
              Model limits shown first
            </span>
            <span>
              <BookOpen size={14} />
              Run record in every report
            </span>
          </div>
        </div>
      </section>
      <section className="library-page-content">
        <ScenarioLibrary />
      </section>
      <section className="library-policy">
        <strong>Map context</strong>
        <p>
          Every run keeps its physics in a local coordinate frame. The map can
          fit the recorded engagement or show the 12 public-reference IAF and
          PAF station points in regional context; changing map extent or
          basemap never changes the calculation.
        </p>
      </section>
    </main>
  );
}
