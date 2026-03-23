from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers.datasets import router as datasets_router
from app.routers.jobs import router as jobs_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.converted_dir.mkdir(parents=True, exist_ok=True)
    Path(settings.db_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    yield

app = FastAPI(title="LiDAR Viewer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets_router)
app.include_router(jobs_router)

@app.get("/api/health")
def health():
    return {"status": "ok"}
