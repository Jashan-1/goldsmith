from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.sessions import SessionMiddleware

from goldsmith.api import auth, files, jobs, projects, rows
from goldsmith.config import settings
from goldsmith.db import engine


def create_app() -> FastAPI:
    if not settings.session_secret:
        raise RuntimeError("SESSION_SECRET must be set (see .env.example).")

    app = FastAPI(title="Goldsmith")
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, same_site="lax")
    for module in (auth, projects, files, jobs, rows):
        app.include_router(module.router)

    @app.get("/api/health")
    def health() -> dict[str, object]:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except SQLAlchemyError:
            db_ok = False
        return {"status": "ok", "db": db_ok}

    return app


app = create_app()
