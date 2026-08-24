# Catalog, source, and scenario-package contract

## NASA TP-1538 aerodynamic source freeze

Issue #143 freezes NASA-TP-1538, *Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability* (1979-12-01; Nguyen, Ogburn, Gilbert, Kibler, Brown, and Deal), and its NTRS metadata under `governance/sources/nasa-tp1538/`. `vector.tp1538-source-manifest.v1` binds that exact bibliographic identity, the official hashes, public-use rights and export decision, the corrected 59-page inventory, and deterministic lossless full-page crops. The offline verifier fails closed on title, report number, publication date, authors, source, metadata, page-map, rights, crop, schema, path, or hash drift.

This is source evidence for the later #142 generic-F-16 verification corpus. It is not a catalog aircraft model and cannot be assigned to a scenario or named F-16 variant.

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

Source, subsystem, platform, weapon, compatibility, and assertion table
definitions are grouped in `db/schema/catalog.ts` and remain available through
the aggregate schema facade.

This slice deliberately remains **4 catalog platforms, 3 scenario-selectable
platforms, 8 weapons, 8 model sets, 21
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

The PAF Peace Drive I catalog records keep the 12 single-seat F-16C Block 52
and 6 two-seat F-16D Block 52 subjects separate. Only the already model-bound
F-16C identity is scenario-selectable; F-16D is catalog-only. Lockheed's
programme statement supports the delivered counts and a categorical
F100-PW-229 association. The 2006 Federal Register notice supports only
requested-programme context for APG-68(V)9, Link 16, AIM-120C-5 and LAU-129/A;
it does not prove final fit, so the F-16C/D database rows leave the fitted radar,
data-link, and defensive-EW columns null and publish those associations only as
`CONTEXT_ONLY` assertions. The separate 2016 DSCA proposal expired without
acceptance and is `INELIGIBLE`. No ALQ-211(V)9 fitted-system assertion remains.
All current station compatibility and two-store defaults are `UNVERIFIED` or
`MODEL_ASSUMPTION`, never catalog-derived runtime authority. The aircraft
evidence panel displays that assumption label beside the two-store teaching
default at every supported viewport.

Catalog seeding is also a forward reconciliation step for this owned fixture.
Before inserting the current deterministic fact rows it removes only prior
`<platform-id>-fact-*` rows for that exact managed platform, then explicitly
retires subsystem ID `alq-211v9` after fitted references have been cleared.
`db:aircraft-upgrade:verify` creates the legacy ALQ/DSCA `ACCEPTED` state in
PostGIS, reruns the current seed, and proves the retired subsystem, old
assertions, and fitted columns are absent while current context assertions remain.

PostGIS is canonical for installation geometry. Map markers, study-area origin selectors, and future KML/GeoJSON exports derive from `installations.location`; VECTOR does not maintain an independent hand-edited KML truth file. Coordinate order is longitude, latitude in EPSG:4326.

The eight existing weapon identities now include public-source records for Astra Mk-I, AIM-120C-5, MICA IR, Kh-31P, SPICE 2000, Akash, the historical S-200 reference case, and BRAHMOS Block-I. Public identity, guidance class, or conditional manufacturer figures do not turn VECTOR's thrust, drag, mass, seeker, or terminal-behavior coefficients into sourced facts. Those remain separately labeled `MODEL_ASSUMPTION`.

The S-200 template is a historical public-reference case and does not claim current IAF or PAF service. Installation points are secondary-source geographic context, not current operational disposition.

## Template-to-report version chain

1. A template is stored under immutable `(id, version)` identity with `vector.scenario.v4`, intended-use identity, compiled model-pack identity/digest, exact authored Air mission when applicable, engine version, canonical JSON package, study-area identity, weather-preset identity, and SHA-256 content hash.
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

