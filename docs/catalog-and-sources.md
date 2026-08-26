# Catalog, source, and scenario-package contract

## NASA TP-1538 aerodynamic source freeze

Issue #143 freezes NASA-TP-1538, *Simulator study of stall/post-stall characteristics of a fighter airplane with relaxed longitudinal static stability* (1979-12-01; Nguyen, Ogburn, Gilbert, Kibler, Brown, and Deal), and its NTRS metadata under `governance/sources/nasa-tp1538/`. `vector.tp1538-source-manifest.v1` binds that exact bibliographic identity, the official hashes, public-use rights and export decision, the corrected 59-page inventory, and deterministic lossless full-page crops. The offline verifier fails closed on title, report number, publication date, authors, source, metadata, page-map, rights, crop, schema, path, or hash drift.

Issue #142 admits the complete derivative as `governance/nasa-tp1538-generic-f16-aero-verification-corpus.v1.json`, canonical SHA-256 `24833d23b6ba542cdda4152e9f0eeac4a5936e827c9c4367d25eb70e11a724d2`. Its 48 tables and 14,705 positions preserve source-page/crop lineage, both independent transcripts, the exact comparison, and every adjudication. It is not a catalog aircraft model and cannot be assigned to a scenario or named F-16 variant.

This aerodynamic source family remains distinct from the issue #148 generic
sensor source freeze; neither artifact may supply evidence or authority to the
other merely because both are offline verification inputs.

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
public-reference installations, and 9 scenario templates**. The installation
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

The chain now preserves PostGIS-authenticated environment-pack and runway
identities through authored draft, compiler, runtime, VSR and report. A later
catalogue version cannot change an archived result.

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

Catalog object identity remains separate from the run's environment identity.
Compilation freezes transform, geoid, terrain, weather, atmosphere,
study-area, route, installation and airspace dataset versions/digests in
`vector.synthetic-environment.v1` and embeds the complete regional
`vector.environment-pack.v1` content version `2.0.0`. ETOPO terrain, NASA POWER
surface fields and OurAirports runway records remain separately sourced;
derived atmosphere and runway/DEM reconciliation retain their own provenance.
The deterministic zero-geoid conversion is still a visible `MODEL_ASSUMPTION`.
Any source, preprocessing or policy change publishes a new content identity
rather than mutating a PostGIS row or saved run.

The committed NASA POWER point snapshots in
`governance/environment-sources/nasa-power-hourly-20200115` are separately
verified source artifacts. They prove raw source handling only: each artifact
has a reviewed CC0 licence decision, source citation, request identity,
WGS84/vertical-datum declaration, coverage limitation, raw-byte checksum, and
fail-closed parser. They are deliberately point-only and cannot be selected,
compiled, or replayed as an area environment pack.

### Historical F-16 external-store source-only quarantine

The NASA historical F-16 external-store record in
`governance/nasa-historical-f16-store-source` is an even narrower source freeze.
It commits a content-addressed quarantine of the three exact PDFs, three NTRS
metadata snapshots, 18 declared full-page render files, and the exact NASA
Public Access Plan used by the source-terms record. That official policy and
the three metadata digests authorize internal verification use and
redistribution of exact frozen bytes and declared renders only; the record is
not a repository-created licence or legal approval. A separate non-legal
`RELEASE_OWNER_REVIEW` binds all 16 page/report/anchor mappings and records no
numeric or equation transcription. The deny-all verifier performs no download
and rejects an extra, missing, linked, changed, truncated, swapped, wrongly
rendered, or authority/review-mismatched artifact.

This record cannot seed `platform_weapon_compatibility`, stations, loadouts,
model-pack quantities, or catalog assertions. The cited layouts and one
historical test configuration are not an exhaustive compatibility matrix. The
single reported GBU-8 ejection is not a release envelope. Current F-16 station
compatibility and teaching loadouts remain `UNVERIFIED` or
`MODEL_ASSUMPTION`.

