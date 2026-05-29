from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://localhost:15526"


class Sts2McpError(RuntimeError):
    """Base error for read-only STS2MCP integration failures."""


class Sts2McpConnectionError(Sts2McpError):
    """Raised when the localhost STS2MCP API cannot be reached."""


class Sts2McpHttpError(Sts2McpError):
    """Raised when STS2MCP returns an HTTP error response."""


class Sts2McpInvalidResponseError(Sts2McpError):
    """Raised when STS2MCP returns a non-JSON or non-object response."""


@dataclass(frozen=True)
class Sts2McpClient:
    """Small read-only HTTP client for the STS2MCP local API."""

    base_url: str = DEFAULT_BASE_URL
    timeout: float = 5.0

    def __post_init__(self) -> None:
        if self.timeout <= 0:
            raise ValueError("timeout must be greater than zero")

    def get_state(self) -> dict[str, Any]:
        return self._get_json("/api/v1/singleplayer", query={"format": "json"})

    def probe(self) -> dict[str, Any]:
        try:
            state = self.get_state()
        except Sts2McpError as exc:
            return {
                "reachable": False,
                "base_url": self.normalized_base_url,
                "message": str(exc),
            }

        return {
            "reachable": True,
            "base_url": self.normalized_base_url,
            "state_type": state.get("state_type") or state.get("screen"),
            "character": _nested_first(state, ("player", "character"), ("player", "character_id"), ("player", "class")),
            "act": _nested_first(state, ("run", "act")),
            "floor": _nested_first(state, ("run", "floor")),
        }

    @property
    def normalized_base_url(self) -> str:
        return self.base_url.rstrip("/")

    def _get_json(self, path: str, *, query: dict[str, str] | None = None) -> dict[str, Any]:
        url = urljoin(self.normalized_base_url + "/", path.lstrip("/"))
        if query:
            url = f"{url}?{urlencode(query)}"

        request = Request(url, method="GET", headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read()
        except HTTPError as exc:
            detail = _read_error_body(exc)
            raise Sts2McpHttpError(f"STS2MCP returned HTTP {exc.code} for {url}: {detail}") from exc
        except (URLError, socket.timeout, TimeoutError, OSError) as exc:
            raise Sts2McpConnectionError(
                f"Could not reach STS2MCP at {self.normalized_base_url}. "
                "Start Slay the Spire 2 with the STS2MCP mod installed, then retry."
            ) from exc

        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise Sts2McpInvalidResponseError(f"STS2MCP returned invalid JSON for {url}") from exc

        if not isinstance(payload, dict):
            raise Sts2McpInvalidResponseError(f"STS2MCP returned {type(payload).__name__}; expected JSON object")
        return payload


def _read_error_body(exc: HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace").strip()
    except OSError:
        body = ""
    return body or exc.reason or "no response body"


def _nested_first(data: dict[str, Any], *paths: tuple[str, ...]) -> Any:
    for path in paths:
        value: Any = data
        for part in path:
            if not isinstance(value, dict) or part not in value:
                value = None
                break
            value = value[part]
        if value is not None:
            return value
    return None
