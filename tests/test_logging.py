from __future__ import annotations

from pathlib import Path

from sts2_agent.advice import advise
from sts2_agent.io import load_json_state
from sts2_agent.logging import (
    build_foundation_decision_record,
    build_recommendation_decision_record,
    validate_jsonl_log,
    write_jsonl_record,
)
from sts2_agent.models import validate_decision_record
from sts2_agent.normalize import normalize


ROOT = Path(__file__).resolve().parents[1]


def test_foundation_decision_log_can_be_written_and_validated(tmp_path: Path) -> None:
    raw = load_json_state(ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json")
    state = normalize(raw)
    record = build_foundation_decision_record(
        state,
        decision_id="test-decision",
        timestamp="2026-05-29T00:00:00Z",
    )
    validate_decision_record(record)

    log_path = tmp_path / "recommendations.jsonl"
    write_jsonl_record(log_path, record, append=False)

    assert validate_jsonl_log(log_path) == 1


def test_sample_log_fixture_validates() -> None:
    log_path = ROOT / "fixtures" / "logs" / "sample_recommendations.jsonl"

    assert validate_jsonl_log(log_path) == 1


def test_live_recommendation_log_contains_read_only_advice(tmp_path: Path) -> None:
    raw = load_json_state(ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json")
    state = normalize(raw)
    recommendation = advise(state)
    record = build_recommendation_decision_record(
        state,
        recommendation,
        decision_id="test-live-decision",
        timestamp="2026-05-29T00:00:00Z",
    )
    validate_decision_record(record)

    assert record["executor"]["mode"] == "disabled"
    assert record["recommendation"]["decision_type"] == "card_reward"
    assert record["recommendation"]["known_facts_used"]

    log_path = tmp_path / "nested" / "recommendations.jsonl"
    write_jsonl_record(log_path, record, append=False)
    assert validate_jsonl_log(log_path) == 1
