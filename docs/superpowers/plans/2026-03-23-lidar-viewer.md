# LiDAR Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a containerized web application for uploading and visualizing LiDAR point cloud datasets, matching LidarMill's Cloud Viewer feature set.

**Architecture:** React/TypeScript frontend with potree-core (Three.js) for WebGL point cloud rendering, FastAPI backend for upload/dataset management, PotreeConverter 2.1.1 (C++) for LAZ→octree conversion, all running in Podman containers with a shared data volume.

**Tech Stack:** React 18, TypeScript, Vite, potree-core 2.0.13, Three.js, FastAPI, SQLAlchemy, SQLite, PotreeConverter 2.1.1, Podman, nginx

**Spec:** `docs/superpowers/specs/2026-03-23-lidar-viewer-design.md`

---

## File Structure

```
lidar1/
├── podman-compose.yml                    # Container orchestration
├── .gitignore                            # Already exists
│
├── frontend/
│   ├── Dockerfile                        # Multi-stage: node build → nginx serve
│   ├── nginx.conf                        # Proxy /api/*, serve /tiles/*, SPA fallback
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                      # React entry point
│       ├── App.tsx                       # Layout shell, dataset state
│       ├── App.css                       # Global dark theme styles
│       ├── types/
│       │   └── dataset.ts               # Dataset, Job, ChunkUploadState types
│       ├── api/
│       │   └── client.ts                # Fetch wrapper for /api/* endpoints
│       ├── hooks/
│       │   ├── usePotree.ts             # Potree viewer lifecycle + settings bridge
│       │   └── useAdaptivePerformance.ts # FPS monitor, auto-adjust point budget/EDL
│       ├── components/
│       │   ├── Toolbar.tsx              # Upload button, dataset selector, CRS display
│       │   ├── UploadDialog.tsx         # Chunked upload with progress bar
│       │   ├── ViewerCanvas.tsx         # Three.js + potree-core mount point
│       │   └── Sidebar/
│       │       ├── Sidebar.tsx          # Collapsible panel container
│       │       ├── AppearancePanel.tsx  # Point size, budget, EDL, material mode
│       │       ├── ToolsPanel.tsx       # Measurement tools
│       │       ├── ClassificationPanel.tsx # Class visibility toggles
│       │       └── ScenePanel.tsx       # Dataset info, coords, FPS counter
│       └── lib/
│           └── potreeSetup.ts           # Potree + Three.js initialization helpers
│
├── api/
│   ├── Dockerfile                        # Python 3.12-slim
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       └── 001_initial.py           # datasets + jobs tables
│   └── app/
│       ├── main.py                      # FastAPI app, CORS, lifespan
│       ├── config.py                    # Settings (paths, limits, etc.)
│       ├── db.py                        # SQLAlchemy engine + session
│       ├── models/
│       │   └── dataset.py               # Dataset + Job ORM models
│       ├── routers/
│       │   ├── datasets.py              # CRUD + upload + download endpoints
│       │   └── jobs.py                  # Job status endpoint
│       └── services/
│           ├── upload.py                # Chunked upload logic, disk streaming
│           └── conversion.py            # Job queue interface (DB polling v1)
│
├── worker/
│   ├── Dockerfile                        # Python 3.12-slim + PotreeConverter built from source
│   └── app/
│       ├── main.py                      # Worker entry point, poll loop
│       ├── converter.py                 # PotreeConverter subprocess wrapper
│       └── models.py                    # Shared DB models (copied from api/app/models/dataset.py)
│
├── data/                                 # Bind mount, gitignored
│   ├── uploads/
│   ├── converted/
│   └── db/
│
├── dataset/                              # Test data, gitignored
│   └── SandyCreek_NAD832011_TX_Central_USft_NAVD88.laz
│
└── tests/
    ├── api/
    │   ├── test_datasets.py
    │   ├── test_upload.py
    │   └── test_jobs.py
    └── worker/
        └── test_converter.py
```

---

## Task 1: Worker Dockerfile — Build PotreeConverter from Source

This is the riskiest task (C++ build in container on ARM) so we tackle it first.

**Files:**
- Create: `worker/Dockerfile`

- [ ] **Step 1: Write the worker Dockerfile**

```dockerfile
# worker/Dockerfile
FROM python:3.12-slim AS potree-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cmake make g++ libtbb-dev \
    && rm -rf /var/lib/apt/lists/*

# Build LASzip
WORKDIR /build
RUN git clone https://github.com/LASzip/LASzip.git && \
    cd LASzip && \
    mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/laszip && \
    make -j$(nproc) && make install

# Build PotreeConverter
RUN git clone https://github.com/potree/PotreeConverter.git && \
    cd PotreeConverter && \
    mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release \
             -DLASZIP_INCLUDE_DIRS=/opt/laszip/include \
             -DLASZIP_LIBRARY=/opt/laszip/lib/liblaszip.so && \
    make -j$(nproc)

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libtbb12 \
    && rm -rf /var/lib/apt/lists/*

# Copy PotreeConverter binary and resources
COPY --from=potree-builder /build/PotreeConverter/build/PotreeConverter /usr/local/bin/
COPY --from=potree-builder /opt/laszip/lib/ /usr/local/lib/
COPY --from=potree-builder /build/PotreeConverter/resources/ /usr/local/share/PotreeConverter/resources/
RUN ldconfig

WORKDIR /app
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker/app/ ./app/

CMD ["python", "-m", "app.main"]
```

- [ ] **Step 2: Create minimal worker requirements.txt**

```
# worker/requirements.txt (placeholder — will add sqlalchemy later)
```

- [ ] **Step 3: Create minimal worker entry point**

```python
# worker/app/__init__.py
# (empty)

# worker/app/main.py
import subprocess
import sys

def check_potree_converter():
    """Verify PotreeConverter is available."""
    result = subprocess.run(
        ["PotreeConverter", "--help"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("PotreeConverter not found or failed", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    print("PotreeConverter is available")
    print(result.stdout[:200])

if __name__ == "__main__":
    check_potree_converter()
    print("Worker ready (poll loop not yet implemented)")
```

- [ ] **Step 4: Build the worker image**

Run: `podman build -t lidar-worker -f worker/Dockerfile worker/`
Expected: Image builds successfully, PotreeConverter compiles on ARM64.
If LASzip `.so` path differs (e.g., `.dylib` or `lib64/`), adjust the COPY path.

- [ ] **Step 5: Verify PotreeConverter runs in container**

Run: `podman run --rm lidar-worker`
Expected: "PotreeConverter is available" and "Worker ready" printed.

- [ ] **Step 6: Test PotreeConverter with sample data**

Run:
```bash
podman run --rm \
  -v ./dataset:/input:ro \
  -v ./data/converted:/output \
  lidar-worker \
  PotreeConverter /input/SandyCreek_NAD832011_TX_Central_USft_NAVD88.laz \
    -o /output/test-run \
    --generate-page index
```
Expected: Octree files generated in `data/converted/test-run/`. This will take a while with 28GB on 8GB RAM. Verify output includes `metadata.json` and `octree.bin`.

Note: If this OOMs, add `--memory-limit 3000` (3GB) to the PotreeConverter command.

- [ ] **Step 7: Commit**

```bash
git add worker/
git commit -m "feat: add worker Dockerfile with PotreeConverter 2.1.1 built from source"
```

---

## Task 2: API Backend — Database & Core Models

**Files:**
- Create: `api/Dockerfile`
- Create: `api/requirements.txt`
- Create: `api/app/__init__.py`
- Create: `api/app/main.py`
- Create: `api/app/config.py`
- Create: `api/app/db.py`
- Create: `api/app/models/__init__.py`
- Create: `api/app/models/dataset.py`
- Create: `api/alembic.ini`
- Create: `api/alembic/env.py`
- Create: `api/alembic/versions/001_initial.py`

