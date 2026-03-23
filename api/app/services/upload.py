from pathlib import Path
from app.config import settings


async def save_chunk(dataset_id: str, chunk_index: int, chunk_data: bytes) -> Path:
    dataset_dir = settings.upload_dir / dataset_id
    dataset_dir.mkdir(parents=True, exist_ok=True)
    chunk_path = dataset_dir / f"chunk_{chunk_index:06d}"
    chunk_path.write_bytes(chunk_data)
    return chunk_path


def assemble_chunks(dataset_id: str, filename: str, total_chunks: int) -> Path:
    dataset_dir = settings.upload_dir / dataset_id
    final_path = dataset_dir / filename
    with open(final_path, "wb") as out:
        for i in range(total_chunks):
            chunk_path = dataset_dir / f"chunk_{i:06d}"
            out.write(chunk_path.read_bytes())
            chunk_path.unlink()
    return final_path


def get_existing_chunks(dataset_id: str) -> list[int]:
    dataset_dir = settings.upload_dir / dataset_id
    if not dataset_dir.exists():
        return []
    return sorted(int(f.stem.split("_")[1]) for f in dataset_dir.glob("chunk_*"))
