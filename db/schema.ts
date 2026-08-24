// Stable Drizzle facade. Domain-owned tables live in focused modules so that
// contract-document ownership follows the schema authority that actually changed.
export * from "./schema/catalog.ts";
export * from "./schema/model-pack.ts";
export * from "./schema/geospatial.ts";
export * from "./schema/scenarios.ts";
export * from "./schema/vector-record.ts";
export * from "./schema/public-api-admission.ts";
export * from "./schema/saved-run-admission.ts";
export * from "./schema/blog-comments.ts";
