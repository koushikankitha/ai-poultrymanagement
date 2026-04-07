from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ManualControlRequest(BaseModel):
    node_id: str
    relay1_on: bool
    relay2_on: bool
    notes: str | None = None


class ControlModeRequest(BaseModel):
    node_id: str
    control_mode: Literal["ml", "manual", "esp32_fallback"]
    notes: str | None = None


class ControlResponse(BaseModel):
    id: int
    node_id: str
    mode: str
    command: str
    applied: bool
    notes: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ControlStateResponse(BaseModel):
    node_id: str
    control_mode: Literal["ml", "manual", "esp32_fallback"]
    relay1_on: bool
    relay2_on: bool
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
