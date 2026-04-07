from __future__ import annotations

from io import BytesIO
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from app.db.models import SensorReading

MODEL_DIR = Path(__file__).resolve().parents[2] / "data"
MODEL_PATH = MODEL_DIR / "sprinkler_model.joblib"
META_PATH = MODEL_DIR / "sprinkler_model_meta.joblib"

DEFAULT_VERSION = "bootstrap-v2"
FEATURES = ["temperature", "humidity"]
LABELS = ["OFF", "ON"]
REQUIRED_COLUMNS = ["temperature", "humidity", "sprinkler_on"]
MODEL_NAMES = [
    "Random Forest",
    "Gradient Boosting",
    "Decision Tree",
    "Logistic Regression",
]


def bootstrap_dataset() -> pd.DataFrame:
    rows = [
        {"temperature": 28.0, "humidity": 72.0, "sprinkler_on": 0},
        {"temperature": 29.5, "humidity": 69.0, "sprinkler_on": 0},
        {"temperature": 30.2, "humidity": 66.0, "sprinkler_on": 0},
        {"temperature": 31.0, "humidity": 63.0, "sprinkler_on": 0},
        {"temperature": 32.0, "humidity": 61.0, "sprinkler_on": 0},
        {"temperature": 33.5, "humidity": 58.0, "sprinkler_on": 1},
        {"temperature": 34.2, "humidity": 53.0, "sprinkler_on": 1},
        {"temperature": 35.0, "humidity": 55.0, "sprinkler_on": 1},
        {"temperature": 36.2, "humidity": 51.0, "sprinkler_on": 1},
        {"temperature": 37.8, "humidity": 48.0, "sprinkler_on": 1},
        {"temperature": 34.8, "humidity": 49.0, "sprinkler_on": 1},
        {"temperature": 30.0, "humidity": 75.0, "sprinkler_on": 0},
    ]
    return pd.DataFrame(rows)


def _parse_sprinkler_value(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)) and value in (0, 1):
        return int(value)

    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "on", "yes"}:
        return 1
    if normalized in {"0", "false", "off", "no"}:
        return 0
    raise ValueError("sprinkler_on values must be 0/1, true/false, or on/off")


def _metrics_dict(y_true, y_pred) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
    }


def _build_models() -> dict[str, Pipeline]:
    return {
        "Random Forest": Pipeline(
            steps=[
                ("classifier", RandomForestClassifier(n_estimators=80, max_depth=6, random_state=42))
            ]
        ),
        "Gradient Boosting": Pipeline(
            steps=[("classifier", GradientBoostingClassifier(random_state=42))]
        ),
        "Decision Tree": Pipeline(
            steps=[("classifier", DecisionTreeClassifier(max_depth=5, random_state=42))]
        ),
        "Logistic Regression": Pipeline(
            steps=[("scaler", StandardScaler()), ("classifier", LogisticRegression(random_state=42))]
        ),
    }


def available_model_names() -> list[str]:
    return MODEL_NAMES.copy()


def _feature_importance(model: Pipeline) -> dict[str, list]:
    classifier = model.named_steps["classifier"]
    if hasattr(classifier, "feature_importances_"):
        importance = classifier.feature_importances_.tolist()
    elif hasattr(classifier, "coef_"):
        importance = [abs(float(value)) for value in classifier.coef_[0]]
    else:
        importance = [0.0 for _ in FEATURES]
    return {"features": FEATURES, "importance": importance}


def _normalize_training_frame(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.rename(columns={column: str(column).strip().lower() for column in frame.columns})
    missing = [column for column in REQUIRED_COLUMNS if column not in normalized.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing)}")

    cleaned = normalized[REQUIRED_COLUMNS].copy()
    cleaned["temperature"] = pd.to_numeric(cleaned["temperature"], errors="coerce")
    cleaned["humidity"] = pd.to_numeric(cleaned["humidity"], errors="coerce")
    cleaned["sprinkler_on"] = cleaned["sprinkler_on"].map(_parse_sprinkler_value)
    cleaned = cleaned.dropna()
    return cleaned.reset_index(drop=True)


