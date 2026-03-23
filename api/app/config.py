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
