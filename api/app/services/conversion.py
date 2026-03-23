from sqlalchemy.orm import Session
from app.models.dataset import Dataset, Job, DatasetStatus, JobStatus


def enqueue_conversion(db: Session, dataset: Dataset) -> Job:
    job = Job(dataset_id=dataset.id, status=JobStatus.pending)
    dataset.status = DatasetStatus.uploaded
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
