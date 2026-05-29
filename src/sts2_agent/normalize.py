from __future__ import annotations

import hashlib
import json
from typing import Any

from .models import (
    CardInstance,
    ChoiceOption,
    ChoicesState,
    PlayerState,
    PotionState,
    RelicState,
    RunInfo,
    RunState,
    SessionInfo,
    SourceInfo,
)


def _stable_sha256(raw: dict[str, Any]) -> str:
    payload = json.dumps(raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _bool_or_none(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return None


def _first(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping:
            return mapping[key]
    return None


def _normalize_character(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return text.upper()


def _card_from_raw(raw: dict[str, Any]) -> CardInstance | None:
    card_id = _first(raw, "id", "card_id", "cardId")
    if not card_id:
        return None
    return CardInstance(
        id=str(card_id),
        name=_first(raw, "name", "title"),
        upgraded=_bool_or_none(_first(raw, "upgraded", "is_upgraded")),
        type=_first(raw, "type", "card_type"),
        rarity=_first(raw, "rarity"),
        cost=_first(raw, "cost", "energy_cost"),
        facts={
            "description": _first(raw, "description", "rules_text", "resolved_rules_text"),
            "target_type": _first(raw, "target_type", "target"),
        },
    )


def _relic_from_raw(raw: dict[str, Any]) -> RelicState | None:
    relic_id = _first(raw, "id", "relic_id", "relicId")
    if not relic_id:
        return None
    return RelicState(
        id=str(relic_id),
        name=_first(raw, "name", "title"),
        facts={"description": _first(raw, "description")},
    )


def _potion_from_raw(raw: dict[str, Any], slot: int) -> PotionState:
    potion_id = _first(raw, "id", "potion_id", "potionId")
    return PotionState(
        slot=_int_or_none(_first(raw, "slot", "index")) if _first(raw, "slot", "index") is not None else slot,
        id=str(potion_id) if potion_id else None,
        name=_first(raw, "name", "title"),
        can_use=_bool_or_none(_first(raw, "can_use", "can_use_in_combat")),
        requires_target=_bool_or_none(_first(raw, "requires_target")),
        facts={
            "usage": _first(raw, "usage"),
            "target_type": _first(raw, "target_type"),
            "occupied": _first(raw, "occupied"),
        },
    )


def _derive_actions(state_type: str, raw: dict[str, Any], choices: ChoicesState) -> list[str]:
    actions = raw.get("available_actions")
    if isinstance(actions, list):
        return [str(action) for action in actions]

    if state_type == "card_reward":
        derived = ["select_card_reward"]
        if choices.can_skip:
            derived.append("skip_card_reward")
        return derived
    if state_type == "map":
        return ["choose_map_node"] if choices.options else []
    if state_type == "rest_site":
        return ["choose_rest_option"]
    if state_type in {"shop", "fake_merchant"}:
        return ["shop_purchase", "proceed"]
    if state_type == "event":
        return ["choose_event_option"]
    if state_type in {"monster", "elite", "boss"}:
        return ["play_card", "use_potion", "end_turn"]
    return []


def _choice_options(state_type: str, raw: dict[str, Any]) -> ChoicesState:
    if state_type == "card_reward":
        payload = raw.get("card_reward") if isinstance(raw.get("card_reward"), dict) else {}
        cards = payload.get("cards", [])
        options = []
        if isinstance(cards, list):
            for position, card in enumerate(cards):
                if not isinstance(card, dict):
                    continue
                card_id = _first(card, "id", "card_id")
                index = _int_or_none(card.get("index"))
                if index is None:
                    index = position
                options.append(
                    ChoiceOption(
                        option_id=f"card_reward:{index}",
                        index=index,
                        kind="card",
                        id=str(card_id) if card_id else None,
                        name=_first(card, "name", "title"),
                        legal=True,
                        facts={
                            "upgraded": _first(card, "upgraded", "is_upgraded"),
                            "type": _first(card, "type", "card_type"),
                            "rarity": _first(card, "rarity"),
                            "cost": _first(card, "cost", "energy_cost"),
                            "description": _first(card, "description", "rules_text", "resolved_rules_text"),
                        },
                    )
                )
        return ChoicesState(kind="card_reward", options=options, can_skip=bool(payload.get("can_skip")))

    if state_type == "map":
        payload = raw.get("map") if isinstance(raw.get("map"), dict) else {}
        nodes = payload.get("next_options", payload.get("available_nodes", []))
        options = []
        if isinstance(nodes, list):
            for position, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                index = _int_or_none(node.get("index"))
                if index is None:
                    index = position
                node_type = _first(node, "type", "node_type")
                label = node_type or f"node {index}"
                options.append(
                    ChoiceOption(
                        option_id=f"map:{index}",
                        index=index,
                        kind="map_node",
                        id=str(_first(node, "id", "node_id")) if _first(node, "id", "node_id") else None,
                        name=str(label),
                        legal=bool(node.get("enabled", True)),
                        facts={k: v for k, v in node.items() if k != "index"},
                    )
                )
        return ChoicesState(kind="map", options=options)

    if state_type == "event":
        payload = raw.get("event") if isinstance(raw.get("event"), dict) else {}
        event_options = payload.get("options", [])
        options = []
        if isinstance(event_options, list):
            for position, option in enumerate(event_options):
                if not isinstance(option, dict):
                    continue
                index = _int_or_none(option.get("index"))
                if index is None:
                    index = position
                options.append(
                    ChoiceOption(
                        option_id=f"event:{index}",
                        index=index,
                        kind="event_option",
                        id=str(_first(option, "id", "text_key")) if _first(option, "id", "text_key") else None,
                        name=_first(option, "title", "label", "name"),
                        legal=not bool(option.get("is_locked", False)),
                        facts={k: v for k, v in option.items() if k != "index"},
                    )
                )
        return ChoicesState(kind="event", options=options)

    if state_type == "rest_site":
        payload = raw.get("rest_site") if isinstance(raw.get("rest_site"), dict) else {}
        rest_options = payload.get("options", payload.get("choices", []))
        options = []
        if isinstance(rest_options, list):
            for position, option in enumerate(rest_options):
                option_data = option if isinstance(option, dict) else {"name": str(option), "id": str(option)}
                index = _int_or_none(option_data.get("index"))
                if index is None:
                    index = position
                option_id = _first(option_data, "id", "option_id", "key") or _first(option_data, "name", "label", "title")
                options.append(
                    ChoiceOption(
                        option_id=f"rest_site:{index}",
                        index=index,
                        kind="rest_option",
                        id=str(option_id) if option_id else None,
                        name=_first(option_data, "name", "label", "title"),
                        legal=not bool(option_data.get("is_locked", option_data.get("disabled", False))),
                        facts={k: v for k, v in option_data.items() if k != "index"},
                    )
                )
        return ChoicesState(kind="rest_site", options=options)

    if state_type in {"shop", "fake_merchant"}:
        payload = raw.get(state_type) if isinstance(raw.get(state_type), dict) else {}
        if not payload and isinstance(raw.get("shop"), dict):
            payload = raw["shop"]
        options: list[ChoiceOption] = []

        removal = payload.get("removal") if isinstance(payload.get("removal"), dict) else {}
        if payload.get("can_remove") or removal:
            options.append(
                ChoiceOption(
                    option_id="shop:remove",
                    index=0,
                    kind="shop_item",
                    id=str(_first(removal, "id", "option_id") or "card_removal"),
                    name=_first(removal, "name", "label", "title") or "Card removal",
                    legal=not bool(removal.get("is_locked", removal.get("disabled", False))),
                    facts={
                        "category": "removal",
                        "price": _first(removal, "price", "cost", "gold_cost", "cost_gold") or payload.get("removal_price"),
                    },
                )
            )

        shop_items = payload.get("items")
        if not isinstance(shop_items, list):
            shop_items = []
            for category in ("cards", "relics", "potions"):
                values = payload.get(category, [])
                if isinstance(values, list):
                    for value in values:
                        if isinstance(value, dict):
                            item = dict(value)
                            item.setdefault("category", category[:-1])
                            shop_items.append(item)

        base_index = len(options)
        for position, item in enumerate(shop_items):
            if not isinstance(item, dict):
                continue
            index = _int_or_none(item.get("index"))
            if index is None:
                index = base_index + position
            entity = item.get("item") if isinstance(item.get("item"), dict) else item
            entity_id = _first(entity, "id", "card_id", "relic_id", "potion_id")
            category = _first(item, "category", "kind", "type") or _first(entity, "category", "kind", "type")
            options.append(
                ChoiceOption(
                    option_id=f"shop:{index}",
                    index=index,
                    kind="shop_item",
                    id=str(entity_id) if entity_id else None,
                    name=_first(entity, "name", "title", "label"),
                    legal=not bool(item.get("is_locked", item.get("disabled", False))),
                    facts={
                        "category": category,
                        "price": _first(item, "price", "cost", "gold_cost", "cost_gold"),
                        "type": _first(entity, "type", "card_type"),
                        "rarity": _first(entity, "rarity"),
                        "description": _first(entity, "description", "rules_text", "resolved_rules_text"),
                    },
                )
            )
        return ChoicesState(kind="shop", options=options)

    return ChoicesState()


def normalize_sts2mcp(
    raw: dict[str, Any],
    *,
    source_path: str | None = None,
    source_url: str | None = None,
    observed_at: str = "1970-01-01T00:00:00Z",
) -> RunState:
    state_type = str(raw.get("state_type") or raw.get("screen") or "unknown")
    run_raw = raw.get("run") if isinstance(raw.get("run"), dict) else {}
    player_raw = raw.get("player") if isinstance(raw.get("player"), dict) else {}
    choices = _choice_options(state_type, raw)
    actions = _derive_actions(state_type, raw, choices)

    deck = []
    for card in player_raw.get("deck", []):
        if isinstance(card, dict):
            parsed = _card_from_raw(card)
            if parsed:
                deck.append(parsed)

    relics = []
    for relic in player_raw.get("relics", []):
        if isinstance(relic, dict):
            parsed = _relic_from_raw(relic)
            if parsed:
                relics.append(parsed)
        elif relic:
            relics.append(RelicState(id=str(relic)))

    potions = []
    raw_potions = player_raw.get("potions", [])
    if isinstance(raw_potions, list):
        for slot, potion in enumerate(raw_potions):
            if isinstance(potion, dict):
                potions.append(_potion_from_raw(potion, slot))
            elif potion:
                potions.append(PotionState(slot=slot, id=str(potion)))

    battle_raw = raw.get("battle") if isinstance(raw.get("battle"), dict) else {}
    combat = {
        "turn": _first(battle_raw, "turn", "round"),
        "phase": _first(battle_raw, "phase"),
        "hand": player_raw.get("hand", []),
        "enemies": battle_raw.get("enemies", []),
        "legal_actions": actions if state_type in {"monster", "elite", "boss", "hand_select"} else [],
    }

    unresolved_ids = []
    for option in choices.options:
        if option.kind in {"card", "relic", "potion"} and not option.id:
            unresolved_ids.append(option.option_id)

    return RunState(
        source=SourceInfo(kind="sts2mcp", raw_sha256=_stable_sha256(raw), observed_at=observed_at, path=source_path, url=source_url),
        session=SessionInfo(screen=state_type, is_actionable=bool(actions or choices.options), available_actions=actions),
        run=RunInfo(
            run_id=raw.get("run_id"),
            seed=raw.get("seed"),
            character=_normalize_character(_first(player_raw, "character", "character_id", "class")),
            ascension=_int_or_none(run_raw.get("ascension")),
            act=_int_or_none(run_raw.get("act")),
            floor=_int_or_none(run_raw.get("floor")),
        ),
        player=PlayerState(
            current_hp=_int_or_none(_first(player_raw, "current_hp", "hp")),
            max_hp=_int_or_none(player_raw.get("max_hp")),
            gold=_int_or_none(player_raw.get("gold")),
            block=_int_or_none(player_raw.get("block")),
            energy=_int_or_none(player_raw.get("energy")),
            stars=_int_or_none(player_raw.get("stars")),
            deck=deck,
            relics=relics,
            potions=potions,
        ),
        combat=combat,
        choices=choices,
        facts={
            "source_state_type": state_type,
            "unresolved_ids": unresolved_ids,
            "warnings": [] if not unresolved_ids else ["some choice IDs could not be resolved"],
        },
        estimates={},
    )


def normalize(
    raw: dict[str, Any],
    *,
    source: str = "sts2mcp",
    source_path: str | None = None,
    source_url: str | None = None,
    observed_at: str = "1970-01-01T00:00:00Z",
) -> RunState:
    if source != "sts2mcp":
        raise ValueError(f"Unsupported source: {source}")
    return normalize_sts2mcp(raw, source_path=source_path, source_url=source_url, observed_at=observed_at)
