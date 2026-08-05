/**
 * Schema creation and fixture loading happen through scripts/migrate-db.mjs and
 * scripts/seed-db.ts. Runtime requests never mutate catalog structure or seed
 * authoritative records as a side effect.
 */
export const CATALOG_SCHEMA_VERSION = "vector.catalog.postgis.v2";
