.PHONY: ci-local ci-quality ci-tests db-up db-down compose-config compose-build compose-pull compose-up compose-up-candidate container-verify integration-ci integration-local observability-local performance-local capacity-baseline-local reference-aircraft-local air-reference-local worker-local frontend-local browser-local clean-clone-local

db-up: compose-build
	docker compose up -d database
	docker compose run --rm migrate
	docker compose run --rm seed

db-down:
	docker compose down

compose-config:
	docker compose config --quiet

compose-build: compose-config
	VECTOR_SOURCE_REVISION="$$(git rev-parse HEAD)" docker compose build vector

container-verify: compose-build
	VECTOR_IMAGE="$${VECTOR_IMAGE:-vector-engagement-lab:0.1.0-dev}" npm run container:verify

compose-up: container-verify
	docker compose up -d

compose-pull: compose-config
	@test -n "$${VECTOR_IMAGE:-}" || (echo "VECTOR_IMAGE must be an immutable tag or digest" >&2; exit 1)
	@case "$$VECTOR_IMAGE" in *:latest) echo "latest is not an admitted image tag" >&2; exit 1;; esac
	docker compose pull migrate seed vector

compose-up-candidate: compose-pull
	docker compose up -d --no-build

integration-local: compose-up
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector npm run db:verify
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector VECTOR_DB_FIXTURE_MODE=aircraft-evidence-v1-upgrade npm run db:aircraft-upgrade:verify
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector npm run db:credibility:verify
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector npm run test:admission:integration
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector VECTOR_URL=http://127.0.0.1:4317 npm run app:verify
	VECTOR_URL=http://127.0.0.1:4317 npm run ui:responsive:verify

integration-ci:
	npm run db:migrate
	npm run db:governed-data:verify
	npm run db:seed
	npm run db:verify
	VECTOR_DB_FIXTURE_MODE=aircraft-evidence-v1-upgrade npm run db:aircraft-upgrade:verify
	npm run db:credibility:verify
	npm run test:admission:integration
	node scripts/run-managed-server.mjs

observability-local: compose-up
	npm run observability:verify

performance-local:
	npm run performance:verify
	npm run capacity:baseline:verify

capacity-baseline-local:
	npm run capacity:baseline:verify

reference-aircraft-local:
	npm run reference-aircraft:verify

worker-local:
	npm run build
	npm run runtime:verify
	npm run worker:verify

frontend-local:
	npm run test:component
	@test -n "$${VECTOR_URL:-}" || (echo "VECTOR_URL must identify an already running built application" >&2; exit 1)
	npm run ui:responsive:verify
	npm run test:browser

browser-local:
	npm run test:component
	npm run test:browser

air-reference-local: reference-aircraft-local

clean-clone-local:
	@set -eu; \
		temporary_root="$$(mktemp -d)"; \
		trap 'rm -rf "$$temporary_root"' EXIT INT TERM; \
		git clone --quiet --no-local --branch "$$(git branch --show-current)" . "$$temporary_root/repository"; \
		cd "$$temporary_root/repository"; \
		scripts/context-slice.sh release >/dev/null; \
		npm ci; \
		make ci-local worker-local

ci-quality:
	npm run environment:sources:verify
	npm run policy:runtime-stubs:verify
	npm run policy:aircraft-evidence:verify
	npm run policy:nasa-generic-f16:verify
	npm run symbols:verify
	npm run models:verify
	npm run reference-aircraft:verify
	npm run engine:rust:fmt
	npm run lint
	npm run typecheck

ci-tests:
	npm run engine:rust:clippy
	npm run engine:rust:verify
	npm run engine:rust:test
	npm run engine:rust:doc
	npm test
	npm run test:component

ci-local: ci-quality ci-tests
	npm run audit:production
