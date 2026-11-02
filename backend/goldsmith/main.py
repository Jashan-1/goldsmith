from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from goldsmith.db import engine


def create_app() -> FastAPI:
    app = FastAPI(title="Goldsmith")

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
