.PHONY: ci-local db-up db-down compose-up integration-local

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

ci-local:
	npm run lint
	npm run typecheck
	npm test
