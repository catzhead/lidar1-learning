import subprocess
import signal
import re
import logging
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

class ConversionError(Exception):
    pass

_PROGRESS_RE = re.compile(r"(\d{1,3})%")


def run_potree_converter(
    input_path: Path,
    output_dir: Path,
    on_progress: Optional[Callable[[float], None]] = None,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "/usr/local/bin/PotreeConverter",
        str(input_path), "-o", str(output_dir),
        "--generate-page", "index",
    ]
    logger.info(f"Running: {' '.join(cmd)}")

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )

    last_progress = 0.0
    output_lines: list[str] = []

    try:
        for line in proc.stdout:
            line = line.rstrip()
            output_lines.append(line)
            if len(output_lines) > 200:
                output_lines.pop(0)

            match = _PROGRESS_RE.search(line)
            if match:
                pct = float(match.group(1))
                if pct > last_progress:
                    last_progress = pct
                    logger.info(f"Progress: {pct:.0f}%")
                    if on_progress:
                        on_progress(min(pct, 99.0))

        proc.wait(timeout=7200)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise ConversionError("PotreeConverter timed out after 2 hours")

    if proc.returncode != 0:
        tail = "\n".join(output_lines[-50:])
        if proc.returncode < 0:
            sig = -proc.returncode
            sig_name = signal.Signals(sig).name if sig in signal.Signals._value2member_map_ else str(sig)
            raise ConversionError(
                f"PotreeConverter crashed with signal {sig_name} (exit {proc.returncode}).\n"
                f"Output tail:\n{tail}"
            )
        raise ConversionError(
            f"PotreeConverter failed (exit {proc.returncode}).\nOutput tail:\n{tail}"
        )

    metadata = output_dir / "metadata.json"
    if not metadata.exists():
        raise ConversionError(f"PotreeConverter completed but metadata.json not found in {output_dir}")
    logger.info(f"Conversion complete: {output_dir}")
    return output_dir