- [ ] **Step 1: Write requirements.txt**

```
# api/requirements.txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
alembic==1.14.1
aiosqlite==0.20.0
python-multipart==0.0.18
pydantic==2.10.4
pydantic-settings==2.7.1
```

- [ ] **Step 2: Write config.py**

```python
# api/app/config.py
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    data_dir: Path = Path("/data")
    upload_dir: Path = Path("/data/uploads")
    converted_dir: Path = Path("/data/converted")
    db_url: str = "sqlite:////data/db/lidar.db"
    chunk_size_mb: int = 10
    max_upload_size_gb: int = 200

    model_config = {"env_prefix": "LIDAR_"}

settings = Settings()
```

- [ ] **Step 3: Write db.py**

```python
# api/app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

engine = create_engine(
    settings.db_url,
    connect_args={"check_same_thread": False},  # SQLite
)
SessionLocal = sessionmaker(bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Write dataset and job models**

```python
# api/app/models/__init__.py
from app.models.dataset import Dataset, Job

# api/app/models/dataset.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, Float, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.db import Base
import enum

class DatasetStatus(str, enum.Enum):
    uploading = "uploading"
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    failed = "failed"

class JobStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    complete = "complete"
    failed = "failed"

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=True)
    point_count = Column(BigInteger, nullable=True)
    crs = Column(String, nullable=True)
    bounds = Column(Text, nullable=True)  # JSON string
    status = Column(SAEnum(DatasetStatus), default=DatasetStatus.uploading, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    job = relationship("Job", back_populates="dataset", uselist=False)

class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    status = Column(SAEnum(JobStatus), default=JobStatus.pending, nullable=False)
    progress = Column(Float, default=0.0)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    dataset = relationship("Dataset", back_populates="job")
```

- [ ] **Step 5: Write alembic config**

```ini
# api/alembic.ini
[alembic]
script_location = alembic
sqlalchemy.url = sqlite:////data/db/lidar.db

[loggers]
keys = root

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

```python
# api/alembic/env.py
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.db import Base
from app.models import Dataset, Job  # noqa: F401 — register models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()
```

```python
# api/alembic/versions/001_initial.py
"""Initial tables: datasets and jobs"""
revision = "001"
down_revision = None

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("point_count", sa.BigInteger(), nullable=True),
        sa.Column("crs", sa.String(), nullable=True),
        sa.Column("bounds", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="uploading"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dataset_id", sa.String(), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("progress", sa.Float(), server_default="0.0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )

def downgrade():
    op.drop_table("jobs")
    op.drop_table("datasets")
```

- [ ] **Step 6: Write FastAPI main.py with health check**

```python
# api/app/__init__.py
# (empty)

# api/app/main.py
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure data directories exist
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

@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Write the API Dockerfile**

```dockerfile
# api/Dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 8: Write test for health endpoint**

```python
# tests/api/test_health.py
from fastapi.testclient import TestClient

def test_health(tmp_path, monkeypatch):
    monkeypatch.setenv("LIDAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIDAR_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("LIDAR_CONVERTED_DIR", str(tmp_path / "converted"))
    monkeypatch.setenv("LIDAR_DB_URL", f"sqlite:///{tmp_path}/db/lidar.db")

    from app.main import app
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 9: Run tests**

Run: `cd api && pip install -r requirements.txt && pip install pytest httpx && python -m pytest ../tests/api/test_health.py -v`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add api/ tests/api/test_health.py
git commit -m "feat: add API backend with FastAPI, SQLAlchemy models, and alembic migrations"
```

---

## Task 3: API — Chunked Upload Endpoint

**Files:**
- Create: `api/app/routers/__init__.py`
- Create: `api/app/routers/datasets.py`
- Create: `api/app/services/__init__.py`
- Create: `api/app/services/upload.py`
- Create: `api/app/services/conversion.py`
- Modify: `api/app/main.py` (register router)
- Create: `tests/api/test_upload.py`

- [ ] **Step 1: Write upload service**

```python
# api/app/services/__init__.py
# (empty)

# api/app/services/upload.py
from pathlib import Path
from app.config import settings

async def save_chunk(dataset_id: str, chunk_index: int, chunk_data: bytes) -> Path:
    """Save an upload chunk to disk. Returns the chunk file path."""
    dataset_dir = settings.upload_dir / dataset_id
    dataset_dir.mkdir(parents=True, exist_ok=True)
    chunk_path = dataset_dir / f"chunk_{chunk_index:06d}"
    chunk_path.write_bytes(chunk_data)
    return chunk_path

def assemble_chunks(dataset_id: str, filename: str, total_chunks: int) -> Path:
    """Assemble chunks into the final file. Returns the final file path."""
    dataset_dir = settings.upload_dir / dataset_id
    final_path = dataset_dir / filename

    with open(final_path, "wb") as out:
        for i in range(total_chunks):
            chunk_path = dataset_dir / f"chunk_{i:06d}"
            out.write(chunk_path.read_bytes())
            chunk_path.unlink()  # Clean up chunk

    return final_path

def get_existing_chunks(dataset_id: str) -> list[int]:
    """Return list of chunk indices already uploaded (for resume)."""
    dataset_dir = settings.upload_dir / dataset_id
    if not dataset_dir.exists():
        return []
    return sorted(
        int(f.stem.split("_")[1])
        for f in dataset_dir.glob("chunk_*")
    )
```

- [ ] **Step 2: Write conversion service interface**

```python
# api/app/services/conversion.py
from sqlalchemy.orm import Session
from app.models.dataset import Dataset, Job, DatasetStatus, JobStatus

def enqueue_conversion(db: Session, dataset: Dataset) -> Job:
    """Create a pending conversion job for the dataset."""
    job = Job(dataset_id=dataset.id, status=JobStatus.pending)
    dataset.status = DatasetStatus.uploaded
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
```

- [ ] **Step 3: Write datasets router with upload endpoints**

```python
# api/app/routers/__init__.py
# (empty)

# api/app/routers/datasets.py
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db import get_db
from app.models.dataset import Dataset, DatasetStatus, JobStatus
from app.services.upload import save_chunk, assemble_chunks, get_existing_chunks
from app.services.conversion import enqueue_conversion

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

class DatasetOut(BaseModel):
    id: str
    name: str
    filename: str
    file_size: int | None
    point_count: int | None
    crs: str | None
    status: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

class InitUploadResponse(BaseModel):
    dataset_id: str
    existing_chunks: list[int]

class ChunkUploadResponse(BaseModel):
    chunk_index: int
    received: bool

class FinalizeResponse(BaseModel):
    dataset_id: str
    status: str
    job_id: str

# --- Upload flow ---

@router.post("/upload/init", response_model=InitUploadResponse)
def init_upload(
    filename: str = Query(...),
    name: str = Query(None),
    db: Session = Depends(get_db),
):
    """Initialize an upload session. Returns dataset_id and any existing chunks (for resume)."""
    allowed = (".laz", ".las")
    if not any(filename.lower().endswith(ext) for ext in allowed):
        raise HTTPException(400, f"File must be one of: {allowed}")

    dataset_id = str(uuid.uuid4())
    dataset = Dataset(
        id=dataset_id,
        name=name or Path(filename).stem,
        filename=filename,
        status=DatasetStatus.uploading,
    )
    db.add(dataset)
    db.commit()

    return InitUploadResponse(
        dataset_id=dataset_id,
        existing_chunks=get_existing_chunks(dataset_id),
    )

@router.post("/upload/{dataset_id}/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    dataset_id: str,
    chunk_index: int = Query(...),
    file: UploadFile = ...,
    db: Session = Depends(get_db),
):
    """Upload a single chunk. Streams directly to disk."""
    dataset = db.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    if dataset.status != DatasetStatus.uploading:
        raise HTTPException(400, "Upload already finalized")

    chunk_data = await file.read()
    await save_chunk(dataset_id, chunk_index, chunk_data)

    return ChunkUploadResponse(chunk_index=chunk_index, received=True)

@router.post("/upload/{dataset_id}/finalize", response_model=FinalizeResponse)
def finalize_upload(
    dataset_id: str,
    total_chunks: int = Query(...),
    db: Session = Depends(get_db),
):
    """Assemble chunks and enqueue conversion."""
    dataset = db.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    final_path = assemble_chunks(dataset_id, dataset.filename, total_chunks)
    dataset.file_size = final_path.stat().st_size
    db.commit()

    job = enqueue_conversion(db, dataset)
    return FinalizeResponse(
        dataset_id=dataset_id,
        status=dataset.status.value,
        job_id=job.id,
    )

# --- CRUD ---

@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)):
    datasets = db.query(Dataset).order_by(Dataset.created_at.desc()).all()
    return [DatasetOut.model_validate(d) for d in datasets]

@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    return DatasetOut.model_validate(dataset)

@router.get("/{dataset_id}/download")
def download_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """Download the original LAZ file at full sensor precision."""
    dataset = db.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    from app.config import settings
    file_path = settings.upload_dir / dataset_id / dataset.filename
    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")

    return FileResponse(
        path=str(file_path),
        filename=dataset.filename,
        media_type="application/octet-stream",
    )

@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter_by(id=dataset_id).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    # Clean up files
    import shutil
    from app.config import settings
    upload_dir = settings.upload_dir / dataset_id
    converted_dir = settings.converted_dir / dataset_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir)
    if converted_dir.exists():
        shutil.rmtree(converted_dir)

    # Delete job first (FK), then dataset
    if dataset.job:
        db.delete(dataset.job)
    db.delete(dataset)
    db.commit()
    return {"deleted": True}
```

- [ ] **Step 4: Register router in main.py**

Add to `api/app/main.py` after app creation:

```python
from app.routers.datasets import router as datasets_router
app.include_router(datasets_router)
```

- [ ] **Step 5: Write upload tests**

```python
# tests/api/test_upload.py
import io
from fastapi.testclient import TestClient

def make_client(tmp_path, monkeypatch):
    monkeypatch.setenv("LIDAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIDAR_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("LIDAR_CONVERTED_DIR", str(tmp_path / "converted"))
    monkeypatch.setenv("LIDAR_DB_URL", f"sqlite:///{tmp_path}/db/lidar.db")

    # Create tables
    from app.db import engine, Base
    from app.models import Dataset, Job  # noqa
    Base.metadata.create_all(bind=engine)

    from app.main import app
    return TestClient(app)

def test_init_upload(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    r = client.post("/api/datasets/upload/init?filename=test.laz")
    assert r.status_code == 200
    data = r.json()
    assert "dataset_id" in data
    assert data["existing_chunks"] == []

def test_init_upload_rejects_bad_extension(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    r = client.post("/api/datasets/upload/init?filename=test.csv")
    assert r.status_code == 400

def test_upload_chunk_and_finalize(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    # Init
    r = client.post("/api/datasets/upload/init?filename=test.laz")
    dataset_id = r.json()["dataset_id"]

    # Upload 2 chunks
    for i in range(2):
        chunk = io.BytesIO(b"x" * 1024)
        r = client.post(
            f"/api/datasets/upload/{dataset_id}/chunk?chunk_index={i}",
            files={"file": ("chunk", chunk)},
        )
        assert r.status_code == 200

    # Finalize
    r = client.post(f"/api/datasets/upload/{dataset_id}/finalize?total_chunks=2")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "uploaded"
    assert "job_id" in data

    # Verify file exists
    final_file = tmp_path / "uploads" / dataset_id / "test.laz"
    assert final_file.exists()
    assert final_file.stat().st_size == 2048

def test_list_datasets(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    r = client.get("/api/datasets")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_delete_dataset(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    # Create one
    r = client.post("/api/datasets/upload/init?filename=test.laz")
    dataset_id = r.json()["dataset_id"]

    # Delete it
    r = client.delete(f"/api/datasets/{dataset_id}")
    assert r.status_code == 200

    # Gone
    r = client.get(f"/api/datasets/{dataset_id}")
    assert r.status_code == 404
```

- [ ] **Step 6: Run tests**

Run: `cd api && python -m pytest ../tests/api/ -v`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add api/app/routers/ api/app/services/ tests/api/test_upload.py
git commit -m "feat: add chunked upload, dataset CRUD, and download endpoints"
```

---

## Task 4: API — Jobs Router

**Files:**
- Create: `api/app/routers/jobs.py`
- Modify: `api/app/main.py` (register router)
- Create: `tests/api/test_jobs.py`

- [ ] **Step 1: Write jobs router**

```python
# api/app/routers/jobs.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db import get_db
from app.models.dataset import Job

router = APIRouter(prefix="/api/datasets", tags=["jobs"])

class JobOut(BaseModel):
    id: str
    dataset_id: str
    status: str
    progress: float
    error: str | None
    started_at: str | None
    completed_at: str | None

    class Config:
        from_attributes = True

@router.get("/{dataset_id}/job", response_model=JobOut)
def get_job(dataset_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter_by(dataset_id=dataset_id).first()
    if not job:
        raise HTTPException(404, "No job found for this dataset")
    return JobOut.model_validate(job)
```

- [ ] **Step 2: Register router in main.py**

Add to `api/app/main.py`:
```python
from app.routers.jobs import router as jobs_router
app.include_router(jobs_router)
```

- [ ] **Step 3: Write job test**

```python
# tests/api/test_jobs.py
import io

def make_client(tmp_path, monkeypatch):
    monkeypatch.setenv("LIDAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIDAR_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("LIDAR_CONVERTED_DIR", str(tmp_path / "converted"))
    monkeypatch.setenv("LIDAR_DB_URL", f"sqlite:///{tmp_path}/db/lidar.db")
    from app.db import engine, Base
    from app.models import Dataset, Job  # noqa
    Base.metadata.create_all(bind=engine)
    from app.main import app
    from fastapi.testclient import TestClient
    return TestClient(app)

def test_get_job_after_upload(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    # Upload and finalize a dataset
    r = client.post("/api/datasets/upload/init?filename=test.laz")
    dataset_id = r.json()["dataset_id"]
    chunk = io.BytesIO(b"x" * 100)
    client.post(
        f"/api/datasets/upload/{dataset_id}/chunk?chunk_index=0",
        files={"file": ("chunk", chunk)},
    )
    client.post(f"/api/datasets/upload/{dataset_id}/finalize?total_chunks=1")

    # Check job
    r = client.get(f"/api/datasets/{dataset_id}/job")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "pending"
    assert data["dataset_id"] == dataset_id
```

- [ ] **Step 4: Run tests**

Run: `cd api && python -m pytest ../tests/api/ -v`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/routers/jobs.py tests/api/test_jobs.py api/app/main.py
git commit -m "feat: add job status endpoint"
```

---

## Task 5: Worker — Conversion Pipeline

**Files:**
- Create: `worker/app/converter.py`
- Modify: `worker/app/main.py` (add poll loop)
- Create: `worker/requirements.txt`
- Create: `tests/worker/test_converter.py`

- [ ] **Step 1: Write converter module**

```python
# worker/app/converter.py
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class ConversionError(Exception):
    pass

def run_potree_converter(
    input_path: Path,
    output_dir: Path,
    memory_limit_mb: int = 3000,
) -> Path:
    """
    Run PotreeConverter on a LAZ file.
    Returns the output directory path.
    Raises ConversionError on failure.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "PotreeConverter",
        str(input_path),
        "-o", str(output_dir),
        "--generate-page", "index",
    ]

    logger.info(f"Running: {' '.join(cmd)}")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=7200,  # 2 hour timeout
    )

    if result.returncode != 0:
        raise ConversionError(
            f"PotreeConverter failed (exit {result.returncode}): {result.stderr[-2000:]}"
        )

    metadata = output_dir / "metadata.json"
    if not metadata.exists():
        raise ConversionError(
            f"PotreeConverter completed but metadata.json not found in {output_dir}"
        )

    logger.info(f"Conversion complete: {output_dir}")
    return output_dir
```

- [ ] **Step 2: Write worker poll loop**

```python
# worker/app/main.py
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Worker connects to the same DB as the API
import os
DB_URL = os.environ.get("LIDAR_DB_URL", "sqlite:////data/db/lidar.db")
UPLOAD_DIR = Path(os.environ.get("LIDAR_UPLOAD_DIR", "/data/uploads"))
CONVERTED_DIR = Path(os.environ.get("LIDAR_CONVERTED_DIR", "/data/converted"))
POLL_INTERVAL = int(os.environ.get("LIDAR_POLL_INTERVAL", "5"))

from app.models import Dataset, Job, DatasetStatus, JobStatus
from app.converter import run_potree_converter, ConversionError

def get_session():
    engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
    return sessionmaker(bind=engine)()

def poll_and_process():

    db = get_session()
    try:
        # Find next pending job
        job = db.query(Job).filter_by(status=JobStatus.pending).order_by(Job.id).first()
        if not job:
            return False

        dataset = db.query(Dataset).filter_by(id=job.dataset_id).first()
        if not dataset:
            job.status = JobStatus.failed
            job.error = "Dataset not found"
            db.commit()
            return True

        # Mark as processing
        job.status = JobStatus.processing
        job.started_at = datetime.now(timezone.utc)
        dataset.status = DatasetStatus.processing
        db.commit()

        logger.info(f"Processing dataset {dataset.id}: {dataset.filename}")

        input_path = UPLOAD_DIR / dataset.id / dataset.filename
        output_dir = CONVERTED_DIR / dataset.id

        try:
            run_potree_converter(input_path, output_dir)
            job.status = JobStatus.complete
            job.progress = 100.0
            job.completed_at = datetime.now(timezone.utc)
            dataset.status = DatasetStatus.ready
            logger.info(f"Dataset {dataset.id} conversion complete")
        except ConversionError as e:
            job.status = JobStatus.failed
            job.error = str(e)
            job.completed_at = datetime.now(timezone.utc)
            dataset.status = DatasetStatus.failed
            logger.error(f"Dataset {dataset.id} conversion failed: {e}")

        db.commit()
        return True

    finally:
        db.close()

def main():
    logger.info("Worker starting, polling for jobs...")
    while True:
        try:
            had_work = poll_and_process()
            if not had_work:
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            logger.info("Worker shutting down")
            break
        except Exception:
            logger.exception("Unexpected error in poll loop")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Write worker models.py (shared with API)**

Copy the model definitions so the worker can query datasets and jobs independently. This file mirrors `api/app/models/dataset.py`:

```python
# worker/app/models.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, Float, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship, DeclarativeBase
import enum

class Base(DeclarativeBase):
    pass

class DatasetStatus(str, enum.Enum):
    uploading = "uploading"
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    failed = "failed"

class JobStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    complete = "complete"
    failed = "failed"

class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=True)
    point_count = Column(BigInteger, nullable=True)
    crs = Column(String, nullable=True)
    bounds = Column(Text, nullable=True)
    status = Column(SAEnum(DatasetStatus), default=DatasetStatus.uploading, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    job = relationship("Job", back_populates="dataset", uselist=False)

class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    status = Column(SAEnum(JobStatus), default=JobStatus.pending, nullable=False)
    progress = Column(Float, default=0.0)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    dataset = relationship("Dataset", back_populates="job")
```

- [ ] **Step 4: Write worker requirements.txt**

```
# worker/requirements.txt
sqlalchemy==2.0.36
```

- [ ] **Step 4: Write converter test**

```python
# tests/worker/test_converter.py
import subprocess
from unittest.mock import patch, MagicMock
from pathlib import Path

def test_run_potree_converter_success(tmp_path):
    from worker.app.converter import run_potree_converter

    input_file = tmp_path / "test.laz"
    input_file.write_bytes(b"fake laz data")
    output_dir = tmp_path / "output"

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "done"
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        # Create expected output
        output_dir.mkdir()
        (output_dir / "metadata.json").write_text("{}")

        result = run_potree_converter(input_file, output_dir)
        assert result == output_dir

def test_run_potree_converter_failure(tmp_path):
    from worker.app.converter import run_potree_converter, ConversionError

    input_file = tmp_path / "test.laz"
    input_file.write_bytes(b"fake")
    output_dir = tmp_path / "output"

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "some error"

    with patch("subprocess.run", return_value=mock_result):
        try:
            run_potree_converter(input_file, output_dir)
            assert False, "Should have raised"
        except ConversionError as e:
            assert "some error" in str(e)
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/worker/ -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add worker/ tests/worker/
git commit -m "feat: add worker with PotreeConverter subprocess wrapper and poll loop"
```

---

## Task 6: Podman Compose — Container Orchestration

**Files:**
- Create: `podman-compose.yml`
- Create: `frontend/nginx.conf`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Write nginx.conf**

```nginx
# frontend/nginx.conf
server {
    listen 80;
    server_name localhost;

    # Serve React SPA
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to FastAPI
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600;  # Long timeout for large uploads
        client_max_body_size 50m;  # Per-chunk size limit
    }

    # Serve converted point cloud tiles
    location /tiles/ {
        alias /data/converted/;
        add_header Access-Control-Allow-Origin *;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

- [ ] **Step 2: Write frontend Dockerfile (placeholder — React build comes in Task 7)**

```dockerfile
# frontend/Dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Write podman-compose.yml**

```yaml
# podman-compose.yml
version: "3.8"

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    volumes:
      - lidar-data:/data:ro
    depends_on:
      - api
    deploy:
      resources:
        limits:
          memory: 128M

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    volumes:
      - lidar-data:/data
    environment:
      - LIDAR_DB_URL=sqlite:////data/db/lidar.db
      - LIDAR_UPLOAD_DIR=/data/uploads
      - LIDAR_CONVERTED_DIR=/data/converted
    deploy:
      resources:
        limits:
          memory: 512M

  worker:
    build:
      context: .
      dockerfile: worker/Dockerfile
    volumes:
      - lidar-data:/data
    environment:
      - LIDAR_DB_URL=sqlite:////data/db/lidar.db
      - LIDAR_UPLOAD_DIR=/data/uploads
      - LIDAR_CONVERTED_DIR=/data/converted
      - LIDAR_POLL_INTERVAL=5
    deploy:
      resources:
        limits:
          memory: 4096M

volumes:
  lidar-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data
```

- [ ] **Step 4: Create data directories**

Run: `mkdir -p data/uploads data/converted data/db`

- [ ] **Step 5: Commit**

```bash
git add podman-compose.yml frontend/nginx.conf frontend/Dockerfile
git commit -m "feat: add podman-compose with nginx, API, and worker containers"
```

---

## Task 7: Frontend — Vite + React + TypeScript Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/App.css`
- Create: `frontend/src/types/dataset.ts`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Initialize React project**

Run:
```bash
cd frontend
npm create vite@latest . -- --template react-ts
```
If directory not empty, accept overwrite for config files. Then:
```bash
npm install
npm install three potree-core
npm install --save-dev @types/three
```

- [ ] **Step 2: Write types**

```typescript
// frontend/src/types/dataset.ts
export interface Dataset {
  id: string;
  name: string;
  filename: string;
  file_size: number | null;
  point_count: number | null;
  crs: string | null;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  dataset_id: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ChunkUploadState {
  datasetId: string;
  filename: string;
  totalChunks: number;
  uploadedChunks: number;
  status: "uploading" | "assembling" | "done" | "error";
  error?: string;
}
```

- [ ] **Step 3: Write API client**

```typescript
// frontend/src/api/client.ts
const BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listDatasets() {
  return fetchJSON<import("../types/dataset").Dataset[]>("/datasets");
}

export async function getDataset(id: string) {
  return fetchJSON<import("../types/dataset").Dataset>(`/datasets/${id}`);
}

export async function getJob(datasetId: string) {
  return fetchJSON<import("../types/dataset").Job>(`/datasets/${datasetId}/job`);
}

export async function deleteDataset(id: string) {
  return fetchJSON<{ deleted: boolean }>(`/datasets/${id}`, { method: "DELETE" });
}

export async function initUpload(filename: string, name?: string) {
  const params = new URLSearchParams({ filename });
  if (name) params.set("name", name);
  return fetchJSON<{ dataset_id: string; existing_chunks: number[] }>(
    `/datasets/upload/init?${params}`,
    { method: "POST" }
  );
}

export async function uploadChunk(datasetId: string, chunkIndex: number, chunk: Blob) {
  const form = new FormData();
  form.append("file", chunk, "chunk");
  return fetchJSON<{ chunk_index: number; received: boolean }>(
    `/datasets/upload/${datasetId}/chunk?chunk_index=${chunkIndex}`,
    { method: "POST", body: form }
  );
}

export async function finalizeUpload(datasetId: string, totalChunks: number) {
  return fetchJSON<{ dataset_id: string; status: string; job_id: string }>(
    `/datasets/upload/${datasetId}/finalize?total_chunks=${totalChunks}`,
    { method: "POST" }
  );
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadFile(
  file: File,
  onProgress?: (state: import("../types/dataset").ChunkUploadState) => void
): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const { dataset_id, existing_chunks } = await initUpload(file.name);

  const state: import("../types/dataset").ChunkUploadState = {
    datasetId: dataset_id,
    filename: file.name,
    totalChunks,
    uploadedChunks: existing_chunks.length,
    status: "uploading",
  };
  onProgress?.(state);

  for (let i = 0; i < totalChunks; i++) {
    if (existing_chunks.includes(i)) continue;

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    await uploadChunk(dataset_id, i, chunk);
    state.uploadedChunks++;
    onProgress?.({ ...state });
  }

  state.status = "assembling";
  onProgress?.({ ...state });

  await finalizeUpload(dataset_id, totalChunks);

  state.status = "done";
  onProgress?.({ ...state });

  return dataset_id;
}
```

- [ ] **Step 4: Write vite.config.ts with API proxy**

```typescript
// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/tiles": "http://localhost:8080",
    },
  },
});
```

- [ ] **Step 5: Write minimal App.tsx**

```tsx
// frontend/src/App.tsx
import { useState, useEffect } from "react";
import { listDatasets } from "./api/client";
import type { Dataset } from "./types/dataset";
import "./App.css";

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    listDatasets().then(setDatasets).catch(console.error);
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <span className="logo">LiDAR Viewer</span>
        <button className="btn-primary">Upload Dataset</button>
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          <option value="">Select dataset...</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.status})
            </option>
          ))}
        </select>
      </header>
      <div className="main">
        <aside className="sidebar">
          <p style={{ padding: 16, color: "#888" }}>Sidebar panels (next task)</p>
        </aside>
        <div className="viewer">
          {selectedId ? (
            <p>Viewer for {selectedId} (next task)</p>
          ) : (
            <p>Select or upload a dataset to begin</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write App.css (dark theme)**

```css
/* frontend/src/App.css */
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-viewer: #0f0f23;
  --text-primary: #e0e0e0;
  --text-secondary: #999;
  --accent: #4fc3f7;
  --border: #334;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg-primary); color: var(--text-primary); font-family: system-ui, sans-serif; }

.app { display: flex; flex-direction: column; height: 100vh; }

.toolbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
.logo { font-weight: 700; font-size: 15px; color: var(--accent); margin-right: 12px; }
.btn-primary {
  background: var(--accent); color: var(--bg-primary);
  border: none; padding: 6px 14px; border-radius: 4px;
  font-weight: 600; cursor: pointer; font-size: 12px;
}
.toolbar select {
  background: var(--bg-primary); color: var(--text-primary);
  border: 1px solid var(--border); padding: 5px 10px;
  border-radius: 4px; font-size: 12px;
}

.main { display: flex; flex: 1; overflow: hidden; }

.sidebar {
  width: 240px; background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow-y: auto; flex-shrink: 0;
}

.viewer {
  flex: 1; background: var(--bg-viewer);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary);
}
```

- [ ] **Step 7: Verify dev server runs**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts, page loads at http://localhost:5173 with dark-themed layout.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold React/TypeScript frontend with Vite, dark theme, and API client"
```

---

## Task 8: Frontend — Potree Viewer Integration

**Files:**
- Create: `frontend/src/lib/potreeSetup.ts`
- Create: `frontend/src/hooks/usePotree.ts`
- Create: `frontend/src/hooks/useAdaptivePerformance.ts`
- Create: `frontend/src/components/ViewerCanvas.tsx`
- Modify: `frontend/src/App.tsx` (wire up ViewerCanvas)

- [ ] **Step 1: Write potreeSetup.ts**

```typescript
// frontend/src/lib/potreeSetup.ts
import * as THREE from "three";
import { Potree, PointCloudOctree } from "potree-core";

export interface PotreeViewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  potree: Potree;
  pointClouds: PointCloudOctree[];
  clock: THREE.Clock;
  controls: {
    dispose: () => void;
  };
}

export function createViewer(container: HTMLDivElement): PotreeViewer {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
  camera.position.set(0, 100, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const potree = new Potree();
  potree.pointBudget = 2_000_000; // 2M default for 8GB RAM

  const clock = new THREE.Clock();
  const pointClouds: PointCloudOctree[] = [];

  // Simple orbit controls (manual — avoids extra dependency)
  const controls = createOrbitControls(camera, renderer.domElement);

  return { scene, camera, renderer, potree, pointClouds, clock, controls };
}

export async function loadPointCloud(
  viewer: PotreeViewer,
  baseUrl: string,
): Promise<PointCloudOctree> {
  const pco = await viewer.potree.loadPointCloud(
    "metadata.json",
    (url: string) => `${baseUrl}/${url}`
  );
  viewer.scene.add(pco);
  viewer.pointClouds.push(pco);

  // Center camera on point cloud
  const box = pco.boundingBox;
  if (box) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.copy(center).add(new THREE.Vector3(maxDim, maxDim * 0.5, maxDim));
    camera.lookAt(center);
  }

  return pco;
}

function createOrbitControls(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
  let isDragging = false;
  let isPanning = false;
  let prevX = 0, prevY = 0;
  const target = new THREE.Vector3();

  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) isDragging = true;
    if (e.button === 2) isPanning = true;
    prevX = e.clientX;
    prevY = e.clientY;
  };

  const onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;

    if (isDragging) {
      // Orbit
      const offset = camera.position.clone().sub(target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta -= dx * 0.005;
      spherical.phi -= dy * 0.005;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
      offset.setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
    }

    if (isPanning) {
      const panSpeed = camera.position.distanceTo(target) * 0.001;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.getWorldDirection(new THREE.Vector3());
      right.crossVectors(camera.up, camera.getWorldDirection(new THREE.Vector3())).normalize();
      up.copy(camera.up).normalize();
      const panOffset = right.multiplyScalar(dx * panSpeed).add(up.multiplyScalar(-dy * panSpeed));
      camera.position.add(panOffset);
      target.add(panOffset);
      camera.lookAt(target);
    }
  };

  const onMouseUp = () => { isDragging = false; isPanning = false; };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const direction = camera.position.clone().sub(target).normalize();
    const distance = camera.position.distanceTo(target);
    const zoomAmount = distance * 0.1 * Math.sign(e.deltaY);
    camera.position.add(direction.multiplyScalar(zoomAmount));
  };

  domElement.addEventListener("mousedown", onMouseDown);
  domElement.addEventListener("mousemove", onMouseMove);
  domElement.addEventListener("mouseup", onMouseUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    dispose: () => {
      domElement.removeEventListener("mousedown", onMouseDown);
      domElement.removeEventListener("mousemove", onMouseMove);
      domElement.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
    },
  };
}
```

- [ ] **Step 2: Write usePotree hook**

```typescript
// frontend/src/hooks/usePotree.ts
import { useRef, useEffect, useCallback, useState } from "react";
import { createViewer, loadPointCloud, PotreeViewer } from "../lib/potreeSetup";

export interface PotreeSettings {
  pointBudget: number;
  pointSize: number;
  edlEnabled: boolean;
}

export function usePotree(datasetId: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PotreeViewer | null>(null);
  const animFrameRef = useRef<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Track FPS
  const fpsFrames = useRef<number[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = createViewer(containerRef.current);
    viewerRef.current = viewer;

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      fpsFrames.current.push(now);
      // Keep last 60 frames for FPS calc
      while (fpsFrames.current.length > 60) fpsFrames.current.shift();
      if (fpsFrames.current.length > 1) {
        const elapsed = now - fpsFrames.current[0];
        setFps(Math.round((fpsFrames.current.length / elapsed) * 1000));
      }

      viewer.potree.updatePointClouds(viewer.pointClouds, viewer.camera, viewer.renderer);
      viewer.renderer.render(viewer.scene, viewer.camera);
    }
    animate();

    // Handle resize
    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      viewer.camera.aspect = w / h;
      viewer.camera.updateProjectionMatrix();
      viewer.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", onResize);
      viewer.controls.dispose();
      viewer.renderer.dispose();
      if (containerRef.current?.contains(viewer.renderer.domElement)) {
        containerRef.current.removeChild(viewer.renderer.domElement);
      }
    };
  }, []);

  // Load point cloud when datasetId changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !datasetId) return;

    // Clear existing point clouds
    viewer.pointClouds.forEach((pc) => viewer.scene.remove(pc));
    viewer.pointClouds.length = 0;

    setLoading(true);
    setError(null);

    loadPointCloud(viewer, `/tiles/${datasetId}`)
      .then(() => setLoading(false))
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [datasetId]);

  const updateSettings = useCallback((settings: Partial<PotreeSettings>) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (settings.pointBudget !== undefined) {
      viewer.potree.pointBudget = settings.pointBudget;
    }
    if (settings.pointSize !== undefined) {
      viewer.pointClouds.forEach((pc) => {
        pc.material.size = settings.pointSize;
      });
    }
  }, []);

  return { containerRef, loading, error, fps, updateSettings };
}
```

- [ ] **Step 3: Write adaptive performance hook**

```typescript
// frontend/src/hooks/useAdaptivePerformance.ts
import { useEffect, useRef } from "react";
import type { PotreeSettings } from "./usePotree";

const MIN_FPS = 40;
const TARGET_FPS = 60;
const MIN_BUDGET = 500_000;
const MAX_BUDGET = 5_000_000;
const ADJUST_INTERVAL = 2000; // Check every 2s

export function useAdaptivePerformance(
  fps: number,
  currentBudget: number,
  updateSettings: (s: Partial<PotreeSettings>) => void,
  enabled: boolean = true,
) {
  const lastAdjust = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastAdjust.current < ADJUST_INTERVAL) return;

    if (fps > 0 && fps < MIN_FPS && currentBudget > MIN_BUDGET) {
      // Reduce budget by 20%
      const newBudget = Math.max(MIN_BUDGET, Math.floor(currentBudget * 0.8));
      updateSettings({ pointBudget: newBudget });
      lastAdjust.current = now;
    } else if (fps >= TARGET_FPS && currentBudget < MAX_BUDGET) {
      // Increase budget by 10%
      const newBudget = Math.min(MAX_BUDGET, Math.floor(currentBudget * 1.1));
      updateSettings({ pointBudget: newBudget });
      lastAdjust.current = now;
    }
  }, [fps, currentBudget, updateSettings, enabled]);
}
```

- [ ] **Step 4: Write ViewerCanvas component**

```tsx
// frontend/src/components/ViewerCanvas.tsx
import { usePotree } from "../hooks/usePotree";
import { useAdaptivePerformance } from "../hooks/useAdaptivePerformance";
import { useState } from "react";

interface Props {
  datasetId: string | null;
}

export default function ViewerCanvas({ datasetId }: Props) {
  const [pointBudget, setPointBudget] = useState(2_000_000);
  const { containerRef, loading, error, fps, updateSettings } = usePotree(datasetId);

  useAdaptivePerformance(fps, pointBudget, (s) => {
    if (s.pointBudget) setPointBudget(s.pointBudget);
    updateSettings(s);
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {loading && (
        <div className="viewer-overlay">Loading point cloud...</div>
      )}
      {error && (
        <div className="viewer-overlay viewer-error">Error: {error}</div>
      )}
      {!datasetId && (
        <div className="viewer-overlay">Select or upload a dataset to begin</div>
      )}

      {/* FPS counter */}
      <div style={{
        position: "absolute", bottom: 8, right: 8,
        fontSize: 11, color: fps < 40 ? "#ff5555" : "#888",
        fontFamily: "monospace",
      }}>
        {fps} FPS | {(pointBudget / 1_000_000).toFixed(1)}M pts
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire ViewerCanvas into App.tsx**

Replace the viewer placeholder in `App.tsx`:

```tsx
import ViewerCanvas from "./components/ViewerCanvas";

// In the JSX, replace the viewer div content:
<div className="viewer">
  <ViewerCanvas datasetId={selectedId} />
</div>
```

- [ ] **Step 6: Verify it builds**

Run: `cd frontend && npm run build`
Expected: No TypeScript errors, builds successfully.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: integrate Potree viewer with Three.js, adaptive FPS, orbit controls"
```

---

## Task 9: Frontend — Upload Dialog & Sidebar Panels

**Files:**
- Create: `frontend/src/components/UploadDialog.tsx`
- Create: `frontend/src/components/Toolbar.tsx`
- Create: `frontend/src/components/Sidebar/Sidebar.tsx`
- Create: `frontend/src/components/Sidebar/AppearancePanel.tsx`
- Create: `frontend/src/components/Sidebar/ToolsPanel.tsx`
- Create: `frontend/src/components/Sidebar/ClassificationPanel.tsx`
- Create: `frontend/src/components/Sidebar/ScenePanel.tsx`
- Modify: `frontend/src/App.tsx` (wire everything together)
- Modify: `frontend/src/App.css` (sidebar panel styles)

- [ ] **Step 1: Write UploadDialog**

```tsx
// frontend/src/components/UploadDialog.tsx
import { useState, useRef } from "react";
import { uploadFile } from "../api/client";
import type { ChunkUploadState } from "../types/dataset";

interface Props {
  onComplete: (datasetId: string) => void;
  onClose: () => void;
}

export default function UploadDialog({ onComplete, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ChunkUploadState | null>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    try {
      const id = await uploadFile(file, setState);
      onComplete(id);
    } catch (err) {
      setState((prev) => prev ? { ...prev, status: "error", error: String(err) } : null);
    }
  };

  const progress = state
    ? Math.round((state.uploadedChunks / state.totalChunks) * 100)
    : 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Upload Dataset</h3>
        <p style={{ color: "#999", fontSize: 12, marginBottom: 16 }}>
          Supported formats: .laz, .las
        </p>

        <input ref={fileRef} type="file" accept=".laz,.las" />

        {state && (
          <div style={{ marginTop: 12 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              {state.status === "uploading" && `Uploading: ${progress}% (${state.uploadedChunks}/${state.totalChunks} chunks)`}
              {state.status === "assembling" && "Assembling file..."}
              {state.status === "done" && "Upload complete! Conversion starting..."}
              {state.status === "error" && `Error: ${state.error}`}
            </p>
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={state?.status === "uploading" || state?.status === "assembling"}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write Toolbar**

```tsx
// frontend/src/components/Toolbar.tsx
import type { Dataset } from "../types/dataset";

interface Props {
  datasets: Dataset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUploadClick: () => void;
}

export default function Toolbar({ datasets, selectedId, onSelect, onUploadClick }: Props) {
  return (
    <header className="toolbar">
      <span className="logo">LiDAR Viewer</span>
      <button className="btn-primary" onClick={onUploadClick}>Upload Dataset</button>
      <select
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
      >
        <option value="">Select dataset...</option>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.status})
          </option>
        ))}
      </select>
    </header>
  );
}
```

- [ ] **Step 3: Write Sidebar container and panels**

```tsx
// frontend/src/components/Sidebar/Sidebar.tsx
import { useState } from "react";
import AppearancePanel from "./AppearancePanel";
import ToolsPanel from "./ToolsPanel";
import ClassificationPanel from "./ClassificationPanel";
import ScenePanel from "./ScenePanel";
import type { Dataset, Job } from "../../types/dataset";

