# Capability catalog and source contract

The catalog is a product service, not UI copy. It separates five record types:

1. `sources`: publisher, title, URL, date, source class, and status.
2. `platform_variants`: service, country, family, variant, role, and linked subsystems.
3. `subsystems`: engine, radar, EW, and data-link associations.
4. `weapons`: category, seeker/guidance description, and separate model profile.
5. `platform_weapon_compatibility` and `source_assertions`: explicit relationships and field-level evidence.

The first detailed slice covers IAF Su-30MKI/Astra Mk-I and PAF F-16C Block 52/AIM-120C-5. Each public fact can be sourced, partial, unknown, or an assumption. Unknown data must remain visible rather than being silently filled with a generic value.

The TypeScript records in `lib/capability-data.ts` seed local D1 through `db/bootstrap.ts`. `/api/catalog` returns the durable structured view. Drizzle schema and migrations are in `db/schema.ts` and `drizzle/`.

## Modeling boundary

Source assertions describe public facts. Weapon study profiles describe current simulation assumptions. Those two data paths must never be merged into one apparent “specification.” Reports freeze both the source list and the study-model version used for the run.
