"""Fail-fast database migration bootstrap: never silently run a partial schema."""
from alembic import command
from alembic.config import Config


def bootstrap_database() -> None:
    import app.models  # noqa: F401
    command.upgrade(Config("alembic.ini"), "head")
