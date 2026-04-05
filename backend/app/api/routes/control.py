from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_admin
from app.db.database import get_db
from app.schemas.control import ControlModeRequest, ControlResponse, ControlStateResponse, ManualControlRequest
from app.services.repository import (
    create_control_event,
    get_all_control_profiles,
    get_control_profile,
    set_control_mode,
    set_manual_relays,
)

router = APIRouter(prefix="/control", tags=["control"])


@router.get("/state", response_model=list[ControlStateResponse])
def control_state(db: Session = Depends(get_db)):
    return get_all_control_profiles(db)


@router.get("/state/{node_id}", response_model=ControlStateResponse)
def control_state_for_node(node_id: str, db: Session = Depends(get_db)):
    return get_control_profile(db, node_id)


@router.post("/mode", response_model=ControlStateResponse)
def update_control_mode(
    payload: ControlModeRequest,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    profile = set_control_mode(db, payload.node_id, payload.control_mode)
    create_control_event(
        db=db,
        node_id=payload.node_id,
        command=f"MODE_{payload.control_mode.upper()}",
        applied=bool(settings.esp32_control_url),
        notes=payload.notes or "Control mode updated",
        mode=payload.control_mode,
    )
    return profile


@router.post("/manual", response_model=ControlResponse)
def manual_control(
    payload: ManualControlRequest,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    set_control_mode(db, payload.node_id, "manual")
    set_manual_relays(db, payload.node_id, payload.relay1_on, payload.relay2_on)
    command = f"R1{'1' if payload.relay1_on else '0'}_R2{'1' if payload.relay2_on else '0'}"
    applied = bool(settings.esp32_control_url)
    notes = payload.notes or (
        f"Queued for ESP32 endpoint {settings.esp32_control_url}"
        if settings.esp32_control_url
        else "Saved locally. Configure ESP32_CONTROL_URL to forward commands."
    )
    event = create_control_event(
        db=db,
        node_id=payload.node_id,
        command=command,
        applied=applied,
        notes=notes,
        mode="manual",
    )
    return event
