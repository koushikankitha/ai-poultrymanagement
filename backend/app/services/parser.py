from app.schemas.data import SensorReadingCreate


def parse_esp32_payload(payload: str) -> SensorReadingCreate:
    parts = [part.strip() for part in payload.split(",") if part.strip()]
    values: dict[str, str] = {}
    node_id = "N1"

    for part in parts:
        if part.startswith("N"):
            node_id = part
            continue
        prefix = part[0].upper()
        if prefix in {"T", "H", "A", "S"}:
            values[prefix] = part[1:]
            continue
        if prefix == "R" and len(part) >= 3:
            values[part[:2].upper()] = part[2:]

    relay1_raw = values.get("R1", "0")
    relay2_raw = values.get("R2", "0")
    sprinkler_on = relay1_raw.endswith("1") or relay2_raw.endswith("1")

    return SensorReadingCreate(
        node_id=node_id,
        temperature=float(values.get("T", "0")),
        humidity=float(values.get("H", "0")),
        ammonia=float(values["A"]) if "A" in values else None,
        soil_moisture=float(values["S"]) if "S" in values else None,
        relay1_on=relay1_raw.endswith("1"),
        relay2_on=relay2_raw.endswith("1"),
        sprinkler_on=sprinkler_on,
        source_payload=payload,
        reading_source="hardware",
    )
