# LiDAR Viewer

Web application for visualizing LiDAR point cloud datasets, matching Phoenix LidarMill's Cloud Viewer feature set.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite, Potree 2.0 (potree-core + Three.js, WebGL), dark theme
- **API:** Python 3.12+ / FastAPI + SQLAlchemy + SQLite
- **Worker:** Python poll loop + PotreeConverter 2.1.1 (C++ built from source in Docker)
- **Containers:** Podman compose — 3 services (frontend/nginx, api, worker)

## Quick Start

```bash
podman machine init --memory 12288 --cpus 4 --disk-size 100
podman machine start
podman-compose up --build -d
# Open http://localhost:8080
```

## Development

```bash
# Frontend dev server (hot reload)
cd frontend && npm install && npm run dev

# API (needs Python 3.12-3.13 venv)
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt pytest httpx

# Run tests
cd api && python -m pytest ../tests/api/ -v
python -m pytest tests/worker/ -v
```

## Key Files

- Spec: `docs/superpowers/specs/2026-03-23-lidar-viewer-design.md`
- Plan: `docs/superpowers/plans/2026-03-23-lidar-viewer.md`
- Frontend: `frontend/src/` (React components, Potree hooks, API client)
- API: `api/app/` (FastAPI routers, models, services)
- Worker: `worker/app/` (converter, poll loop, shared models)
- Compose: `podman-compose.yml`

## Known Issues

- PotreeConverter needs substantial RAM for large files (28GB LAZ requires 12GB+ available to the container). Ensure podman VM has enough memory.
- PotreeConverter 2.x does NOT have a `--memory-limit` flag.
- PotreeConverter resolves `resources/` relative to cwd — the Dockerfile symlinks it into `/app/resources` and `/usr/local/bin/resources`.

## Conventions

- Commits use conventional format (`feat:`, `fix:`)
- Use `podman` (not docker)
- Python deps in `api/requirements.txt`, frontend deps in `frontend/package.json`
- Data directories (`data/`, `dataset/`) are gitignored
