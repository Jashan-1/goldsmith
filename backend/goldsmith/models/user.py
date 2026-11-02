from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from goldsmith.db import Entity


class User(Entity):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320))
    name: Mapped[str] = mapped_column(String(200), default="")
    google_sub: Mapped[str] = mapped_column(String(255), unique=True)
