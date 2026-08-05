.PHONY: ci-local ci-quality ci-tests db-up db-down compose-up integration-ci integration-local observability-local performance-local worker-local

db-up:
	docker compose up -d database
	docker compose run --rm migrate

db-down:
	docker compose down

compose-up:
	docker compose up --build -d

integration-local: compose-up
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector npm run db:verify
	DATABASE_URL=postgres://vector:vector@127.0.0.1:55433/vector VECTOR_URL=http://127.0.0.1:4317 npm run app:verify
	VECTOR_URL=http://127.0.0.1:4317 npm run ui:responsive:verify

integration-ci:
	npm run db:migrate
	npm run db:seed
	npm run db:verify
	@set -eu; \
		npx wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port "$${PORT:-4317}" > /tmp/vector-integration.log 2>&1 & \
		app_pid=$$!; \
		trap 'kill "$$app_pid" >/dev/null 2>&1 || true' EXIT INT TERM; \
		npm run app:verify

observability-local: compose-up
	npm run observability:verify

performance-local:
	npm run performance:verify

worker-local:
	npm run build
	npm run runtime:verify
	npm run worker:verify

ci-quality:
	npm run symbols:verify
	npm run engine:rust:fmt
	npm run lint
	npm run typecheck

ci-tests:
	npm run engine:rust:clippy
	npm run engine:rust:verify
	npm run engine:rust:test
	npm run engine:rust:doc
	npm test

ci-local: ci-quality ci-tests
	npm run audit:production
