# Goldsmith

Human-in-the-loop builder for golden LLM eval datasets. Label 10 rows, review only the uncertain ones, get a measured "goldenness" report.

> Early development, built in public.

## Quickstart

Requirements: [uv](https://docs.astral.sh/uv/), Node 20+, PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension (for example `brew install postgresql@15 pgvector`).

```sh
make setup   # creates .env, databases, installs deps, runs migrations
make dev     # API on :8000, app on http://localhost:5173
make test
make lint
```

## Layout

- `backend/`: Python 3.12, FastAPI, SQLAlchemy, Alembic
- `frontend/`: React, Vite, TypeScript, Tailwind

## Credits

Goldsmith learns from these open-source projects: [DeepEval](https://github.com/confident-ai/deepeval), [distilabel](https://github.com/argilla-io/distilabel) and [Argilla](https://github.com/argilla-io/argilla), [Langfuse](https://github.com/langfuse/langfuse) and [Kiln](https://github.com/Kiln-AI/Kiln).

## Licence

Apache-2.0
