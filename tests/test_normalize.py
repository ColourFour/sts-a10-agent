from __future__ import annotations

import json
from pathlib import Path

from sts2_agent.io import load_json_state
from sts2_agent.models import validate_run_state
from sts2_agent.normalize import normalize


ROOT = Path(__file__).resolve().parents[1]


def test_sts2mcp_card_reward_fixture_normalizes() -> None:
    raw_path = ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json"
    raw = load_json_state(raw_path)
    state = normalize(raw, source="sts2mcp", source_path=str(raw_path)).to_dict()

    validate_run_state(state)
    assert state["session"]["screen"] == "card_reward"
    assert state["run"]["character"] == "REGENT"
    assert state["run"]["ascension"] == 10
    assert state["choices"]["kind"] == "card_reward"
    assert [option["option_id"] for option in state["choices"]["options"]] == [
        "card_reward:0",
        "card_reward:1",
    ]


def test_normalized_output_is_stable() -> None:
    raw_path = ROOT / "fixtures" / "raw" / "sts2mcp" / "card_reward_regent.json"
    raw = load_json_state(raw_path)
    first = normalize(raw, source_path=str(raw_path)).to_dict()
    second = normalize(raw, source_path=str(raw_path)).to_dict()

    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_sts2mcp_between_room_fixtures_normalize() -> None:
    fixture_names = [
        "shop_regent.json",
        "rest_site_regent.json",
        "map_regent.json",
        "event_regent.json",
        "combat_regent.json",
    ]

    for fixture_name in fixture_names:
        raw_path = ROOT / "fixtures" / "raw" / "sts2mcp" / fixture_name
        state = normalize(load_json_state(raw_path), source_path=str(raw_path)).to_dict()
        validate_run_state(state)

    shop = normalize(load_json_state(ROOT / "fixtures" / "raw" / "sts2mcp" / "shop_regent.json")).to_dict()
    rest = normalize(load_json_state(ROOT / "fixtures" / "raw" / "sts2mcp" / "rest_site_regent.json")).to_dict()
    combat = normalize(load_json_state(ROOT / "fixtures" / "raw" / "sts2mcp" / "combat_regent.json")).to_dict()

    assert shop["choices"]["kind"] == "shop"
    assert shop["choices"]["options"][0]["option_id"] == "shop:remove"
    assert rest["choices"]["kind"] == "rest_site"
    assert combat["combat"]["enemies"][0]["entity_id"] == "synthetic_enemy"