def load_uploaded_training_frame(contents: bytes, filename: str) -> pd.DataFrame:
    if not filename.lower().endswith(".csv"):
        raise ValueError("Only CSV datasets are supported right now")

    frame = pd.read_csv(BytesIO(contents))
    return _normalize_training_frame(frame)


def validate_training_frame(frame: pd.DataFrame) -> None:
    if len(frame) < 6:
        raise ValueError("Dataset must contain at least 6 usable rows")

    class_counts = frame["sprinkler_on"].value_counts()
    if class_counts.size < 2:
        raise ValueError("Dataset must include both sprinkler OFF and ON examples")
    if int(class_counts.min()) < 2:
        raise ValueError("Each class needs at least 2 rows so the train/test split can run")


def _select_model(
    results: dict[str, dict[str, float]],
    trained_models: dict[str, Pipeline],
    preferred_model: str | None,
) -> tuple[str, Pipeline, dict[str, float]]:
    if preferred_model and preferred_model != "Auto":
        if preferred_model not in trained_models:
            raise ValueError(f"Unknown model selection: {preferred_model}")
        return preferred_model, trained_models[preferred_model], results[preferred_model]

    best_name = ""
    best_metrics: dict[str, float] = {}
    for name, metrics in results.items():
        if metrics["accuracy"] >= best_metrics.get("accuracy", -1):
            best_name = name
            best_metrics = metrics

    if not best_name:
        raise ValueError("No model could be selected for training")
    return best_name, trained_models[best_name], best_metrics


def bootstrap_model() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_PATH.exists() and META_PATH.exists():
        metadata = joblib.load(META_PATH)
        if isinstance(metadata, dict) and {"best_model", "all_results", "confusion_matrix", "feature_importance"}.issubset(metadata.keys()):
            metadata.setdefault("preferred_model", "Auto")
            metadata.setdefault("available_models", available_model_names())
            metadata.setdefault("current_model", metadata.get("best_model", "Unknown"))
            return
    train_model(bootstrap_dataset(), DEFAULT_VERSION)


def train_model(
    frame: pd.DataFrame,
    model_version: str,
    preferred_model: str | None = None,
) -> tuple[Pipeline, dict[str, object]]:
    validate_training_frame(frame)
    X = frame[FEATURES]
    y = frame["sprinkler_on"]
    test_size = 0.25 if len(frame) >= 12 else 0.2
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y
    )

    results: dict[str, dict[str, float]] = {}
    trained_models: dict[str, Pipeline] = {}

    for name, model in _build_models().items():
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
        metrics = _metrics_dict(y_test, predictions)
        results[name] = metrics
        trained_models[name] = model

    selected_model_name, selected_model, selected_metrics = _select_model(
        results,
        trained_models,
        preferred_model,
    )
    selected_predictions = selected_model.predict(X_test)

    best_model_name, _, best_metrics = _select_model(results, trained_models, None)

    metadata: dict[str, object] = {
        "best_model": best_model_name,
        "current_model": selected_model_name,
        "model_version": model_version,
        **selected_metrics,
        "all_results": results,
        "confusion_matrix": {
            "labels": LABELS,
            "matrix": confusion_matrix(y_test, selected_predictions, labels=[0, 1]).tolist(),
        },
        "feature_importance": _feature_importance(selected_model),
        "preferred_model": preferred_model or "Auto",
        "available_models": available_model_names(),
        "best_accuracy": best_metrics["accuracy"],
    }

    joblib.dump(selected_model, MODEL_PATH)
    joblib.dump(metadata, META_PATH)
    return selected_model, metadata


def build_training_frame(readings: list[SensorReading]) -> pd.DataFrame:
    records = [
        {
            "temperature": reading.temperature,
            "humidity": reading.humidity,
            "sprinkler_on": int(reading.sprinkler_on),
        }
        for reading in readings
    ]
    frame = pd.DataFrame(records)
    if len(frame) < 10:
        frame = pd.concat([frame, bootstrap_dataset()], ignore_index=True)
    return _normalize_training_frame(frame)


def load_model() -> Pipeline:
    bootstrap_model()
    return joblib.load(MODEL_PATH)


def save_metadata(metadata: dict[str, object]) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(metadata, META_PATH)


def load_metadata() -> dict[str, object]:
    bootstrap_model()
    return joblib.load(META_PATH)
