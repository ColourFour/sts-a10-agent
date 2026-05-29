from __future__ import annotations

from pathlib import Path

from sts2_agent.advice import advise
from sts2_agent.io import load_json_state
from sts2_agent.normalize import normalize


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "fixtures" / "raw" / "sts2mcp"


def test_card_reward_recommendation_has_required_shape() -> None:
    state = normalize(load_json_state(RAW / "card_reward_regent.json"))

    recommendation = advise(state).to_dict()

    assert recommendation["decision_type"] == "card_reward"
    assert recommendation["recommended_action"].startswith("Pick")
    assert 0 <= recommendation["confidence"] <= 1
    assert recommendation["risk_notes"]
    assert recommendation["reasoning"]
    assert recommendation["known_facts_used"]
    assert recommendation["uncertain_assumptions"]


def test_rest_site_recommends_rest_at_low_hp() -> None:
    state = normalize(load_json_state(RAW / "rest_site_regent.json"))

    recommendation = advise(state).to_dict()

    assert recommendation["decision_type"] == "rest_site"
    assert "Rest" in recommendation["recommended_action"]


def test_shop_prefers_affordable_removal() -> None:
    state = normalize(load_json_state(RAW / "shop_regent.json"))

    recommendation = advise(state).to_dict()

    assert recommendation["decision_type"] == "shop"
    assert recommendation["candidate_id"] == "shop:remove"


def test_map_avoids_elite_at_low_hp_when_rest_visible() -> None:
    state = normalize(load_json_state(RAW / "map_regent.json"))

    recommendation = advise(state).to_dict()

    assert recommendation["decision_type"] == "map"
    assert recommendation["candidate_id"] == "map:1"


def test_event_advice_is_low_confidence_and_limited() -> None:
    state = normalize(load_json_state(RAW / "event_regent.json"))

    recommendation = advise(state).to_dict()

    assert recommendation["decision_type"] == "event"
    assert recommendation["confidence"] < 0.5
    assert "limited" in " ".join(recommendation["risk_notes"]).lower()


def test_combat_is_observation_only() -> None:
    state = normalize(load_json_state(RAW / "combat_regent.json"))

    recommendation = advise(state).to_dict()

    assert recommendation["decision_type"] == "combat"
    assert recommendation["action_kind"] == "observe_only"
    assert "do not auto-play" in recommendation["recommended_action"]
