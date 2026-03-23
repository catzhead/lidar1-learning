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
