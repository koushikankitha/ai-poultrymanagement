from datetime import datetime

from pydantic import BaseModel, Field


class SensorReadingCreate(BaseModel):
    node_id: str = Field(..., examples=["N1"])
    temperature: float
    humidity: float
    ammonia: float | None = None
    soil_moisture: float | None = None
    relay1_on: bool = False
    relay2_on: bool = False
    sprinkler_on: bool | None = None
    source_payload: str | None = None
    reading_source: str = "hardware"


class RawPayloadRequest(BaseModel):
    payload: str = Field(..., examples=["N1, T35.6, H56, A99, S48, R10, R20"])


class SensorReadingResponse(BaseModel):
    id: int
    node_id: str
    temperature: float
    humidity: float
    ammonia: float | None = None
    soil_moisture: float | None = None
    relay1_on: bool
    relay2_on: bool
    sprinkler_on: bool
    ai_decision: bool
    reading_source: str
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardNodeSummary(BaseModel):
    node_id: str
    latest_reading: SensorReadingResponse
    status: str


class HistoryResponse(BaseModel):
    node_id: str | None
    count: int
    items: list[SensorReadingResponse]
