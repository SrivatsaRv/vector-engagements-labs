# Container build, release, promotion, and recovery

## Authority and registry

Docker Compose is the authoritative definition of the local and containerized
service topology. One application image supplies the `migrate`, `seed`, and
`vector` services, so schema operations and the web/API runtime cannot silently
drift across builds. PostGIS, telemetry, and dashboard services remain explicit
backing services.

The release registry is GitHub Container Registry (GHCR):
`ghcr.io/srivatsarv/vector-engagements-labs`. Docker Hub is **not configured**.
The repository must never imply a Docker Hub namespace or consume an unqualified
remote application image.

## Local build and verification

```bash
make compose-build
make container-verify
make integration-local
```

The multi-stage Dockerfile uses a digest-pinned Node base, builds with the lock
file, and copies only the generated application, Node database adapter,
migration, and seed bundles into the final image. It runs as the unprivileged
`node` user. `DATABASE_URL`, telemetry endpoints, tokens, and environment names
are runtime configuration and are never Docker build arguments.

`make integration-local` is the complete local container gate: Compose schema
validation, image build/inspection, health-gated migration and fixture loading,
PostGIS and API verification, and automated responsive UI journeys. Local seed
data is intentionally a separate one-shot service and is never a production
deployment step.

## Release identity and publication

A maintainer first creates an immutable annotated `vMAJOR.MINOR.PATCH` tag on a
CI-green `main` commit. The manually dispatched Release workflow re-admits that
exact commit, rebuilds and tests it, verifies `linux/amd64` and `linux/arm64`,
then publishes one manifest to GHCR through the protected `release`
environment. It creates only:

- `MAJOR.MINOR.PATCH`, matching `package.json`; and
- `sha-<full-40-character-commit>`.

The workflow records the resulting `sha256` manifest digest in the GitHub
release and publishes SBOM and provenance attestations. It does not create
`latest`, major-only, minor-only, branch, or environment tags.

## Candidate verification and promotion

Copy the digest from `IMAGE-DIGEST.txt` in the GitHub release, authenticate to
GHCR if the package is private, and use the exact manifest:

```bash
export VECTOR_IMAGE='ghcr.io/srivatsarv/vector-engagements-labs@sha256:<digest>'
make compose-up-candidate
DATABASE_URL='postgres://vector:vector@127.0.0.1:55433/vector' \
  VECTOR_URL='http://127.0.0.1:4317' npm run app:verify
```

Promotion changes the deployment's `VECTOR_IMAGE` value to that tested digest
and runs `docker compose up -d --no-build`. It does not rebuild or retag the
image. Keep the prior admitted digest in deployment history. Rollback restores
that prior digest and repeats the same no-build Compose operation.

## Migration, backup, and restore order

Migration `017_weapon_termination_model.sql` follows 016 and appends the 1.1.0
intended use, 0.9.0 pack, 1.3.0 credibility manifest and nine exact `1.1.0`
scenario bindings. It also publishes the frozen 0.8.0 source, compiled pack and
1.2.0 manifest needed to keep all nine `1.0.0` scenario identities resolvable.
Those nine historical packages are `RETIRED`, not executable; only the nine
`1.1.0` packages are `VALIDATED`. Backup/restore verification must retain all
18 rows and both authority chains;
older migration bytes are checked before 017 generation is accepted. Fixture
seeding is insert-only for `(id, version)` and cannot repair drift by overwrite.
Migration readback compares the full current and historical intended-use,
source, credibility-manifest and compiled-pack rows with generated content; a
partially deployed or administratively inserted conflicting identity aborts
the transaction. The historical intended-use comparison deliberately preserves
migration 007's exact definition and legacy identity-string content hash; it
does not reinterpret that immutable row using today's canonical-content hash.

Migration `018_three_air_combat_studies.sql` follows 017 and forward-publishes
exact immutable `1.2.0` packages for `a2a-crossing-intercept`,
`a2a-defensive-break`, and `a2a-high-energy-crossing-challenge`. It marks only
those three `1.1.0` identities `RETIRED`; it does not delete, overwrite, or
reinterpret their package bytes, hashes, intended-use identity, model-pack
identity, or provenance. The three new `1.2.0` rows are the only current
`VALIDATED` versions for those IDs. Generation and migration readback compare
all three complete packages and reject a conflicting pre-existing `(id,
version)` identity rather than repairing it in place.