Adaptation, execution, model admission, numeric/equation transcription and
runtime permissions remain false. The exact-byte redistribution decision
cannot seed a catalog row or expand any aircraft/store claim.

## Generic mission-policy verification source-only quarantine

`governance/generic-mission-policy-verification-source` freezes immutable
identities and 15 page roles for two NASA civil-autonomy research papers and
the FAA human-pilot Risk Management Handbook. Every PDF, NASA metadata
snapshot, alternate copy, render and contact sheet remains external. The
network-denied verifier accepts only user-supplied exact bytes and rejects the
different NASA copy as a substitute. The release-owner record is a digest-bound
technical inspection of title/report identity, page numbering, orientation,
legibility, rights notice and limitations; it is neither a legal decision nor
a source-content licence.

NASA metadata rights/export values remain source facts only. The visible AIAA
rights notice and absence of complete FAA redistribution terms produce closed
negative redistribution and adaptation decisions. That is a successful
fail-closed Stage-0 governance result: it does not admit source bytes to Git or
grant any downstream permission. Reference-only offline checking of external
bytes is the sole positive permission. Execution, runtime, model-pack,
production and catalog permissions are false.

The civil page roles cannot populate catalog policy, doctrine, action, command,
fuel, geometry, track/support, weapon, sensor or named-platform fields. Every
cadence, threshold, priority, tie-break, hysteresis, timeout, fuel/reserve
value, route geometry, action mapping and command bound remains a value-less
`MODEL_ASSUMPTION`. AFDP rows are unacquired discovery-only pointers; CJCSI
3121.01(S) is permanently ineligible and no content from it may be acquired or
stored.

## Environment-pack installation coverage

Migration 014 remains the immutable installation/runway/EnvironmentPack source
snapshot after #182. Migration 015 neither copies nor rewrites those governed
rows; it consumes their existing identities while upserting and verifying the
eight historical canonical scenario packages. Migration 016 independently
adds and reads back the ninth package, the governed high-energy crossing
challenge, without rewriting any published historical package.

Installation and study-area table definitions are owned by
`db/schema/geospatial.ts`; this module split does not change their PostGIS
columns, constraints, or catalog identities.

Regional packs bind exact `vector.installation-catalogue.v2@2.0.0` identity,
per-record source/WGS84 provenance and an explicit
`BOUNDED_PUBLIC_REFERENCE_FIXTURE` coverage identity. The declared fixture is
21 installation points (6 IAF, 15 PAF), 24 sourced runway rows and 12 runways
eligible by evidence completeness. Known gaps prohibit presenting that set as
all IAF/PAF bases or current operational status. PostGIS is the published
geometry authority; catalog admission compares every point, runway and pack
row to immutable governed artifacts. Only a selected runway with geometry,
threshold elevation, dimensions, surface and admitted coverage can become
`vector.installation-origin.v2`; unsupported points remain
airborne-placement-only.

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
The hosted verifier toolchain exposes both `pdftoppm` and `pdfinfo` from the
same pinned Poppler 26.05.0 image before any quality, web-contract, or
integration source check; the runner's ambient utilities are not evidence.

The corresponding legal artifact keeps redistribution, reference execution,
and adaptation as independent decisions. Redistribution is
`SOURCE_TERMS_AUTHORIZED` only for exact frozen bytes and declared derivatives:
the verifier binds each decision to the pinned NASA public/public-use metadata
or the Zenodo open/MIT metadata and preserved MIT notice. Missing or changed
source evidence fails closed. Reference execution and adaptation remain
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
availability or an open licence does not imply local execution, adaptation,
model, or installation authority beyond the exact recorded redistribution
grant. Named platform and radar
claims, game/community artifacts, and dynamic unpinned sources are expressly
ineligible. Downstream #26 work remains blocked until this freeze is
machine-verified, its exact-render-set `RELEASE_OWNER_REVIEW` is complete, and
the specifically required execution decision is approved. That technical
visual role is not a legal reviewer or approval authority.
