import { asc } from "drizzle-orm";
import { ensureCatalogDb } from "@/db/bootstrap";
import { getDb } from "@/db";
import {
  platformVariants,
  platformWeaponCompatibility,
  sourceAssertions,
  sources,
  subsystems,
  weapons,
} from "@/db/schema";

export async function GET() {
  try {
    await ensureCatalogDb();
    const db = getDb();
    const [
      platformRows,
      weaponRows,
      subsystemRows,
      sourceRows,
      compatibilityRows,
      assertionRows,
    ] = await Promise.all([
      db
        .select()
        .from(platformVariants)
        .orderBy(
          asc(platformVariants.service),
          asc(platformVariants.displayName),
        ),
      db
        .select()
        .from(weapons)
        .orderBy(asc(weapons.category), asc(weapons.displayName)),
      db
        .select()
        .from(subsystems)
        .orderBy(asc(subsystems.kind), asc(subsystems.designation)),
      db
        .select()
        .from(sources)
        .orderBy(asc(sources.publisher), asc(sources.title)),
      db.select().from(platformWeaponCompatibility),
      db.select().from(sourceAssertions),
    ]);
    return Response.json({
      schema: "vector.capability-catalog.v1",
      state: "D1",
      platforms: platformRows,
      weapons: weaponRows,
      subsystems: subsystemRows,
      sources: sourceRows,
      compatibility: compatibilityRows,
      assertions: assertionRows,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Catalog unavailable" },
      { status: 500 },
    );
  }
}
