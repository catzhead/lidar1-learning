# LiDAR Viewer — Design Spec

## Overview

A web application for visualizing LiDAR point cloud datasets, matching the feature set of Phoenix LidarMill's Cloud Viewer. Personal exploration tool for analyzing LiDAR data (LAZ/LAS format), designed to run locally via Podman containers with a clear path to Kubernetes deployment.

## Goals

- Upload raw LAZ files and automatically convert them to a streamable octree format
- Visualize point clouds in the browser with orbit/pan/zoom navigation
- Match LidarMill's feature set: appearance controls, measurement tools, classification filtering, scene info
- Containerized architecture (Podman) that scales to Kubernetes
- Handle datasets up to 100GB+
- Run within 8GB RAM (MacBook Air dev, VPS production)

## Non-Goals (v1)

- Bounding box overlays / object detection
- Satellite imagery / orthophoto base layers
- Multi-user collaboration or authentication
- Cloud storage (S3/MinIO) — local volume only

## Architecture

### System Overview

Four components, three containers, one shared volume:

```
Browser (Safari/Chrome)
├── React/TypeScript UI (toolbar, sidebar, controls)
└── Potree 2.0 WebGL viewer (3D canvas)
        │
        ├── REST API ──► FastAPI container
        └── Static tiles ──► nginx (frontend container)

Server (Podman)
├── frontend (nginx) — serves React build, proxies /api/*, serves /tiles/*
├── api (FastAPI) — upload, dataset CRUD, job management
├── worker (FastAPI + PotreeConverter 2.0) — LAZ→octree conversion
└── shared volume: /data/ (uploads/, converted/, db/)
```

### Key Design Decisions

**Potree 2.0 (WebGL), not Potree-Next (WebGPU).** WebGPU has inconsistent Safari support. WebGL works reliably in both Safari and Chrome.

**PotreeConverter 2.0 for LAZ→octree.** Purpose-built C++ tool, 10-50x faster than v1, handles massive datasets. No reason to rewrite this.

**Potree viewer fetches tiles directly from nginx.** FastAPI is not in the rendering hot path. Viewer performance = static file serving speed.

**React controls Potree via JS API.** Potree's built-in sidebar is disabled. React renders all UI and calls Potree's API for viewer state changes. This enables future extensibility (bounding boxes, detection panels).

**SQLite for v1, Postgres for Kube.** Thin repository abstraction makes this a config change.

**Simple DB-polling job queue for v1, Redis/RabbitMQ for Kube.** Behind an interface for easy swap.

## Container Architecture

```
podman-compose.yml

┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│  frontend    │  │  api         │  │  worker      │
│  (nginx)     │  │  (FastAPI)   │  │  (FastAPI +  │
│              │  │              │  │  PotreeConv.) │
│  :80         │  │  :8000       │  │  (no port)   │
└──────────────┘  └──────┬───────┘  └──────┬───────┘
                         │                 │
                  ┌──────▼─────────────────▼──────┐
                  │  shared volume: /data          │
                  │  ├── uploads/                  │
                  │  ├── converted/                │
                  │  └── db/ (SQLite)              │
                  └────────────────────────────────┘
```

**Kube-ready properties:**
- All containers are stateless — state lives in the shared volume
- Shared volume → PersistentVolumeClaim on Kube (or S3/MinIO for object storage)
- Worker scales independently from API
- Each container has its own Dockerfile

**Local dev:**
```bash
podman-compose up --build      # all 3 containers
podman-compose up api worker   # backend only (frontend dev server separate)
```

## Data Flow

### Upload & Conversion Pipeline

