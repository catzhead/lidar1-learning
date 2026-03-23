import io
import importlib
from fastapi.testclient import TestClient


def make_client(tmp_path, monkeypatch):
    # Set env BEFORE importing any app modules
    db_dir = tmp_path / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("LIDAR_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIDAR_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("LIDAR_CONVERTED_DIR", str(tmp_path / "converted"))
    monkeypatch.setenv("LIDAR_DB_URL", f"sqlite:///{db_dir}/lidar.db")

    # Force re-import so settings/engine pick up new env vars
    import app.config
    importlib.reload(app.config)
    import app.db
    importlib.reload(app.db)
    import app.models.dataset
    importlib.reload(app.models.dataset)
    import app.models
    importlib.reload(app.models)

    from app.db import Base, engine
    Base.metadata.create_all(bind=engine)

    import app.services.upload
    importlib.reload(app.services.upload)
    import app.services.conversion
    importlib.reload(app.services.conversion)
    import app.routers.datasets
    importlib.reload(app.routers.datasets)
    import app.main
    importlib.reload(app.main)

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
    r = client.post("/api/datasets/upload/init?filename=test.laz")
    dataset_id = r.json()["dataset_id"]
    for i in range(2):
        chunk = io.BytesIO(b"x" * 1024)
        r = client.post(
            f"/api/datasets/upload/{dataset_id}/chunk?chunk_index={i}",
            files={"file": ("chunk", chunk)},
        )
        assert r.status_code == 200
    r = client.post(f"/api/datasets/upload/{dataset_id}/finalize?total_chunks=2")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "uploaded"
    assert "job_id" in data
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
    r = client.post("/api/datasets/upload/init?filename=test.laz")
    dataset_id = r.json()["dataset_id"]
    r = client.delete(f"/api/datasets/{dataset_id}")
    assert r.status_code == 200
    r = client.get(f"/api/datasets/{dataset_id}")
    assert r.status_code == 404
