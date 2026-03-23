import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class ConversionError(Exception):
    pass

def run_potree_converter(input_path: Path, output_dir: Path, memory_limit_mb: int = 3000) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = ["/usr/local/bin/PotreeConverter", str(input_path), "-o", str(output_dir), "--generate-page", "index"]
    logger.info(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    if result.returncode != 0:
        raise ConversionError(f"PotreeConverter failed (exit {result.returncode}): {result.stderr[-2000:]}")
    metadata = output_dir / "metadata.json"
    if not metadata.exists():
        raise ConversionError(f"PotreeConverter completed but metadata.json not found in {output_dir}")
    logger.info(f"Conversion complete: {output_dir}")
    return output_dir
