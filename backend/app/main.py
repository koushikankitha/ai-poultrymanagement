from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, control, data, ml
from app.core.config import settings
from app.db.database import Base, engine, ensure_schema
from app.ml.training import bootstrap_model

Base.metadata.create_all(bind=engine)
ensure_schema()
bootstrap_model()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="IoT monitoring and sprinkler control backend for poultry heat control.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(data.router, prefix=settings.api_v1_prefix)
app.include_router(ml.router, prefix=settings.api_v1_prefix)
app.include_router(control.router, prefix=settings.api_v1_prefix)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Smart Sprinkler Management System API is running"}