interface Props {
  dataset: Dataset | null;
  job: Job | null;
  fps: number;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export default function Sidebar({ dataset, job, fps, onSettingsChange }: Props) {
  return (
    <aside className="sidebar">
      <AppearancePanel onSettingsChange={onSettingsChange} />
      <ToolsPanel />
      <ClassificationPanel />
      <ScenePanel dataset={dataset} job={job} fps={fps} />
    </aside>
  );
}
```

```tsx
// frontend/src/components/Sidebar/AppearancePanel.tsx
import { useState } from "react";

interface Props {
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export default function AppearancePanel({ onSettingsChange }: Props) {
  const [open, setOpen] = useState(true);
  const [pointSize, setPointSize] = useState(1.0);
  const [pointBudget, setPointBudget] = useState(2.0);
  const [edl, setEdl] = useState(true);
  const [material, setMaterial] = useState("rgb");

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} Appearance
      </div>
      {open && (
        <div className="panel-body">
          <label className="panel-label">Material</label>
          <select
            className="panel-select"
            value={material}
            onChange={(e) => {
              setMaterial(e.target.value);
              onSettingsChange({ material: e.target.value });
            }}
          >
            <option value="rgb">RGB</option>
            <option value="elevation">Elevation</option>
            <option value="intensity">Intensity</option>
            <option value="classification">Classification</option>
          </select>

          <label className="panel-label">Point Size: {pointSize.toFixed(1)}</label>
          <input
            type="range" min="0.1" max="5" step="0.1"
            value={pointSize}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setPointSize(v);
              onSettingsChange({ pointSize: v });
            }}
          />

