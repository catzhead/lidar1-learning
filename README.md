# LiDAR Viewer

Web application for uploading and visualizing LiDAR point cloud datasets. Upload raw LAZ/LAS files, automatically convert them to a streamable octree format, and explore them in the browser with orbit/pan/zoom navigation.

Built to match the feature set of Phoenix LidarMill's Cloud Viewer.

## Architecture

```
Browser
├── React/TypeScript UI (toolbar, sidebar, controls)
└── Potree 2.0 WebGL viewer (3D canvas)

Podman (3 containers)
├── frontend (nginx)      — serves React build, proxies /api/*, serves /tiles/*
├── api (FastAPI)          — upload, dataset CRUD, job management
├── worker (PotreeConverter 2.1.1) — LAZ → octree conversion
└── shared volume: /data/  (uploads/, converted/, db/)
```

- **Frontend:** React 18 + TypeScript + Vite, potree-core + Three.js (WebGL)
- **API:** Python 3.12 / FastAPI + SQLAlchemy + SQLite
- **Worker:** Python poll loop + PotreeConverter 2.1.1 (C++, built from source)
- **Orchestration:** Podman compose

## Quick Start

```bash
# Create a podman VM with enough resources for large datasets
podman machine init --memory 12288 --cpus 4 --disk-size 100
podman machine start

# Build and run
podman-compose up --build -d

# Open the viewer
open http://localhost:8080
```

## Development

```bash
# Frontend dev server (hot reload)
cd frontend && npm install && npm run dev

# API (Python 3.12+ venv)
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt pytest httpx

# Run tests
cd api && python -m pytest ../tests/api/ -v
python -m pytest tests/worker/ -v
```

## Features

- Chunked file upload with progress tracking
- Automatic LAZ/LAS to Potree octree conversion
- Real-time conversion progress (%) and error reporting
- 3D point cloud rendering with orbit/pan/zoom controls
- Adaptive performance (auto-adjusts point budget based on FPS)
- Appearance controls (point size, budget, EDL, material mode)
- Dataset management (list, select, delete)

## Project Structure

```
├── frontend/          React/TypeScript app + nginx config
│   └── src/
│       ├── components/   Toolbar, UploadDialog, ViewerCanvas, Sidebar panels
│       ├── hooks/        usePotree, useAdaptivePerformance
│       └── api/          REST client
├── api/               FastAPI backend
│   └── app/
│       ├── routers/      datasets, jobs endpoints
│       ├── models/       SQLAlchemy ORM models
│       └── services/     upload, conversion logic
├── worker/            Conversion worker
│   └── app/
│       ├── converter.py  PotreeConverter subprocess wrapper
│       └── main.py       Poll loop
├── tests/             API and worker tests
├── data/              Runtime data (gitignored)
└── podman-compose.yml
```

## Requirements

- Podman (with a VM configured for at least 12GB RAM for large datasets)
- Node.js 20+ (for frontend development)
- Python 3.12+ (for API/worker development)

## License

Private project.
