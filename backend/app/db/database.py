from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def ensure_schema() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("sensor_readings"):
        return
    columns = {column["name"] for column in inspector.get_columns("sensor_readings")}
    if "reading_source" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE sensor_readings ADD COLUMN reading_source VARCHAR(20) DEFAULT 'hardware'")
            )
            connection.execute(
                text("UPDATE sensor_readings SET reading_source = 'hardware' WHERE reading_source IS NULL")
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