For a release containing 018, take and verify the backup before the migration
job, apply migrations through 018 in numeric order, then run migration readback
and application verification before promotion. A post-018 backup/restore drill
must preserve the prior `1.0.0`/`1.1.0` rows and the new `1.2.0` rows with their
original status and content hashes. A pre-018 recovery drill instead restores
the verified pre-migration backup into a new database, reapplies migrations
through 018, and then verifies that same complete version history before any
connection is switched. Image rollback does not reverse 018 or remove the new
packages; restore is the recovery path for a failed or incompatible migration.

Migration `015_generic_ground_dynamics.sql` deterministically upserts only its
eight historical canonical v4 scenario-package rows and hashes affected by ground-envelope
v2, so migrate-before-seed fresh installs and upgrades share one result.
Its final expected-row table verifies every governed ID, version, schema, hash
and environment description without rejecting unrelated user/historical rows.
It runs after migration 014, which remains the sole owner of sourced runways and
EnvironmentPacks; rollback continues to require restoring the pre-migration
backup rather than mutating immutable rows in place.
Migration `016_high_energy_crossing_challenge.sql` then adds the independently
generated ninth package and verifies its exact identity/hash. It does not
rewrite migration 015 or any existing row. Once migration 016 exists, the
ground-dynamics generator admits migration 015 only at frozen SHA-256
`ed5a04b32ae3f634c28394a17c98232474a737ce466fca58fc0bca21235fe35b`;
both verification and generation reject any historical-byte drift while
allowing only the forward migration to be regenerated.

Scenario migration `013_air_mission_contract.sql` is forward-only. The preflight
verifier accepts only a catalogue that is wholly v3 or wholly v4, the migration
atomically installs the eight canonical v4 packages and hashes, and its final
guard rejects any residual non-v4 row before application rollout.

Domain-owned files under `db/schema/` are re-exported by `db/schema.ts` and
therefore remain one Drizzle schema and one forward-migration sequence. The
module split introduces no migration, table, or backup-format change. Regional
environment delivery adds forward migration
`014_environment_pack_runways.sql`: immutable content-addressed environment
packs, PostGIS runway centrelines/elevation/provenance, and installation
provenance columns. It also refreshes canonical v4 EnvironmentPack wording and
hashes through `environment:migration:verify`. Snapshot before applying it.
Rollback uses the prior image against the forward-migrated compatible schema;
it does not delete pack or runway evidence. Restore remains the recovery path
for a migration failure.

Forward-only migrations execute as a health-gated one-shot job before the
application starts. Production never runs the `seed` profile/service. Before a
release containing migrations, take a database-provider snapshot or an
encrypted logical backup and verify its retention and restore target outside
the repository. A generic local logical backup is:

```bash
docker compose exec -T database pg_dump -U vector -d vector -Fc > vector.backup
```

Restore into a new, isolated database rather than overwriting the active one:

```bash
createdb vector_restore
pg_restore --exit-on-error --clean --if-exists -d vector_restore vector.backup
```

Then run the migration verifier and application checks against the restored
database before switching any connection. Backup files, `.env` files, registry
tokens, database URLs, certificates, and production data are local secrets or
operational assets: they must be encrypted and migrated separately, never
committed or baked into an image.

## Runtime configuration

| Variable | Owner | Purpose |
| --- | --- | --- |
| `VECTOR_IMAGE` | deployment | Exact local tag or GHCR digest consumed by all application jobs |
| `VECTOR_VERSION` | release/runtime | Visible release identity; not a credential |
| `DATABASE_URL` | secret manager or Compose | PostgreSQL connection attached at runtime |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | deployment | OpenTelemetry collector endpoint |
| `METRICS_BEARER_TOKEN` | secret manager or local Compose | Protects metrics reads |
| `VECTOR_ENVIRONMENT` | deployment | Enables explicitly bounded environment behavior |
| `VECTOR_RUNTIME` | deployment | `node` selects the Postgres-backed public API admission adapter; do not omit it in a Node deployment |
| `PORT`, `HOST` | deployment | HTTP port binding |

Cloudflare production continues to use the Hyperdrive binding rather than the
Node adapter. Both paths share migrations, route contracts, deterministic model
packs, and integration evidence.