The committed NASA POWER point snapshots in
`governance/environment-sources/nasa-power-hourly-20200115` are separately
verified source artifacts. They prove raw source handling only: each artifact
has a reviewed CC0 licence decision, source citation, request identity,
WGS84/vertical-datum declaration, coverage limitation, raw-byte checksum, and
fail-closed parser. They are deliberately point-only and cannot be selected,
compiled, or replayed as an area environment pack.

The NASA historical F-16 external-store record in
`governance/nasa-historical-f16-store-source` is an even narrower source freeze.
It commits only a content-addressed manifest and instructions. Exact PDF,
metadata, page-render, and display-rotation identities are recorded, but the
source bytes are not redistributed while human use/export/redistribution
decisions remain pending. The verifier performs no download and rejects an
extra, missing, linked, changed, truncated, swapped, or wrongly rendered local
artifact.

This record cannot seed `platform_weapon_compatibility`, stations, loadouts,
model-pack quantities, or catalog assertions. The cited layouts and one
historical test configuration are not an exhaustive compatibility matrix. The
single reported GBU-8 ejection is not a release envelope. Current F-16 station
compatibility and teaching loadouts remain `UNVERIFIED` or
`MODEL_ASSUMPTION`.

## Environment-pack installation coverage

Installation and study-area table definitions are owned by
`db/schema/geospatial.ts`; this module split does not change their PostGIS
columns, constraints, or catalog identities.

Phase A publishes `vector.environment-pack.v1` with the exact
`vector.installation-catalogue.v1` ID/version/digest, the per-record source and
WGS84 provenance, and an explicit `BOUNDED_PUBLIC_REFERENCE_FIXTURE` coverage
identity. Its included record count is the maintained fixture count, with known
gaps and an explicit `TEXT_ONLY_OR_ABSENT` runway-evidence state. It must never
be rendered or validated as a complete IAF/PAF base catalogue. PostGIS remains
the canonical geometry source for published points; the Phase A pack binds the
same immutable coverage identity required by future ground-start admission.

## Generic sensor verification source freeze

`governance/generic-sensor-verification-sources/manifest.v1.json` is a separate
Stage-0, content-addressed research-source record with intended use
`ENGINE_VERIFICATION_ONLY_SOURCE_FREEZE`. It preserves exact public reference
bytes and locations for isolated future verification work. It is not a catalog
source row, model-pack source, compiled model, or production asset, and catalog
admission must not resolve or import it.

The verifier pins the complete canonical manifest digest rather than trusting a
caller-recomputed digest. This closes every manifest field—including source
identity and URLs, artifact bytes and hashes, render identity, eligible and
ineligible claims, extracted-text policy, and the source-only policy—as one
reviewed authority table. Replacing a PDF or render and updating every local
hash or total still fails. Generator freshness plus full bundle verification is
mandatory in `make ci-quality` through `generic-sensor:sources:verify`.

The corresponding legal artifact keeps redistribution, reference execution,
and adaptation as independent decisions. They currently remain
`PENDING_REVIEW`; missing, pending, forged, agent-authored, wrong-jurisdiction,
or wrong-scope authority fails closed. `AUTHORIZED_HUMAN` is not a self-proving
string: approval also requires an allowlisted reviewer and decision record whose
canonical payload and evidence digest have a detached Ed25519 signature verified
against `governance/generic-sensor-legal-authority-policy.v1.json`. That policy
is outside the source bundle, pinned by digest in the verifier, and cannot be
replaced by a request-supplied key or allowlist. It currently registers no
approval authority. Each decision field has one exact scope; evidence must
resolve to exact bytes below the separately governed evidence root. The bundle
registry is empty and can carry only signed records, never authority. Public
availability or an open licence does not imply local execution,
adaptation, export, model, or installation authority. Named platform and radar
claims, game/community artifacts, and dynamic unpinned sources are expressly
ineligible. Downstream #26 work remains blocked until this freeze is
independently reviewed and the specifically required human decision is approved.
