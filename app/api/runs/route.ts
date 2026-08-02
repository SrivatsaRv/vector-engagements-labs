import { desc, eq } from "drizzle-orm";
import { ensureCatalogDb } from "@/db/bootstrap";
import { getDb } from "@/db";
import { savedRunSnapshots } from "@/db/schema";

export async function GET(request: Request) {
  try {
    await ensureCatalogDb();
    const db = getDb();
    const id = new URL(request.url).searchParams.get("id");
    const rows = id
      ? await db
          .select()
          .from(savedRunSnapshots)
          .where(eq(savedRunSnapshots.id, id))
          .limit(1)
      : await db
          .select()
          .from(savedRunSnapshots)
          .orderBy(desc(savedRunSnapshots.createdAt))
          .limit(1);
    if (!rows[0])
      return Response.json({ error: "Run not found" }, { status: 404 });
    return Response.json({ run: rows[0] });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Run unavailable" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCatalogDb();
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      typeof payload.scenarioId !== "string" ||
      typeof payload.scenarioVersion !== "string"
    )
      return Response.json(
        { error: "scenarioId and scenarioVersion are required" },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const row = {
      id,
      scenarioId: payload.scenarioId,
      scenarioVersion: payload.scenarioVersion,
      engineVersion:
        typeof payload.engineVersion === "string"
          ? payload.engineVersion
          : "browser-point-mass-v0.4",
      blueForce: payload.blueForce ?? {},
      redForce: payload.redForce ?? {},
      initialState: payload.initialState ?? {},
      environment: payload.environment ?? {},
      modelAssumptions: payload.modelAssumptions ?? {},
      createdAt,
    };
    const db = getDb();
    await db.insert(savedRunSnapshots).values(row);
    return Response.json({ id, createdAt }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Run could not be saved",
      },
      { status: 500 },
    );
  }
}
