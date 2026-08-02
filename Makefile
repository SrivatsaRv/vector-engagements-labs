.PHONY: ci-local

ci-local:
	npm run lint
	npm run typecheck
	npm test