1. User drops LAZ file → `POST /api/datasets/upload` (chunked, multipart)
2. API saves chunks to `/data/uploads/{dataset_id}/`, creates dataset + job records
3. Worker picks up pending job, runs `PotreeConverter --source input.laz --outdir /data/converted/{dataset_id}/`
4. Worker updates job status: `pending` → `processing` → `complete`
5. Potree viewer loads octree from `/tiles/{dataset_id}/metadata.json` (served by nginx)

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/datasets/upload` | Upload LAZ file (chunked) |
| GET | `/api/datasets` | List all datasets with status |
| GET | `/api/datasets/{id}` | Dataset details + conversion status |
| DELETE | `/api/datasets/{id}` | Remove dataset and converted files |
| GET | `/api/datasets/{id}/job` | Conversion job progress |

### Chunked Upload

Critical for 28GB+ files. Frontend slices file into chunks (~10MB each), sends sequentially with chunk index. API reassembles. Enables progress bar and resume-on-failure.

## Frontend

### Tech Stack

- React 18 + TypeScript
- Vite (build/dev server)
- Potree 2.0 (WebGL point cloud renderer)
- Custom dark-themed components (no UI framework)

### Layout

```
┌──────────────────────────────────────────┐
│ Toolbar: [Upload] [Datasets▾]  CRS  [?] │
├────────┬─────────────────────────────────┤
│Sidebar │                                 │
│        │    Potree 3D Viewer             │
│Appear. │    (WebGL Canvas)               │
│Tools   │                                 │
│Classif.│                                 │
│Scene   │    Coordinates: X Y Z           │
└────────┴─────────────────────────────────┘
```

### Sidebar Panels (collapsible)

**Appearance:** Point size slider, point budget, Eye Dome Lighting toggle, material mode (RGB / elevation / intensity / classification).

**Tools:** Distance measurement, point-to-point height, height profile, cross-section, area measurement.

**Classification:** Toggle visibility per LAS standard class — ground, low/med/high vegetation, buildings, water, noise, etc.

**Scene:** Dataset name, point count, bounding box, CRS, coordinate display on hover.

### Navigation

Orbit (left click), pan (right click), zoom (scroll) — matching LidarMill.

### Component Structure

```
App
├── Toolbar (upload button, dataset selector)
├── Sidebar
│   ├── AppearancePanel
│   ├── ToolsPanel
│   ├── ClassificationPanel
│   └── ScenePanel
└── ViewerCanvas (mounts Potree, forwards settings via JS API)
```

## Backend

### Tech Stack

- Python 3.12+ / FastAPI
- SQLAlchemy + SQLite (thin repository layer)
- PotreeConverter 2.0 (C++ binary, called as subprocess)
- asyncio task queue (v1), swappable to Celery+Redis

### Database Schema

**datasets:**
- `id` (UUID, PK)
- `name` (string)
- `filename` (string)
- `file_size` (bigint)
- `point_count` (bigint, nullable — populated after conversion)
- `crs` (string, nullable)
- `bounds` (JSON, nullable)
- `status` (enum: uploading, uploaded, processing, ready, failed)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**jobs:**
- `id` (UUID, PK)
- `dataset_id` (FK → datasets)
- `status` (enum: pending, processing, complete, failed)
- `progress` (float, 0-100)
- `error` (text, nullable)
- `started_at` (timestamp, nullable)
- `completed_at` (timestamp, nullable)

## Memory Constraints (8GB RAM)

The host machine has 8GB RAM total, shared between OS, containers, and PotreeConverter. This is the primary resource constraint and shapes several design decisions.

**Container memory limits (podman-compose):**
- `frontend` (nginx): 128MB — static file serving, negligible memory
- `api` (FastAPI): 512MB — handles uploads via streaming (never buffers full file in memory)
- `worker` (PotreeConverter): 4GB cap — PotreeConverter 2.0 is memory-aware and can be configured with `--memory-limit`; it processes in chunks and flushes to disk

**Upload handling:** The API must stream upload chunks directly to disk. No in-memory buffering of the full file. Each chunk (~10MB) is written immediately and the memory is freed.

**Conversion:** PotreeConverter 2.0 supports a `--memory-limit` flag to cap its working set. For a 28GB LAZ file on 8GB RAM, it will do multiple passes over the data, trading speed for memory. This is the expected mode of operation for large datasets on small machines.

**Viewer (browser-side):** Potree's point budget is the main lever. Default to 2-5M points (not 10M) to keep browser memory reasonable. The octree LOD system means only visible tiles at the current zoom level are loaded — the full dataset is never in browser memory.

**No concurrent conversions:** The worker processes one job at a time. Running two PotreeConverter instances on 8GB RAM would OOM. Jobs queue and run sequentially.

## Error Handling

**Upload:** Chunked with resume. Validate file extension (.laz, .las). Disk space check before accepting.

**Conversion:** Failure → job status `failed` with stderr captured. Configurable timeout (default 2h). Stale `processing` jobs re-queued on server restart.

**Viewer:** Missing/corrupt data shows clear error in viewer area. Point budget auto-adjusts on low frame rate (Potree native).

**Storage:** Deleting a dataset cleans up uploads and converted files. No orphaned files.

## Project Structure

```
lidar1/
├── podman-compose.yml
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── Toolbar.tsx
│       │   ├── Sidebar/
│       │   │   ├── AppearancePanel.tsx
│       │   │   ├── ToolsPanel.tsx
│       │   │   ├── ClassificationPanel.tsx
│       │   │   └── ScenePanel.tsx
│       │   └── ViewerCanvas.tsx
│       ├── hooks/
│       │   └── usePotree.ts
│       ├── api/
│       │   └── client.ts
│       └── types/
│           └── dataset.ts
├── api/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── routers/
│       │   ├── datasets.py
│       │   └── jobs.py
│       ├── models/
│       │   └── dataset.py
│       ├── services/
│       │   ├── upload.py
│       │   └── conversion.py
│       └── db.py
├── worker/
│   ├── Dockerfile
│   └── worker.py
├── data/                  # bind mount (gitignored)
│   ├── uploads/
│   ├── converted/
│   └── db/
├── dataset/               # test data (gitignored)
└── docs/
    └── superpowers/
        └── specs/
```

## Future Considerations (not in v1)

- **Bounding box overlays:** React overlay layer on top of Potree canvas, synced to 3D camera
- **Object detection:** Python ML pipeline (PyTorch) integrated into worker container
- **Satellite imagery:** Tile layer underneath point cloud, CRS-aligned
- **Multi-user:** Add auth (JWT), Postgres, per-user dataset isolation
- **Cloud storage:** S3/MinIO replacing local volume, pre-signed URLs for tile serving

## Test Dataset

A 28GB LAZ file is available at `dataset/SandyCreek_NAD832011_TX_Central_USft_NAVD88.laz` (Phoenix LiDAR Ranger-U240 Sandy Creek post-flood mapping). This will be used to validate the full pipeline from upload through conversion to visualization.
