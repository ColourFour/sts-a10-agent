from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, TextIO


def load_json_state(path: str | Path | None = None, *, stdin: TextIO | None = None) -> dict[str, Any]:
    """Load a raw JSON object from a file path or stdin.

    Passing ``None`` or ``"-"`` reads from stdin. The foundation only reads
    state; it never sends actions to a game process.
    """
    if path is None or str(path) == "-":
        text = (stdin or sys.stdin).read()
        source = "stdin"
    else:
        source_path = Path(path)
        text = source_path.read_text(encoding="utf-8")
        source = str(source_path)

    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {source}: {exc}") from exc

    if not isinstance(value, dict):
        raise ValueError(f"Expected top-level JSON object in {source}")
    return value


def dump_stable_json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"

