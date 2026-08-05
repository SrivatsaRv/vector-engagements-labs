# Catalog, source, and scenario-package contract

The runtime catalog lives in PostgreSQL/PostGIS and separates:

1. `sources`: publication identity and source class.
2. `source_assertions`: field-level value, condition, confidence, and review state.
3. `platform_variants` and `subsystems`: named objects and linked equipment.
4. `weapons`: identity, category, public guidance description, and conditional published facts.
5. `simulation_models`: versioned coefficients and explicit value state; never presented as published specifications.
6. `platform_weapon_compatibility`: explicit source-bearing loadout relationships.
7. `installations`: public-reference WGS84 point geometry with a GiST index, optional ICAO code, elevation, and runway note.
8. `scenario_templates`: immutable ID/version packages with lifecycle status.
9. `saved_run_snapshots`: frozen scenario, engine version, forces, environment, and report payload. A composite template-version foreign key and JSON report constraint prevent orphaned or output-free snapshots.

The TypeScript arrays are idempotent local seed fixtures and deterministic test fallbacks. `/api/catalog` reads the database; the client validates that the selected template/version and coefficient set exist before Conduct. Runtime requests never bootstrap schema or authoritative records.

## Fixed development fixture

This slice deliberately remains **3 platforms, 8 weapons, 8 model sets, 21 public-reference installations, and 8 scenario templates**. The installation catalog contains six IAF context points and all 15 PAF points present in SHIELD's `apps/backend/data/paf_orbat.json` seed. PAF coordinates are ingest-authored public-reference data, identified by `shield-paf-orbat-2026-05-19`; they are not RDDF-derived and do not represent current force disposition. The database verifier fails if the catalog count, ICAO coverage, SRID, provenance, or the Nur Khan coordinate regression drifts.

PostGIS is canonical for installation geometry. Map markers, study-area origin selectors, and future KML/GeoJSON exports derive from `installations.location`; VECTOR does not maintain an independent hand-edited KML truth file. Coordinate order is longitude, latitude in EPSG:4326.

The eight existing weapon identities now include public-source records for Astra Mk-I, AIM-120C-5, MICA IR, Kh-31P, SPICE 2000, Akash, the historical S-200 reference case, and BRAHMOS Block-I. Public identity, guidance class, or conditional manufacturer figures do not turn VECTOR's thrust, drag, mass, seeker, or terminal-behavior coefficients into sourced facts. Those remain separately labeled `MODEL_ASSUMPTION`.

The S-200 template is a historical public-reference case and does not claim current IAF or PAF service. Installation points are secondary-source geographic context, not current operational disposition.

## Template-to-report version chain

1. A template is stored under immutable `(id, version)` identity with `vector.scenario.v2`, engine version, canonical JSON package, study-area identity, weather-preset identity, and SHA-256 content hash.
2. `/api/catalog` returns that exact package. The browser recomputes the hash before allowing a run.
3. Construct edits produce a draft revision derived from the loaded package without mutating the template row.
4. The compiler resolves the draft into the complete engine scenario: entities, events, environment, model IDs, model versions, and seed.
5. Save submits the original package identity/hash, compiled scenario, engine version, result, and frames.
6. `/api/runs` rejects a stale package or engine mismatch, recomputes the frame hash, and saves all provenance with the report payload.
7. `/report?run=<id>` reads only the saved snapshot. It never substitutes the current template or a sample run.

This is semantic versioning plus content-addressed verification, not Git. Template maintainers publish a new row version when authored behavior changes; old saved runs remain bound to their original package and frame hashes.

No missing value may be silently promoted to sourced truth.

## Synthetic-environment identity

Catalog object identity remains separate from the run's synthetic-environment
identity. Compilation freezes transform, geoid, terrain, weather, atmosphere,
study-area, route, installation and airspace dataset versions/digests in
`vector.synthetic-environment.v1`. The current reference terrain and zero-geoid
fixtures are `MODEL_ASSUMPTION`; they do not upgrade PostGIS installation points
or public-source assertions. A future production terrain/geoid ingest publishes
new content identities rather than mutating a saved run.
