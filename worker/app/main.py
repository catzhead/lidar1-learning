import time
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_URL = os.environ.get("LIDAR_DB_URL", "sqlite:////data/db/lidar.db")
UPLOAD_DIR = Path(os.environ.get("LIDAR_UPLOAD_DIR", "/data/uploads"))
CONVERTED_DIR = Path(os.environ.get("LIDAR_CONVERTED_DIR", "/data/converted"))
POLL_INTERVAL = int(os.environ.get("LIDAR_POLL_INTERVAL", "5"))

from app.models import Dataset, Job, DatasetStatus, JobStatus
from app.converter import run_potree_converter, ConversionError

def get_session():
    engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
    return sessionmaker(bind=engine)()

def poll_and_process():
    db = get_session()
    try:
        job = db.query(Job).filter_by(status=JobStatus.pending).order_by(Job.id).first()
        if not job:
            return False
        dataset = db.query(Dataset).filter_by(id=job.dataset_id).first()
        if not dataset:
            job.status = JobStatus.failed
            job.error = "Dataset not found"
            db.commit()
            return True
        job.status = JobStatus.processing
        job.started_at = datetime.now(timezone.utc)
        dataset.status = DatasetStatus.processing
        db.commit()
        logger.info(f"Processing dataset {dataset.id}: {dataset.filename}")
        input_path = UPLOAD_DIR / dataset.id / dataset.filename
        output_dir = CONVERTED_DIR / dataset.id

        def update_progress(pct: float):
            job.progress = pct
            db.commit()

        try:
            run_potree_converter(input_path, output_dir, on_progress=update_progress)
            job.status = JobStatus.complete
            job.progress = 100.0
            job.completed_at = datetime.now(timezone.utc)
            dataset.status = DatasetStatus.ready
            logger.info(f"Dataset {dataset.id} conversion complete")
        except ConversionError as e:
            job.status = JobStatus.failed
            job.error = str(e)
            job.completed_at = datetime.now(timezone.utc)
            dataset.status = DatasetStatus.failed
            logger.error(f"Dataset {dataset.id} conversion failed: {e}")
        db.commit()
        return True
    finally:
        db.close()

def main():
    logger.info("Worker starting, polling for jobs...")
    while True:
        try:
            had_work = poll_and_process()
            if not had_work:
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            logger.info("Worker shutting down")
            break
        except Exception:
            logger.exception("Unexpected error in poll loop")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
