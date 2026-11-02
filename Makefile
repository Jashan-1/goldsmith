.PHONY: setup db migrate dev test lint

UV := cd backend && uv run --env-file ../.env

# One-time: copy env, create databases, install deps, migrate.
setup:
	test -f .env || cp .env.example .env
	-createdb goldsmith
	-createdb goldsmith_test
	cd backend && uv sync
	cd frontend && npm install
	$(MAKE) migrate

migrate:
	$(UV) alembic upgrade head

# Runs API, worker and frontend together; Ctrl-C stops all.
dev:
	trap 'kill 0' EXIT; \
	($(UV) uvicorn goldsmith.main:app --reload --port 8000) & \
	($(UV) python -m goldsmith.worker) & \
	(cd frontend && npm run dev) & \
	wait

test:
	cd backend && uv run pytest -q
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy goldsmith
	cd frontend && npm run lint && npm run typecheck