          <label className="panel-label">Point Budget: {pointBudget.toFixed(1)}M</label>
          <input
            type="range" min="0.5" max="5" step="0.5"
            value={pointBudget}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setPointBudget(v);
              onSettingsChange({ pointBudget: v * 1_000_000 });
            }}
          />

          <label className="panel-checkbox">
            <input
              type="checkbox" checked={edl}
              onChange={(e) => {
                setEdl(e.target.checked);
                onSettingsChange({ edlEnabled: e.target.checked });
              }}
            />
            Eye Dome Lighting
          </label>
        </div>
      )}
    </div>
  );
}
```

```tsx
// frontend/src/components/Sidebar/ToolsPanel.tsx
import { useState } from "react";

export default function ToolsPanel() {
  const [open, setOpen] = useState(true);

  const tools = [
    { id: "distance", label: "Distance" },
    { id: "height", label: "Height" },
    { id: "profile", label: "Profile" },
    { id: "section", label: "Section" },
    { id: "area", label: "Area" },
    { id: "point", label: "Point" },
  ];

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} Tools
      </div>
      {open && (
        <div className="panel-body">
          <div className="tool-grid">
            {tools.map((t) => (
              <button key={t.id} className="tool-btn">
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

```tsx
// frontend/src/components/Sidebar/ClassificationPanel.tsx
import { useState } from "react";

const CLASSES = [
  { code: 2, name: "Ground", color: "#8B6914" },
  { code: 3, name: "Low Vegetation", color: "#3a7d3a" },
  { code: 4, name: "Medium Vegetation", color: "#2d8b2d" },
  { code: 5, name: "High Vegetation", color: "#1a6b1a" },
  { code: 6, name: "Buildings", color: "#cc3333" },
  { code: 9, name: "Water", color: "#3366cc" },
  { code: 7, name: "Noise", color: "#666" },
];

export default function ClassificationPanel() {
  const [open, setOpen] = useState(true);
  const [visible, setVisible] = useState<Record<number, boolean>>(
    Object.fromEntries(CLASSES.map((c) => [c.code, c.code !== 7]))
  );

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} Classification
      </div>
      {open && (
        <div className="panel-body">
          {CLASSES.map((cls) => (
            <label key={cls.code} className="class-row">
              <input
                type="checkbox"
                checked={visible[cls.code] ?? true}
                onChange={(e) =>
                  setVisible((v) => ({ ...v, [cls.code]: e.target.checked }))
                }
              />
              <span className="class-dot" style={{ background: cls.color }} />
              <span style={{ opacity: visible[cls.code] ? 1 : 0.5 }}>
                {cls.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

```tsx
// frontend/src/components/Sidebar/ScenePanel.tsx
import { useState } from "react";
import type { Dataset, Job } from "../../types/dataset";

interface Props {
  dataset: Dataset | null;
  job: Job | null;
  fps: number;
}

export default function ScenePanel({ dataset, job, fps }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} Scene
      </div>
      {open && (
        <div className="panel-body panel-info">
          {dataset ? (
            <>
              <div><span className="info-label">Dataset:</span> {dataset.name}</div>
              <div><span className="info-label">Status:</span> {dataset.status}</div>
              {dataset.point_count && (
                <div><span className="info-label">Points:</span> {dataset.point_count.toLocaleString()}</div>
              )}
              {dataset.crs && (
                <div><span className="info-label">CRS:</span> {dataset.crs}</div>
              )}
              {dataset.file_size && (
                <div><span className="info-label">Size:</span> {(dataset.file_size / 1e9).toFixed(2)} GB</div>
              )}
              {job && job.status === "processing" && (
                <div><span className="info-label">Converting:</span> {job.progress.toFixed(0)}%</div>
              )}
            </>
          ) : (
            <div>No dataset selected</div>
          )}
          <div style={{ marginTop: 8, color: fps < 40 ? "#ff5555" : "#666" }}>
            <span className="info-label">FPS:</span> {fps}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add sidebar CSS to App.css**

Append to `frontend/src/App.css`:

```css
/* Panels */
.panel { border-bottom: 1px solid var(--border); }
.panel-header {
  padding: 10px 14px; font-weight: 600; font-size: 12px;
  color: var(--accent); text-transform: uppercase;
  letter-spacing: 0.5px; cursor: pointer; user-select: none;
}
.panel-body { padding: 4px 14px 12px; }
.panel-label { display: block; color: var(--text-secondary); font-size: 11px; margin: 8px 0 3px; }
.panel-select {
  width: 100%; background: var(--bg-primary); color: var(--text-primary);
  border: 1px solid var(--border); padding: 4px 6px; border-radius: 3px; font-size: 11px;
}
.panel-body input[type="range"] { width: 100%; accent-color: var(--accent); }
.panel-checkbox { display: flex; align-items: center; gap: 8px; color: #ccc; font-size: 11px; margin-top: 8px; cursor: pointer; }
.panel-info { font-size: 11px; color: var(--text-secondary); }
.info-label { color: var(--text-primary); }

/* Classification */
.class-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 11px; color: #ccc; cursor: pointer; }
.class-dot { width: 10px; height: 10px; border-radius: 1px; flex-shrink: 0; }

/* Tools */
.tool-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.tool-btn {
  background: var(--bg-primary); border: 1px solid var(--border);
  padding: 6px 10px; border-radius: 4px; font-size: 11px;
  color: #ccc; cursor: pointer; min-width: 60px; text-align: center;
}
.tool-btn:hover { border-color: var(--accent); color: var(--accent); }

/* Upload dialog */
.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.dialog {
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 8px; padding: 24px; width: 400px; max-width: 90vw;
}
.dialog h3 { margin-bottom: 4px; }
.btn-secondary {
  background: none; border: 1px solid var(--border); color: #aaa;
  padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; }

/* Viewer overlay */
.viewer-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary); font-size: 14px;
  pointer-events: none;
}
.viewer-error { color: #ff5555; }
```

- [ ] **Step 5: Wire everything into App.tsx**

```tsx
// frontend/src/App.tsx
import { useState, useEffect, useCallback } from "react";
import { listDatasets, getDataset, getJob } from "./api/client";
import type { Dataset, Job } from "./types/dataset";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar/Sidebar";
import ViewerCanvas from "./components/ViewerCanvas";
import UploadDialog from "./components/UploadDialog";
import "./App.css";

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const refreshDatasets = useCallback(() => {
    listDatasets().then(setDatasets).catch(console.error);
  }, []);

  useEffect(() => { refreshDatasets(); }, [refreshDatasets]);

  // Fetch selected dataset details + job
  useEffect(() => {
    if (!selectedId) {
      setSelectedDataset(null);
      setJob(null);
      return;
    }
    getDataset(selectedId).then(setSelectedDataset).catch(console.error);
    getJob(selectedId).then(setJob).catch(() => setJob(null));
  }, [selectedId]);

  // Poll job status while processing
  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "processing")) return;
    const interval = setInterval(() => {
      getJob(job.dataset_id).then((j) => {
        setJob(j);
        if (j.status === "complete" || j.status === "failed") {
          refreshDatasets();
          if (j.status === "complete") {
            getDataset(j.dataset_id).then(setSelectedDataset);
          }
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [job, refreshDatasets]);

  const handleUploadComplete = (datasetId: string) => {
    setShowUpload(false);
    refreshDatasets();
    setSelectedId(datasetId);
  };

  return (
    <div className="app">
      <Toolbar
        datasets={datasets}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUploadClick={() => setShowUpload(true)}
      />
      <div className="main">
        <Sidebar
          dataset={selectedDataset}
          job={job}
          fps={0}
          onSettingsChange={() => {}}
        />
        <div className="viewer">
          <ViewerCanvas
            datasetId={selectedDataset?.status === "ready" ? selectedId : null}
          />
        </div>
      </div>
      {showUpload && (
        <UploadDialog
          onComplete={handleUploadComplete}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd frontend && npm run build`
Expected: Builds successfully.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add upload dialog, toolbar, and sidebar panels (appearance, tools, classification, scene)"
```

---

## Task 10: End-to-End Integration Test

**Files:** No new files — testing the full stack.

- [ ] **Step 1: Run database migration**

Run:
```bash
podman-compose up -d api
podman exec lidar1_api_1 alembic upgrade head
```

- [ ] **Step 2: Start all containers**

Run: `podman-compose up --build`
Expected: All 3 containers start. Check logs for errors.

- [ ] **Step 3: Verify API health**

Run: `curl http://localhost:8080/api/health`
Expected: `{"status":"ok"}`

- [ ] **Step 4: Test upload with a small LAZ file**

If you have a small test file, upload it via the UI at http://localhost:8080. Otherwise, test with curl:

```bash
# Create a tiny test (won't be valid LAZ, but tests the pipeline)
dd if=/dev/urandom bs=1M count=10 > /tmp/test.laz

# Init upload
curl -X POST "http://localhost:8080/api/datasets/upload/init?filename=test.laz"

# Upload single chunk
curl -X POST "http://localhost:8080/api/datasets/upload/{DATASET_ID}/chunk?chunk_index=0" \
  -F "file=@/tmp/test.laz"

# Finalize
curl -X POST "http://localhost:8080/api/datasets/upload/{DATASET_ID}/finalize?total_chunks=1"
```

- [ ] **Step 5: Verify worker picks up the job**

Check worker logs: `podman-compose logs worker`
Expected: Worker picks up the pending job and attempts conversion. It will fail on the fake LAZ but the pipeline should work.

- [ ] **Step 6: Test with real dataset**

Copy the Sandy Creek dataset to the upload dir and create a dataset record manually, or use the UI to upload. PotreeConverter will take significant time on 28GB.

Watch progress: `podman-compose logs -f worker`

- [ ] **Step 7: Verify viewer loads the converted data**

After conversion completes, select the dataset in the UI. The Potree viewer should load and display the point cloud at http://localhost:8080.

Verify:
- Orbit/pan/zoom works
- FPS counter shows >= 40fps
- Point cloud renders with color

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
```

---

## Summary

| Task | What it does | Risk |
|------|-------------|------|
| 1 | Worker Dockerfile + PotreeConverter build | HIGH — C++ compilation on ARM |
| 2 | API database models + FastAPI scaffold | LOW |
| 3 | Chunked upload endpoints | MEDIUM — streaming + assembly |
| 4 | Job status endpoint | LOW |
| 5 | Worker conversion pipeline | MEDIUM — subprocess management |
| 6 | Podman compose + nginx | LOW |
| 7 | React/TypeScript scaffold | LOW |
| 8 | Potree viewer integration | HIGH — Three.js + potree-core |
| 9 | Upload dialog + sidebar panels | LOW |
| 10 | End-to-end integration test | MEDIUM |

**Critical path:** Task 1 (PotreeConverter build) and Task 8 (Potree viewer) are the highest-risk items. Everything else is standard web app plumbing.
