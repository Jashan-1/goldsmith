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

### Google sign-in

Locally, `DEV_AUTH_BYPASS=true` signs you in as a fake dev user. For real Google sign-in, create an OAuth client (type "Web application") in Google Cloud Console, add `http://localhost:5173/api/auth/google/callback` as an authorised redirect URI, put the client ID and secret in `.env`, and set `DEV_AUTH_BYPASS=false`.

## Layout

- `backend/`: Python 3.12, FastAPI, SQLAlchemy, Alembic
- `frontend/`: React, Vite, TypeScript, Tailwind

## Credits

Goldsmith learns from these open-source projects: [DeepEval](https://github.com/confident-ai/deepeval), [distilabel](https://github.com/argilla-io/distilabel) and [Argilla](https://github.com/argilla-io/argilla), [Langfuse](https://github.com/langfuse/langfuse) and [Kiln](https://github.com/Kiln-AI/Kiln).

### Code and prompts adapted from other projects

- The labelling prompt ([label_v1.md](backend/goldsmith/llm/prompts/label_v1.md)) adapts the section layout of distilabel's `TextClassification` task template (Apache-2.0, Copyright Argilla, Inc.). See [NOTICE](NOTICE).

## Licence

Apache-2.0
