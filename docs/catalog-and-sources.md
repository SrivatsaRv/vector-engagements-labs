# Catalog, source, and scenario-package contract

The runtime catalog lives in PostgreSQL/PostGIS and separates:

1. `sources`: publication identity and source class.
2. `source_assertions`: field-level value, condition, confidence, and review state.
3. `platform_variants` and `subsystems`: named objects and linked equipment.
4. `weapons`: identity, category, public guidance description, and conditional published facts.
5. `simulation_models`: legacy v0.5 scalar coefficient rows retained for configured-template delivery and regression continuity.
6. `platform_weapon_compatibility`: explicit source-bearing loadout relationships.
7. `installations`: public-reference WGS84 point geometry with a GiST index, optional ICAO code, elevation, and runway note.
8. `scenario_templates`: immutable ID/version packages with lifecycle status.
9. `saved_run_snapshots`: frozen scenario, engine version, forces, environment, and report payload. A composite template-version foreign key and JSON report constraint prevent orphaned or output-free snapshots.
10. `intended_use_contracts`: immutable question, supported interpretation, required capability, and explicit non-use contracts.
11. `model_pack_sources`: human-readable, unit-bearing executable object sources.
12. `compiled_model_packs`: immutable SI-normalized arrays identified by SHA-256 digest.
13. `credibility_manifests`: engine or model-pack evidence, validity, uncertainty, limitations, and approval state.

The four governed evidence tables—intended uses, model-pack sources, compiled
model packs, and credibility manifests—are immutable by `(id, version)` after
insert. PostgreSQL validates payload identity on admission and rejects update or
delete; changes publish a new version. The catalog API then binds every
validated scenario template to its exact SI pack and manifest before returning
an admitted response.

`governance/installation-catalogue.v1.json` is the one versioned, machine-readable
input for the bounded public-reference installation fixture. It declares source
identity/license state, SHA-256 content identity, coverage/count, known gaps,
validity/review state, and WGS84/provenance/uncertainty for every record.
`scripts/seed-db.ts` derives the PostGIS seed from this manifest. PostGIS remains
the authority for published map geometry: `/api/catalog` compares every returned
row to the manifest and fails closed on a missing, extra, duplicate, source, or
coordinate mismatch. The browser rejects a stale catalogue identity rather than
quietly rendering a local substitute. Runtime ticks consume only the compiled,
frozen environment-pack binding and never query either source.

## Fixed development fixture

This slice deliberately remains **3 platforms, 8 weapons, 8 model sets, 21
public-reference installations, and 8 scenario templates**. The installation
catalogue contains six IAF context points and all 15 PAF points present in
SHIELD's `apps/backend/data/paf_orbat.json` seed. It is explicitly
`BOUNDED_PUBLIC_REFERENCE_FIXTURE`, never a complete IAF/PAF order of battle.
PAF coordinates are ingest-authored public-reference data, identified by
`shield-paf-orbat-2026-05-19`; they are not RDDF-derived and do not represent
current force disposition. Positional uncertainty is `null` where the source
has not published a reviewed value. The database verifier fails if the catalog
count, ICAO coverage, SRID, provenance, or the Nur Khan coordinate regression
drifts.

PostGIS is canonical for installation geometry. Map markers, study-area origin selectors, and future KML/GeoJSON exports derive from `installations.location`; VECTOR does not maintain an independent hand-edited KML truth file. Coordinate order is longitude, latitude in EPSG:4326.

The eight existing weapon identities now include public-source records for Astra Mk-I, AIM-120C-5, MICA IR, Kh-31P, SPICE 2000, Akash, the historical S-200 reference case, and BRAHMOS Block-I. Public identity, guidance class, or conditional manufacturer figures do not turn VECTOR's thrust, drag, mass, seeker, or terminal-behavior coefficients into sourced facts. Those remain separately labeled `MODEL_ASSUMPTION`.

The S-200 template is a historical public-reference case and does not claim current IAF or PAF service. Installation points are secondary-source geographic context, not current operational disposition.

## Template-to-report version chain

1. A template is stored under immutable `(id, version)` identity with `vector.scenario.v3`, intended-use identity, compiled model-pack identity/digest, engine version, canonical JSON package, study-area identity, weather-preset identity, and SHA-256 content hash.
2. `/api/catalog` returns that exact package. The browser recomputes the hash before allowing a run.
3. Construct edits produce a draft revision derived from the loaded package without mutating the template row.
4. The compiler resolves the draft into the complete engine scenario: entities, events, one immutable `vector.environment-pack.v1` artifact with its exact ID/version/digest, model IDs, model versions, and seed. Runtime and replay consume the archived pack binding; they do not look up a current study-area default.
5. Save submits the original package identity/hash, compiled scenario, engine version, result, and frames.
6. `/api/runs` rejects a stale package or engine mismatch, recomputes the frame hash, and saves all provenance with the report payload.
7. `/report?run=<id>` reads only the saved snapshot. It never substitutes the current template or a sample run.

The explicit `/report?sample=1` route may construct the illustrative fixture.
All other report routes start without a report object. A missing saved run, or a
saved report without its frozen library identity, renders an unavailable state
and does not create, display, export, or print example data.

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

## Environment-pack installation coverage

Phase A publishes `vector.environment-pack.v1` with the exact
`vector.installation-catalogue.v1` ID/version/digest, the per-record source and
WGS84 provenance, and an explicit `BOUNDED_PUBLIC_REFERENCE_FIXTURE` coverage
identity. Its included record count is the maintained fixture count, with known
gaps and an explicit `TEXT_ONLY_OR_ABSENT` runway-evidence state. It must never
be rendered or validated as a complete IAF/PAF base catalogue. PostGIS remains
the canonical geometry source for published points; the Phase A pack binds the
same immutable coverage identity required by future ground-start admission.
