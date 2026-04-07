from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    temperature: float = Field(..., examples=[35.6])
    humidity: float = Field(..., examples=[56])


class PredictResponse(BaseModel):
    sprinkler_on: bool
    confidence: float
    model_version: str
    reason: str


class RetrainResponse(BaseModel):
    trained_samples: int
    accuracy: float
    model_version: str
    best_model: str
    source: str


class MetricsResponse(BaseModel):
    best_model: str
    model_version: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    all_results: dict[str, dict[str, float]]
    confusion_matrix: dict[str, list]
    feature_importance: dict[str, list]
