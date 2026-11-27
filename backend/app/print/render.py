"""PDF rendering through the pinned `typst` binary (docs/02-architektura.md D12)."""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

PRINT_DIR = Path(__file__).resolve().parent
RENDER_TIMEOUT_SECONDS: float = 10


class RenderError(Exception):
    """typst could not produce the document; the details are only logged."""


def render(template: str, data: str) -> bytes:
    """Compile `templates/<template>` with `data` (JSON) available as `sys.inputs.data`."""
    typst = shutil.which("typst")
    if typst is None:
        msg = "typst binary not found"
        raise RenderError(msg)

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "out.pdf"
        command = [
            typst,
            "compile",
            str(PRINT_DIR / "templates" / template),
            str(out),
            "--root",
            str(PRINT_DIR),
            "--input",
            f"data={data}",
            "--ignore-system-fonts",
            "--font-path",
            str(PRINT_DIR / "fonts"),
        ]
        try:
            result = subprocess.run(  # noqa: S603  # fixed argv, no shell; data is one argument
                command,
                capture_output=True,
                text=True,
                timeout=RENDER_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            msg = f"typst timed out after {RENDER_TIMEOUT_SECONDS} s"
            raise RenderError(msg) from exc

        if result.returncode != 0:
            last_line = result.stderr.strip().splitlines()[-1:] or [""]
            logger.error("typst failed for %s: %s", template, last_line[0])
            msg = f"typst exit code {result.returncode}"
            raise RenderError(msg)
        return out.read_bytes()
