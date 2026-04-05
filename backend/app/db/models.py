from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    node_id: Mapped[str] = mapped_column(String(20), index=True)
    temperature: Mapped[float] = mapped_column(Float)
    humidity: Mapped[float] = mapped_column(Float)
    ammonia: Mapped[float | None] = mapped_column(Float, nullable=True)
    soil_moisture: Mapped[float | None] = mapped_column(Float, nullable=True)
    relay1_on: Mapped[bool] = mapped_column(Boolean, default=False)
    relay2_on: Mapped[bool] = mapped_column(Boolean, default=False)
    sprinkler_on: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_decision: Mapped[bool] = mapped_column(Boolean, default=False)
    source_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    reading_source: Mapped[str] = mapped_column(String(20), default="hardware", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ControlEvent(Base):
    __tablename__ = "control_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    node_id: Mapped[str] = mapped_column(String(20), index=True)
    mode: Mapped[str] = mapped_column(String(20), default="manual")
    command: Mapped[str] = mapped_column(String(40))
    applied: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ControlProfile(Base):
    __tablename__ = "control_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    node_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    control_mode: Mapped[str] = mapped_column(String(20), default="ml")
    relay1_on: Mapped[bool] = mapped_column(Boolean, default=False)
    relay2_on: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
