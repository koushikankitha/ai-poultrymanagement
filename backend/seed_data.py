import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def main() -> None:
    client = TestClient(app)
    sample_path = Path(__file__).resolve().parent / "data" / "sample_sensor_data.json"
    payloads = json.loads(sample_path.read_text(encoding="utf-8"))
    for item in payloads:
        response = client.post("/api/data", json=item)
        print(response.status_code, response.json())


if __name__ == "__main__":
    main()
