import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add worker directory to path so we can import converter directly
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "worker"))

def test_run_potree_converter_success(tmp_path):
    from app.converter import run_potree_converter
    input_file = tmp_path / "test.laz"
    input_file.write_bytes(b"fake laz data")
    output_dir = tmp_path / "output"
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "done"
    mock_result.stderr = ""
    with patch("subprocess.run", return_value=mock_result):
        output_dir.mkdir()
        (output_dir / "metadata.json").write_text("{}")
        result = run_potree_converter(input_file, output_dir)
        assert result == output_dir

def test_run_potree_converter_failure(tmp_path):
    from app.converter import run_potree_converter, ConversionError
    input_file = tmp_path / "test.laz"
    input_file.write_bytes(b"fake")
    output_dir = tmp_path / "output"
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "some error"
    with patch("subprocess.run", return_value=mock_result):
        try:
            run_potree_converter(input_file, output_dir)
            assert False, "Should have raised"
        except ConversionError as e:
            assert "some error" in str(e)
