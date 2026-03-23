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
