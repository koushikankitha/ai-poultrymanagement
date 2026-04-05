from __future__ import annotations

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
        {"temperature": 30.0, "humidity": 75.0, "sprinkler_on": 0}
    ]
    return pd.DataFrame(rows)


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


def _feature_importance(model: Pipeline) -> dict[str, list]:
    classifier = model.named_steps["classifier"]
    if hasattr(classifier, "feature_importances_"):
        importance = classifier.feature_importances_.tolist()
    elif hasattr(classifier, "coef_"):
        importance = [abs(float(value)) for value in classifier.coef_[0]]
    else:
        importance = [0.0 for _ in FEATURES]
    return {"features": FEATURES, "importance": importance}


def bootstrap_model() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_PATH.exists() and META_PATH.exists():
        metadata = joblib.load(META_PATH)
        if isinstance(metadata, dict) and {"best_model", "all_results", "confusion_matrix", "feature_importance"}.issubset(metadata.keys()):
            return
    train_model(bootstrap_dataset(), DEFAULT_VERSION)


def train_model(frame: pd.DataFrame, model_version: str) -> tuple[Pipeline, dict[str, object]]:
    X = frame[FEATURES]
    y = frame["sprinkler_on"]
    test_size = 0.25 if len(frame) >= 12 else 0.2
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y
    )

    results: dict[str, dict[str, float]] = {}
    best_model_name = ""
    best_model: Pipeline | None = None
    best_metrics: dict[str, float] = {}
    best_predictions = None

    for name, model in _build_models().items():
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
        metrics = _metrics_dict(y_test, predictions)
        results[name] = metrics
        if metrics["accuracy"] >= best_metrics.get("accuracy", -1):
            best_model_name = name
            best_model = model
            best_metrics = metrics
            best_predictions = predictions

    assert best_model is not None
    assert best_predictions is not None

    metadata: dict[str, object] = {
        "best_model": best_model_name,
        "model_version": model_version,
        **best_metrics,
        "all_results": results,
        "confusion_matrix": {
            "labels": LABELS,
            "matrix": confusion_matrix(y_test, best_predictions, labels=[0, 1]).tolist(),
        },
        "feature_importance": _feature_importance(best_model),
    }

    joblib.dump(best_model, MODEL_PATH)
    joblib.dump(metadata, META_PATH)
    return best_model, metadata


def build_training_frame(readings: list[SensorReading]) -> pd.DataFrame:
    records = [
        {
            "temperature": reading.temperature,
            "humidity": reading.humidity,
            "sprinkler_on": int(reading.sprinkler_on)
        }
        for reading in readings
    ]
    frame = pd.DataFrame(records)
    if len(frame) < 10:
        frame = pd.concat([frame, bootstrap_dataset()], ignore_index=True)
    return frame.dropna()


def load_model() -> Pipeline:
    bootstrap_model()
    return joblib.load(MODEL_PATH)


def load_metadata() -> dict[str, object]:
    bootstrap_model()
    return joblib.load(META_PATH)
