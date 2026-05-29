from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from sts2_agent.io import load_json_state
from sts2_agent.sts2mcp import Sts2McpClient


ROOT = Path(__file__).resolve().parents[1]


def test_sts2mcp_client_fetches_state_from_http_fixture() -> None:
    raw = load_json_state(ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json")
    server = _fixture_server(raw)
    try:
        client = Sts2McpClient(base_url=f"http://127.0.0.1:{server.server_port}", timeout=1.0)

        state = client.get_state()
        probe = client.probe()
    finally:
        server.shutdown()
        server.server_close()

    assert state["state_type"] == "card_reward"
    assert probe["reachable"] is True
    assert probe["state_type"] == "card_reward"
    assert probe["character"] == "Regent"


def test_sts2mcp_probe_reports_unreachable_without_raising() -> None:
    client = Sts2McpClient(base_url="http://127.0.0.1:1", timeout=0.05)

    result = client.probe()

    assert result["reachable"] is False
    assert "Could not reach STS2MCP" in result["message"]


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
