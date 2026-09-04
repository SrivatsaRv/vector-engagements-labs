.PHONY: ci-local ci-quality ci-quality-core ci-tests toolchain-preflight rust-audit-local db-up db-down compose-config compose-build compose-pull compose-up compose-up-candidate container-verify integration-ci integration-local observability-local performance-local capacity-baseline-local reference-aircraft-local reference-aam-local generic-sensor-sources-local generic-mission-policy-sources-local tp1538-adjudication-local tp1538-aero-local air-reference-local worker-local frontend-local browser-local clean-clone-local

toolchain-preflight:
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		VECTOR_TOOLCHAIN_ALLOW_MISSING_POPPLER=1 npm run toolchain:verify; \
	else \
		npm run toolchain:verify; \
	fi

rust-audit-local:
	cargo audit --file engine-rust/Cargo.lock
	cargo audit --file verification-rust/generic-aam/Cargo.lock
	cargo audit --file verification-rust/tp1538-aero/Cargo.lock

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
	npm run db:environment-upgrade:verify
	npm run db:seed
	npm run db:verify
	VECTOR_DB_FIXTURE_MODE=aircraft-evidence-v1-upgrade npm run db:aircraft-upgrade:verify
	npm run db:credibility:verify
	npm run test:admission:integration
	node scripts/run-managed-server.mjs

observability-local: compose-up
	npm run observability:verify

performance-local:
	npm run reference-aam:performance
	npm run performance:generic-takeoff:verify
	npm run performance:verify
	npm run performance:model-pack-foundation:verify
	npm run performance:environment:verify
	npm run performance:track-store:verify
	npm run capacity:baseline:verify
	npm run performance:generic-airborne-store-transfer:verify
	npm run performance:air-combat-studies:verify

capacity-baseline-local:
	npm run capacity:baseline:verify

reference-aircraft-local:
	npm run reference-aircraft:verify

reference-aam-local:
	npm run reference-aam:verify

generic-sensor-sources-local:
	npm run generic-sensor:sources:verify

generic-mission-policy-sources-local:
	@test -n "$${VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR:-}" || (echo "VECTOR_GENERIC_MISSION_POLICY_SOURCE_DIR must identify exact user-supplied source bytes" >&2; exit 1)
	npm run generic-mission-policy:sources:verify

worker-local:
	npm run build
	npm run generic-sensor:sources:verify
	npm run policy:nasa-f16-store-source:verify
	npm run policy:generic-mission-policy-source:verify
	npm run runtime:verify
	npm run worker:verify

frontend-local:
	npm run test:component
	@test -n "$${VECTOR_URL:-}" || (echo "VECTOR_URL must identify an already running built application" >&2; exit 1)
	npm run ui:responsive:verify
	npm run test:browser

browser-local:
	npm run test:component
	npm run test:browser:ci

air-reference-local: reference-aircraft-local

tp1538-adjudication-local:
	npm run tp1538:aero:adjudication:verify

tp1538-aero-local:
	npm run tp1538:aero:workload:verify
	npm run tp1538:aero:reference:verify

clean-clone-local:
	@set -eu; \
		temporary_root="$$(mktemp -d)"; \
		trap 'rm -rf "$$temporary_root"' EXIT INT TERM; \
		git clone --quiet --no-local --branch "$$(git branch --show-current)" . "$$temporary_root/repository"; \
	cd "$$temporary_root/repository"; \
	scripts/context-slice.sh release >/dev/null; \
	npm ci; \
	VECTOR_CONTRACT_DOC_DECLARATION_FILE="$${VECTOR_CONTRACT_DOC_DECLARATION_FILE:-}" \
	VECTOR_CONTRACT_DOC_BASE_SHA="$${VECTOR_CONTRACT_DOC_BASE_SHA:-}" \
	make ci-local worker-local

ci-quality:
	npm run policy:contract-docs:verify
	$(MAKE) ci-quality-core

ci-quality-core:
	npm run deploy:verify
	CLOUDFLARE_HYPERDRIVE_ID=11111111111111111111111111111111 VECTOR_PRODUCTION_HOST=vector-ci.invalid npm run deploy:configuration:verify
	npm run environment:sources:verify
	npm run generic-sensor:sources:verify
	npm run environment:migration:verify
	npm run ground-dynamics:migration:verify
	npm run weapon-termination:migration:verify
	npm run air-combat-studies:migration:verify
	npm run tp1538:sources:verify
	npm run tp1538:aero:adjudication:verify
	npm run tp1538:aero:workload:verify
	npm run tp1538:aero:schema:verify
	npm run policy:runtime-stubs:verify
	npm run policy:aircraft-evidence:verify
	npm run policy:nasa-generic-f16:verify
	npm run policy:nasa-f16-store-source:verify
	npm run policy:generic-mission-policy-source:verify
	npm run symbols:verify
	npm run models:verify
	npm run reference-aircraft:verify
	npm run reference-aam:verify
	npm run reference-aam:rust:fmt
	npm run tp1538:aero:rust:fmt
	npm run engine:rust:fmt
	npm run lint
	npm run typecheck

ci-tests:
	npm run engine:rust:clippy
	npm run engine:rust:verify
	npm run reference-aam:rust:clippy
	npm run tp1538:aero:rust:clippy
	npm run tp1538:aero:rust:verify
	npm run tp1538:aero:rust:test
	npm run tp1538:aero:rust:doc
	npm run reference-aam:rust:verify
	npm run reference-aam:rust:test
	npm run reference-aam:rust:doc
	npm run engine:rust:test
	npm run engine:rust:doc
	npm test
	npm run test:component

ci-local: toolchain-preflight
	$(MAKE) ci-quality
	$(MAKE) ci-tests
	npm run audit:production
