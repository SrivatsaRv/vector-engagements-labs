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

Scenario migration `013_air_mission_contract.sql` is forward-only. The preflight
verifier accepts only a catalogue that is wholly v3 or wholly v4, the migration
atomically installs the eight canonical v4 packages and hashes, and its final
guard rejects any residual non-v4 row before application rollout.

Domain-owned files under `db/schema/` are re-exported by `db/schema.ts` and
therefore remain one Drizzle schema and one forward-migration sequence. The
module split introduces no migration, table, or backup-format change.

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
