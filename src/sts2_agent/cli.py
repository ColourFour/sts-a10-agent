from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from .advice import advise
from .io import dump_stable_json, load_json_state
from .logging import (
    build_foundation_decision_record,
    build_recommendation_decision_record,
    validate_jsonl_log,
    write_jsonl_record,
)
from .metadata import DEFAULT_CACHE_DIR, SpireCodexMetadataProvider
from .models import validate_run_state
from .normalize import normalize
from .sts2mcp import DEFAULT_BASE_URL, Sts2McpClient


def _cmd_dump_state(args: argparse.Namespace) -> int:
    raw = load_json_state(args.state)
    sys.stdout.write(dump_stable_json(raw))
    return 0


def _cmd_normalize_fixture(args: argparse.Namespace) -> int:
    raw = load_json_state(args.fixture)
    state = normalize(raw, source=args.source, source_path=None if args.fixture == "-" else str(args.fixture))
    state_dict = state.to_dict()
    validate_run_state(state_dict)
    rendered = dump_stable_json(state_dict)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)

    if args.log:
        record = build_foundation_decision_record(state)
        write_jsonl_record(args.log, record)
    return 0


def _cmd_validate_log(args: argparse.Namespace) -> int:
    count = validate_jsonl_log(args.log)
    print(f"valid: {count} records")
    return 0


def _cmd_probe_live(args: argparse.Namespace) -> int:
    client = _live_client(args)
    result = client.probe()
    sys.stdout.write(dump_stable_json(result))
    return 0


def _cmd_dump_live(args: argparse.Namespace) -> int:
    client = _live_client(args)
    raw = client.get_state()
    sys.stdout.write(dump_stable_json(raw))
    return 0


def _cmd_normalize_live(args: argparse.Namespace) -> int:
    client = _live_client(args)
    raw = client.get_state()
    state = normalize(raw, source="sts2mcp", source_url=client.normalized_base_url, observed_at=_now_utc())
    state_dict = state.to_dict()
    validate_run_state(state_dict)
    sys.stdout.write(dump_stable_json(state_dict))
    return 0


def _cmd_advise_live(args: argparse.Namespace) -> int:
    client = _live_client(args)
    raw = client.get_state()
    state = normalize(raw, source="sts2mcp", source_url=client.normalized_base_url, observed_at=_now_utc())
    state_dict = state.to_dict()
    validate_run_state(state_dict)
    metadata = _metadata_provider(args)
    recommendation = advise(state, metadata=metadata)
    payload = recommendation.to_dict()
    payload["metadata_status"] = metadata.status()
    sys.stdout.write(dump_stable_json(payload))
    if args.log:
        record = build_recommendation_decision_record(state, recommendation)
        write_jsonl_record(args.log, record)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sts2-agent",
        description="Read-only STS2 A10 advisor tools.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    dump_state = subcommands.add_parser("dump-state", help="Load JSON state from a file or stdin and print stable JSON.")
    dump_state.add_argument("state", nargs="?", default="-", help="Raw JSON state path, or '-' for stdin.")
    dump_state.set_defaults(func=_cmd_dump_state)

    normalize_fixture = subcommands.add_parser("normalize-fixture", help="Normalize a raw fixture into the v0.1 RunState schema.")
    normalize_fixture.add_argument("fixture", help="Raw JSON fixture path, or '-' for stdin.")
    normalize_fixture.add_argument("--source", default="sts2mcp", choices=["sts2mcp"], help="Raw state source schema.")
    normalize_fixture.add_argument("--output", "-o", help="Optional output JSON path.")
    normalize_fixture.add_argument("--log", help="Optional JSONL path for a foundation recommendation record.")
    normalize_fixture.set_defaults(func=_cmd_normalize_fixture)

    validate_log = subcommands.add_parser("validate-log", help="Validate a JSONL recommendation log.")
    validate_log.add_argument("log", help="JSONL recommendation log path.")
    validate_log.set_defaults(func=_cmd_validate_log)

    probe_live = subcommands.add_parser("probe-live", help="Check whether the read-only STS2MCP state endpoint is reachable.")
    _add_live_args(probe_live)
    probe_live.set_defaults(func=_cmd_probe_live)

    dump_live = subcommands.add_parser("dump-live", help="Fetch read-only raw live state from STS2MCP and print stable JSON.")
    _add_live_args(dump_live)
    dump_live.set_defaults(func=_cmd_dump_live)

    normalize_live = subcommands.add_parser("normalize-live", help="Fetch read-only live state from STS2MCP and print normalized RunState JSON.")
    _add_live_args(normalize_live)
    normalize_live.set_defaults(func=_cmd_normalize_live)

    advise_live = subcommands.add_parser("advise-live", help="Fetch live state and print a read-only recommendation for the current screen.")
    _add_live_args(advise_live)
    advise_live.add_argument("--log", help="Optional JSONL path to append the recommendation record.")
    advise_live.add_argument(
        "--metadata-cache",
        default=str(DEFAULT_CACHE_DIR),
        help="Local Spire Codex cache directory. Missing cache is a warning, not a failure.",
    )
    advise_live.add_argument(
        "--refresh-metadata",
        action="store_true",
        help="Best-effort refresh of small Spire Codex JSON caches before advising.",
    )
    advise_live.set_defaults(func=_cmd_advise_live)

    return parser


def _add_live_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="STS2MCP base URL.")
    parser.add_argument("--timeout", type=float, default=5.0, help="HTTP timeout in seconds.")


def _live_client(args: argparse.Namespace) -> Sts2McpClient:
    return Sts2McpClient(base_url=args.base_url, timeout=args.timeout)


def _metadata_provider(args: argparse.Namespace) -> SpireCodexMetadataProvider:
    provider = SpireCodexMetadataProvider(cache_dir=Path(args.metadata_cache))
    provider.load(refresh=bool(args.refresh_metadata))
    return provider


def _now_utc() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
