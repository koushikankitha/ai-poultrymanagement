from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.ml.training import (
    available_model_names,
    build_training_frame,
    load_metadata,
    load_model,
    load_uploaded_training_frame,
    save_metadata,
    train_model,
)
from app.schemas.ml import MetricsResponse, ModelPreferenceRequest, PredictRequest, PredictResponse, RetrainResponse
from app.services.repository import get_training_frame

router = APIRouter(prefix="/ml", tags=["ml"])


@router.get("/metrics", response_model=MetricsResponse)
def get_metrics() -> MetricsResponse:
    metadata = load_metadata()
    metadata.setdefault("preferred_model", "Auto")
    metadata.setdefault("available_models", ["Auto", *available_model_names()])
    metadata.setdefault("current_model", str(metadata.get("best_model", "Unknown")))
    return MetricsResponse(**metadata)


@router.post("/preference", response_model=MetricsResponse)
def set_preferred_model(payload: ModelPreferenceRequest) -> MetricsResponse:
    metadata = load_metadata()
    allowed_models = {"Auto", *available_model_names()}
    if payload.preferred_model not in allowed_models:
        raise HTTPException(status_code=400, detail="Unsupported model selection")

    metadata["preferred_model"] = payload.preferred_model
    metadata["available_models"] = ["Auto", *available_model_names()]
    save_metadata(metadata)
    return MetricsResponse(**metadata)


@router.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    model = load_model()
    probabilities = model.predict_proba([[payload.temperature, payload.humidity]])[0]
    prediction = bool(model.predict([[payload.temperature, payload.humidity]])[0])
    confidence = float(max(probabilities))
    metadata = load_metadata()
    reason = (
        "Sprinkler recommended because heat stress risk is elevated."
        if prediction
        else "Current climate is within the safer operating range."
    )
    return PredictResponse(
        sprinkler_on=prediction,
        confidence=confidence,
        model_version=str(metadata["model_version"]),
        reason=reason,
    )


@router.post("/retrain", response_model=RetrainResponse)
def retrain(db: Session = Depends(get_db)) -> RetrainResponse:
    try:
        rows = get_training_frame(db)
        frame = build_training_frame(rows)
        version = f"retrained-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        previous_metadata = load_metadata()
        _, metadata = train_model(frame, version, preferred_model=str(previous_metadata.get("preferred_model", "Auto")))
        return RetrainResponse(
            trained_samples=len(frame),
            accuracy=float(metadata["accuracy"]),
            model_version=version,
            best_model=str(metadata["best_model"]),
            source="database",
            current_model=str(metadata["current_model"]),
            preferred_model=str(metadata["preferred_model"]),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/retrain/upload", response_model=RetrainResponse)
async def retrain_from_upload(file: UploadFile = File(...)) -> RetrainResponse:
    try:
        contents = await file.read()
        frame = load_uploaded_training_frame(contents, file.filename or "")
        version = f"uploaded-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        previous_metadata = load_metadata()
        _, metadata = train_model(frame, version, preferred_model=str(previous_metadata.get("preferred_model", "Auto")))
        return RetrainResponse(
            trained_samples=len(frame),
            accuracy=float(metadata["accuracy"]),
            model_version=version,
            best_model=str(metadata["best_model"]),
            source=file.filename or "uploaded dataset",
            current_model=str(metadata["current_model"]),
            preferred_model=str(metadata["preferred_model"]),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
