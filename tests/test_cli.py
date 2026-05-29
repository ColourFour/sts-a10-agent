from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from sts2_agent.logging import validate_jsonl_log


ROOT = Path(__file__).resolve().parents[1]


def _env() -> dict[str, str]:
    env = os.environ.copy()
    src = str(ROOT / "src")
    env["PYTHONPATH"] = src + os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else src
    return env


def test_cli_help_smoke() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "sts2_agent", "--help"],
        cwd=ROOT,
        env=_env(),
        text=True,
        capture_output=True,
        check=True,
    )

    assert "dump-state" in result.stdout
    assert "normalize-fixture" in result.stdout
    assert "validate-log" in result.stdout
    assert "probe-live" in result.stdout
    assert "advise-live" in result.stdout


def test_cli_normalize_fixture_outputs_json() -> None:
    fixture = ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json"
    result = subprocess.run(
        [sys.executable, "-m", "sts2_agent", "normalize-fixture", str(fixture)],
        cwd=ROOT,
        env=_env(),
        text=True,
        capture_output=True,
        check=True,
    )
    data = json.loads(result.stdout)

    assert data["schema_version"] == "0.1"
    assert data["choices"]["options"][0]["option_id"] == "card_reward:0"


def test_cli_validate_log_smoke() -> None:
    log_path = ROOT / "fixtures" / "logs" / "sample_recommendations.jsonl"
    result = subprocess.run(
        [sys.executable, "-m", "sts2_agent", "validate-log", str(log_path)],
        cwd=ROOT,
        env=_env(),
        text=True,
        capture_output=True,
        check=True,
    )

    assert result.stdout.strip() == "valid: 1 records"


def test_cli_live_commands_with_mocked_sts2mcp(tmp_path: Path) -> None:
    raw_path = ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json"
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    server = _fixture_server(raw)
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        probe = subprocess.run(
            [sys.executable, "-m", "sts2_agent", "probe-live", "--base-url", base_url],
            cwd=ROOT,
            env=_env(),
            text=True,
            capture_output=True,
            check=True,
        )
        dump = subprocess.run(
            [sys.executable, "-m", "sts2_agent", "dump-live", "--base-url", base_url],
            cwd=ROOT,
            env=_env(),
            text=True,
            capture_output=True,
            check=True,
        )
        normalized = subprocess.run(
            [sys.executable, "-m", "sts2_agent", "normalize-live", "--base-url", base_url],
            cwd=ROOT,
            env=_env(),
            text=True,
            capture_output=True,
            check=True,
        )
        log_path = tmp_path / "recommendations.local.jsonl"
        advice = subprocess.run(
            [sys.executable, "-m", "sts2_agent", "advise-live", "--base-url", base_url, "--log", str(log_path)],
            cwd=ROOT,
            env=_env(),
            text=True,
            capture_output=True,
            check=True,
        )
    finally:
        server.shutdown()
        server.server_close()

    assert json.loads(probe.stdout)["reachable"] is True
    assert json.loads(dump.stdout)["state_type"] == "card_reward"
    assert json.loads(normalized.stdout)["choices"]["kind"] == "card_reward"
    recommendation = json.loads(advice.stdout)
    assert recommendation["decision_type"] == "card_reward"
    assert recommendation["recommended_action"].startswith("Pick")
    assert validate_jsonl_log(log_path) == 1


def _fixture_server(raw: dict[str, Any]) -> ThreadingHTTPServer:
    body = json.dumps(raw).encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path.startswith("/api/v1/singleplayer"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(404)
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server
