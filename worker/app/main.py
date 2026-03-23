import subprocess
import sys


def check_potree_converter():
    """Verify PotreeConverter is available."""
    result = subprocess.run(
        ["/usr/local/bin/PotreeConverter", "--help"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("PotreeConverter not found or failed", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    print("PotreeConverter is available")
    print(result.stdout[:200])


if __name__ == "__main__":
    check_potree_converter()
    print("Worker ready (poll loop not yet implemented)")
