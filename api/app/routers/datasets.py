import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.dataset import Dataset, DatasetStatus
from app.services.conversion import enqueue_conversion
from app.services.upload import save_chunk, assemble_chunks, get_existing_chunks

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

ALLOWED_EXTENSIONS = {".laz", ".las"}


# --- Pydantic models ---

class DatasetOut(BaseModel):
    id: str
    name: str
    filename: str
    file_size: Optional[int] = None
    point_count: Optional[int] = None
    crs: Optional[str] = None
    bounds: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


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


# --- Endpoints ---

@router.post("/upload/init", response_model=InitUploadResponse)
def init_upload(filename: str = Query(...), db: Session = Depends(get_db)):
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file extension '{ext}'. Allowed: {ALLOWED_EXTENSIONS}")
    name = Path(filename).stem
    dataset = Dataset(name=name, filename=filename, status=DatasetStatus.uploading)
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    existing = get_existing_chunks(dataset.id)
    return InitUploadResponse(dataset_id=dataset.id, existing_chunks=existing)


@router.post("/upload/{dataset_id}/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    dataset_id: str,
    chunk_index: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    chunk_data = await file.read()
    await save_chunk(dataset_id, chunk_index, chunk_data)
    return ChunkUploadResponse(chunk_index=chunk_index, received=True)


@router.post("/upload/{dataset_id}/finalize", response_model=FinalizeResponse)
def finalize_upload(
    dataset_id: str,
    total_chunks: int = Query(...),
    db: Session = Depends(get_db),
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    final_path = assemble_chunks(dataset_id, dataset.filename, total_chunks)
    dataset.file_size = final_path.stat().st_size
    db.commit()
    job = enqueue_conversion(db, dataset)
    return FinalizeResponse(dataset_id=dataset.id, status=dataset.status.value, job_id=job.id)


@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)):
    return db.query(Dataset).all()


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/{dataset_id}/download")
def download_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    file_path = settings.upload_dir / dataset_id / dataset.filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=str(file_path), filename=dataset.filename)


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    # Delete files
    dataset_dir = settings.upload_dir / dataset_id
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    # Delete from DB (job first due to FK)
    if dataset.job:
        db.delete(dataset.job)
    db.delete(dataset)
    db.commit()
    return {"detail": "deleted", "dataset_id": dataset_id}
