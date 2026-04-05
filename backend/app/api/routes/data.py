from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.data import (
    DashboardNodeSummary,
    HistoryResponse,
    RawPayloadRequest,
    SensorReadingCreate,
    SensorReadingResponse
)
from app.services.parser import parse_esp32_payload
from app.services.repository import create_reading, get_history, get_latest_by_node
from app.ml.training import load_model

router = APIRouter(tags=["data"])


def infer_ai_decision(temperature: float, humidity: float) -> bool:
    model = load_model()
    prediction = model.predict([[temperature, humidity]])[0]
    return bool(prediction)


@router.post("/data", response_model=SensorReadingResponse, status_code=status.HTTP_201_CREATED)
def ingest_data(payload: SensorReadingCreate | RawPayloadRequest, db: Session = Depends(get_db)):
    try:
        reading = (
            parse_esp32_payload(payload.payload)
            if isinstance(payload, RawPayloadRequest)
            else payload
        )
        ai_decision = infer_ai_decision(reading.temperature, reading.humidity)
        saved = create_reading(db, reading, ai_decision=ai_decision)
        return saved
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid sensor payload: {exc}") from exc


@router.get("/data", response_model=list[DashboardNodeSummary])
def read_latest_data(
    source: str | None = Query(default=None, alias="reading_source"),
    db: Session = Depends(get_db),
):
    rows = get_latest_by_node(db, reading_source=source)
    summaries: list[DashboardNodeSummary] = []
    for row in rows:
        status = "critical" if row.temperature >= 35 or row.humidity <= 50 else "safe"
        summaries.append(
            DashboardNodeSummary(node_id=row.node_id, latest_reading=row, status=status)
        )
    return summaries


@router.get("/history", response_model=HistoryResponse)
def read_history(
    node_id: str | None = Query(default=None),
    limit: int = Query(default=120, ge=1, le=1000),
    source: str | None = Query(default=None, alias="reading_source"),
    db: Session = Depends(get_db),
):
    items = get_history(db, node_id=node_id, limit=limit, reading_source=source)
    return HistoryResponse(node_id=node_id, count=len(items), items=items)
