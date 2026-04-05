from collections import OrderedDict
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import ControlEvent, ControlProfile, SensorReading
from app.schemas.data import SensorReadingCreate


def create_reading(
    db: Session, reading: SensorReadingCreate, ai_decision: bool
) -> SensorReading:
    sprinkler_on = (
        reading.sprinkler_on
        if reading.sprinkler_on is not None
        else reading.relay1_on or reading.relay2_on
    )
    db_item = SensorReading(
        node_id=reading.node_id,
        temperature=reading.temperature,
        humidity=reading.humidity,
        ammonia=reading.ammonia,
        soil_moisture=reading.soil_moisture,
        relay1_on=reading.relay1_on,
        relay2_on=reading.relay2_on,
        sprinkler_on=sprinkler_on,
        ai_decision=ai_decision,
        source_payload=reading.source_payload,
        reading_source=reading.reading_source,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    ensure_control_profile(db, reading.node_id)
    return db_item


def get_latest_by_node(db: Session, reading_source: str | None = None) -> list[SensorReading]:
    stmt = select(SensorReading)
    if reading_source:
        stmt = stmt.where(SensorReading.reading_source == reading_source)
    stmt = stmt.order_by(desc(SensorReading.created_at))
    rows = db.execute(stmt).scalars().all()
    grouped: OrderedDict[str, SensorReading] = OrderedDict()
    for row in rows:
        if row.node_id not in grouped:
            grouped[row.node_id] = row
    return list(grouped.values())


def get_history(
    db: Session,
    node_id: str | None = None,
    limit: int = 100,
    reading_source: str | None = None,
) -> list[SensorReading]:
    stmt = select(SensorReading)
    if node_id:
        stmt = stmt.where(SensorReading.node_id == node_id)
    if reading_source:
        stmt = stmt.where(SensorReading.reading_source == reading_source)
    stmt = stmt.order_by(desc(SensorReading.created_at)).limit(limit)
    return list(reversed(db.execute(stmt).scalars().all()))


def get_training_frame(db: Session) -> list[SensorReading]:
    stmt = select(SensorReading).where(SensorReading.reading_source == "hardware").order_by(desc(SensorReading.created_at)).limit(5000)
    rows = db.execute(stmt).scalars().all()
    if rows:
        return rows
    fallback = select(SensorReading).order_by(desc(SensorReading.created_at)).limit(5000)
    return db.execute(fallback).scalars().all()


def create_control_event(
    db: Session, node_id: str, command: str, applied: bool, notes: str | None, mode: str = "manual"
) -> ControlEvent:
    db_item = ControlEvent(
        node_id=node_id,
        mode=mode,
        command=command,
        applied=applied,
        notes=notes,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


def ensure_control_profile(db: Session, node_id: str) -> ControlProfile:
    stmt = select(ControlProfile).where(ControlProfile.node_id == node_id)
    profile = db.execute(stmt).scalar_one_or_none()
    if profile is None:
        profile = ControlProfile(node_id=node_id, control_mode="ml", relay1_on=False, relay2_on=False)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def get_control_profile(db: Session, node_id: str) -> ControlProfile:
    return ensure_control_profile(db, node_id)


def get_all_control_profiles(db: Session) -> list[ControlProfile]:
    return db.execute(select(ControlProfile).order_by(ControlProfile.node_id)).scalars().all()


def set_control_mode(db: Session, node_id: str, control_mode: str) -> ControlProfile:
    profile = ensure_control_profile(db, node_id)
    profile.control_mode = control_mode
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


def set_manual_relays(db: Session, node_id: str, relay1_on: bool, relay2_on: bool) -> ControlProfile:
    profile = ensure_control_profile(db, node_id)
    profile.relay1_on = relay1_on
    profile.relay2_on = relay2_on
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile
