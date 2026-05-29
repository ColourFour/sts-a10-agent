from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from .models import ChoiceOption, RunState


JsonDict = dict[str, Any]


class MetadataProvider(Protocol):
    warnings: list[str]

    def card(self, card_id: str | None) -> JsonDict | None: ...

    def relic(self, relic_id: str | None) -> JsonDict | None: ...

    def potion(self, potion_id: str | None) -> JsonDict | None: ...


@dataclass(frozen=True)
class AdvisorRecommendation:
    decision_type: str
    recommended_action: str
    confidence: float
    risk_notes: list[str]
    reasoning: str
    known_facts_used: list[str]
    uncertain_assumptions: list[str]
    action_kind: str = "observe_only"
    candidate_id: str | None = None
    recommended_choice: str | None = None
    candidates: list[JsonDict] = field(default_factory=list)

    def to_dict(self) -> JsonDict:
        return {
            "decision_type": self.decision_type,
            "recommended_action": self.recommended_action,
            "recommended_choice": self.recommended_choice,
            "confidence": round(self.confidence, 3),
            "risk_notes": self.risk_notes,
            "reasoning": self.reasoning,
            "known_facts_used": self.known_facts_used,
            "uncertain_assumptions": self.uncertain_assumptions,
            "action_kind": self.action_kind,
            "candidate_id": self.candidate_id,
            "candidates": self.candidates,
        }


def advise(state: RunState, metadata: MetadataProvider | None = None) -> AdvisorRecommendation:
    screen = state.session.screen
    choice_kind = state.choices.kind or screen
    if choice_kind == "card_reward" or screen == "card_reward":
        return _advise_card_reward(state, metadata)
    if choice_kind == "shop" or screen in {"shop", "fake_merchant"}:
        return _advise_shop(state, metadata)
    if choice_kind == "rest_site" or screen == "rest_site":
        return _advise_rest_site(state)
    if choice_kind == "map" or screen == "map":
        return _advise_map(state)
    if choice_kind == "event" or screen == "event":
        return _advise_event(state)
    if screen in {"monster", "elite", "boss", "hand_select"}:
        return _advise_combat_observation(state)
    return _unsupported(state, f"Unsupported or inactive screen: {screen}")


def _advise_card_reward(state: RunState, metadata: MetadataProvider | None) -> AdvisorRecommendation:
    legal_options = [option for option in state.choices.options if option.legal]
    known_facts = _base_facts(state)
    assumptions = _metadata_assumptions(metadata)
    if not legal_options:
        return AdvisorRecommendation(
            decision_type="card_reward",
            recommended_action="No legal card reward option is visible.",
            confidence=0.1,
            risk_notes=["The normalized state did not expose selectable card options."],
            reasoning="Read-only advisor cannot infer a card pick without legal options.",
            known_facts_used=known_facts,
            uncertain_assumptions=assumptions,
            action_kind="observe_only",
        )

    deck_metrics = _deck_metrics(state)
    known_facts.extend(
        [
            f"deck_attacks={deck_metrics['attacks']}",
            f"deck_skills={deck_metrics['skills']}",
            f"deck_size={deck_metrics['deck_size']}",
            f"can_skip={state.choices.can_skip}",
        ]
    )

    scored = []
    for option in legal_options:
        score, components, notes = _score_card_option(option, state, metadata, deck_metrics)
        scored.append(
            {
                "candidate_id": option.option_id,
                "kind": option.kind,
                "id": option.id,
                "label": option.name,
                "legal": option.legal,
                "score_total": round(score, 3),
                "score_components": components,
                "risk_notes": notes,
            }
        )

    scored.sort(key=lambda item: (-item["score_total"], str(item["candidate_id"])))
    best = scored[0]
    runner_up = scored[1]["score_total"] if len(scored) > 1 else 0.0
    margin = float(best["score_total"]) - float(runner_up)
    confidence = _bounded(0.42 + min(0.35, margin / 10.0) + (0.08 if _has_metadata(metadata) else 0.0))
    if best["score_total"] < 1.0 and state.choices.can_skip:
        return AdvisorRecommendation(
            decision_type="card_reward",
            recommended_action="Skip the card reward.",
            recommended_choice="skip",
            confidence=0.45,
            risk_notes=["All visible card options scored weakly under the first-pass heuristic."],
            reasoning="The advisor did not find a clear deck-improving card from the visible reward.",
            known_facts_used=known_facts,
            uncertain_assumptions=assumptions + ["Skip value is estimated without long-run deck simulator support."],
            action_kind="skip_card_reward",
            candidates=scored,
        )

    label = best["label"] or best["id"] or best["candidate_id"]
    risk_notes = list(best["risk_notes"])
    if not _has_metadata(metadata):
        risk_notes.append("Card metadata cache is unavailable; scoring used live names, IDs, types, and text only.")
    return AdvisorRecommendation(
        decision_type="card_reward",
        recommended_action=f"Pick {label}.",
        recommended_choice=str(label),
        confidence=confidence,
        risk_notes=risk_notes,
        reasoning="The first-pass Regent heuristic favors early deck needs, Regent-tagged cards, low-cost impact, and visible damage/block text.",
        known_facts_used=known_facts,
        uncertain_assumptions=assumptions,
        action_kind="pick_card",
        candidate_id=str(best["candidate_id"]),
        candidates=scored,
    )


def _score_card_option(
    option: ChoiceOption,
    state: RunState,
    metadata: MetadataProvider | None,
    deck_metrics: JsonDict,
) -> tuple[float, JsonDict, list[str]]:
    score = 0.0
    components: JsonDict = {}
    risks: list[str] = []
    card_meta = metadata.card(option.id) if metadata and option.id else None
    facts = _merged_card_facts(option, card_meta)
    haystack = " ".join(str(value) for value in [option.id, option.name, facts.get("type"), facts.get("rarity"), facts.get("description")] if value).lower()

    if "regent" in haystack:
        components["regent_match"] = 2.0
        score += 2.0
    if _is_early_act1(state):
        components["early_act1"] = 0.8
        score += 0.8
    if "attack" in haystack or "deal" in haystack or "damage" in haystack:
        value = 2.0 + (1.0 if deck_metrics["attacks"] <= 3 and _is_early_act1(state) else 0.0)
        components["frontload"] = value
        score += value
    if "block" in haystack or "defend" in haystack:
        value = 1.2 + (0.8 if _hp_ratio(state) < 0.6 else 0.0)
        components["defense"] = value
        score += value
    rarity = str(facts.get("rarity") or "").lower()
    if rarity == "rare":
        components["rarity"] = 1.6
        score += 1.6
    elif rarity == "uncommon":
        components["rarity"] = 0.8
        score += 0.8
    cost = _as_int(facts.get("cost"))
    if cost is not None:
        if cost <= 1:
            components["low_cost"] = 0.6
            score += 0.6
        elif cost >= 3 and _is_early_act1(state):
            components["expensive_early"] = -0.8
            score -= 0.8
            risks.append("High-cost card may be clunky before the deck has energy support.")
    if option.id and option.id in {card.id for card in state.player.deck}:
        components["duplicate_penalty"] = -0.7
        score -= 0.7
        risks.append("Duplicate penalty applied because the deck already contains this card ID.")
    if not option.id:
        components["unresolved_id"] = -0.5
        score -= 0.5
        risks.append("Card ID was not resolved from live state.")

    return score, components, risks


def _advise_rest_site(state: RunState) -> AdvisorRecommendation:
    legal_options = [option for option in state.choices.options if option.legal]
    known_facts = _base_facts(state) + [f"hp_ratio={_hp_ratio_text(state)}"]
    if not legal_options:
        return _unsupported(state, "Rest site state did not expose legal rest options.", decision_type="rest_site")

    hp_ratio = _hp_ratio(state)
    rest_option = _find_option(legal_options, "rest", "sleep", "heal")
    smith_option = _find_option(legal_options, "smith", "upgrade")
    if hp_ratio < 0.45 and rest_option:
        choice = rest_option
        action = f"Rest at the site ({choice.name or choice.option_id})."
        confidence = 0.72
        reasoning = "HP is below the conservative A10 safety threshold, so survival takes priority over upgrade value."
        risks = ["This ignores exact next-floor path danger if map data is missing."]
    elif hp_ratio >= 0.65 and smith_option:
        choice = smith_option
        action = f"Upgrade/smith ({choice.name or choice.option_id})."
        confidence = 0.64
        reasoning = "HP is comfortably above the first-pass safety threshold, so improving deck quality is preferred."
        risks = ["Upgrade target value is not optimized yet."]
    else:
        choice = rest_option or smith_option or legal_options[0]
        action = f"Choose {choice.name or choice.option_id}."
        confidence = 0.52
        reasoning = "HP is in the middle band, so the heuristic stays conservative and prefers visible safety."
        risks = ["Middle-band rest decisions need upcoming path and boss context for high confidence."]

    return AdvisorRecommendation(
        decision_type="rest_site",
        recommended_action=action,
        recommended_choice=choice.name or choice.option_id,
        confidence=confidence,
        risk_notes=risks,
        reasoning=reasoning,
        known_facts_used=known_facts,
        uncertain_assumptions=["No deterministic upgrade-value calculator is implemented yet."],
        action_kind="choose_rest_option",
        candidate_id=choice.option_id,
        candidates=_candidate_summaries(legal_options),
    )


def _advise_shop(state: RunState, metadata: MetadataProvider | None) -> AdvisorRecommendation:
    legal_options = [option for option in state.choices.options if option.legal]
    known_facts = _base_facts(state) + [f"gold={state.player.gold}"]
    assumptions = _metadata_assumptions(metadata)
    if not legal_options:
        return _unsupported(state, "Shop state did not expose purchasable options.", decision_type="shop")

    gold = state.player.gold or 0
    affordable = [option for option in legal_options if _price(option) is None or _price(option) <= gold]
    removal = _find_shop_option(affordable, "remove", "removal", "purge")
    if removal and _starter_count(state) > 0:
        choice = removal
        action = f"Buy card removal ({choice.name or choice.option_id})."
        confidence = 0.68
        reasoning = "Starter-card removal is a reliable early Regent deck-quality improvement when affordable."
        risks = ["Removal target selection is not optimized yet; default target should usually be a starter Strike before Defend."]
    else:
        choice = _best_shop_item(affordable, metadata) if affordable else None
        if choice is None:
            return AdvisorRecommendation(
                decision_type="shop",
                recommended_action="Do not buy anything yet.",
                confidence=0.55,
                risk_notes=["No affordable legal shop option was visible in normalized state."],
                reasoning="The advisor only recommends shop purchases when price and legality are explicit facts.",
                known_facts_used=known_facts,
                uncertain_assumptions=assumptions,
                action_kind="proceed",
                candidates=_candidate_summaries(legal_options),
            )
        action = f"Buy {choice.name or choice.option_id}."
        confidence = 0.54
        reasoning = "The first-pass shop heuristic prefers affordable relics, then impactful cards, then potions when explicit shop data is present."
        risks = ["Shop valuation is shallow until relic/card metadata and deck-specific calculators are richer."]

    return AdvisorRecommendation(
        decision_type="shop",
        recommended_action=action,
        recommended_choice=choice.name or choice.option_id,
        confidence=confidence,
        risk_notes=risks,
        reasoning=reasoning,
        known_facts_used=known_facts,
        uncertain_assumptions=assumptions,
        action_kind="shop_purchase",
        candidate_id=choice.option_id,
        candidates=_candidate_summaries(legal_options),
    )


def _advise_map(state: RunState) -> AdvisorRecommendation:
    legal_options = [option for option in state.choices.options if option.legal]
    known_facts = _base_facts(state) + [f"hp_ratio={_hp_ratio_text(state)}"]
    if not legal_options:
        return _unsupported(state, "Map state did not expose legal next nodes.", decision_type="map")

    scored = []
    hp_ratio = _hp_ratio(state)
    for option in legal_options:
        node_type = _node_type(option)
        score = 0.0
        notes = []
        if node_type in {"rest", "rest_site"}:
            score += 2.0 if hp_ratio < 0.65 else 0.5
        elif node_type in {"elite"}:
            if hp_ratio < 0.6:
                score -= 2.0
                notes.append("Elite node is risky at current HP.")
            else:
                score += 1.0
        elif node_type in {"shop"}:
            score += 1.0 if (state.player.gold or 0) >= 75 else 0.2
        elif node_type in {"event", "unknown", "?"}:
            score += 0.2
            notes.append("Unknown/event value is uncertain without event option facts.")
        elif node_type in {"monster"}:
            score += 0.4
        score += _future_rest_bonus(option)
        score -= _future_elite_penalty(option, hp_ratio)
        scored.append(
            {
                "candidate_id": option.option_id,
                "kind": option.kind,
                "id": option.id,
                "label": option.name,
                "legal": option.legal,
                "score_total": round(score, 3),
                "risk_notes": notes,
            }
        )

    scored.sort(key=lambda item: (-item["score_total"], str(item["candidate_id"])))
    best_id = str(scored[0]["candidate_id"])
    choice = next(option for option in legal_options if option.option_id == best_id)
    return AdvisorRecommendation(
        decision_type="map",
        recommended_action=f"Take {choice.name or choice.option_id}.",
        recommended_choice=choice.name or choice.option_id,
        confidence=0.5 if len(legal_options) > 1 else 0.6,
        risk_notes=list(scored[0]["risk_notes"]) + ["Path scoring is conservative and only uses visible next-node facts."],
        reasoning="The map heuristic balances current HP against visible elite, rest, shop, monster, and unknown nodes.",
        known_facts_used=known_facts,
        uncertain_assumptions=["Future path risk is incomplete unless STS2MCP exposes downstream node counts."],
        action_kind="choose_map_node",
        candidate_id=choice.option_id,
        candidates=scored,
    )


def _advise_event(state: RunState) -> AdvisorRecommendation:
    legal_options = [option for option in state.choices.options if option.legal]
    known_facts = _base_facts(state)
    if not legal_options:
        return AdvisorRecommendation(
            decision_type="event",
            recommended_action="Read the event text manually; no legal event options were exposed.",
            confidence=0.2,
            risk_notes=["Event advice is limited without option labels and outcomes."],
            reasoning="The advisor cannot rank an event without explicit options.",
            known_facts_used=known_facts,
            uncertain_assumptions=["Event outcome data is not resolved from Spire Codex yet."],
            action_kind="observe_only",
        )

    choice = _least_risky_event_option(legal_options)
    return AdvisorRecommendation(
        decision_type="event",
        recommended_action=f"Prefer {choice.name or choice.option_id}, unless the visible event text says otherwise.",
        recommended_choice=choice.name or choice.option_id,
        confidence=0.36,
        risk_notes=["Event outcome advice is limited unless STS2MCP exposes option outcomes or static event data is resolved."],
        reasoning="The event heuristic avoids visibly locked, lethal, curse, or HP-loss options when labels are available.",
        known_facts_used=known_facts + [f"event_options={len(legal_options)}"],
        uncertain_assumptions=["Option labels may omit hidden costs or rewards."],
        action_kind="choose_event_option",
        candidate_id=choice.option_id,
        candidates=_candidate_summaries(legal_options),
    )


def _advise_combat_observation(state: RunState) -> AdvisorRecommendation:
    enemies = state.combat.get("enemies") if isinstance(state.combat.get("enemies"), list) else []
    hand = state.combat.get("hand") if isinstance(state.combat.get("hand"), list) else []
    known_facts = _base_facts(state) + [f"enemies_visible={len(enemies)}", f"hand_cards_visible={len(hand)}"]
    risk_notes = ["Combat execution is disabled in v0.1."]
    if not enemies or not hand:
        risk_notes.append("Combat state is incomplete; no reliable combat action advice is possible.")
    else:
        risk_notes.append("Use the visible intents and hand manually; this advisor is observation-only for combat.")
    return AdvisorRecommendation(
        decision_type="combat",
        recommended_action="Observe only: do not auto-play combat from v0.1.",
        confidence=0.25 if enemies and hand else 0.1,
        risk_notes=risk_notes,
        reasoning="The live adapter detected combat, but this version has no validated combat solver or legal action executor.",
        known_facts_used=known_facts,
        uncertain_assumptions=["Enemy intents, dynamic card values, and lethal calculations are not fully normalized yet."],
        action_kind="observe_only",
    )


def _unsupported(state: RunState, message: str, *, decision_type: str = "unsupported") -> AdvisorRecommendation:
    return AdvisorRecommendation(
        decision_type=decision_type,
        recommended_action=message,
        confidence=0.0,
        risk_notes=["No read-only policy supports this screen yet."],
        reasoning="The decision router fell back to an unsupported-screen explanation.",
        known_facts_used=_base_facts(state),
        uncertain_assumptions=[],
        action_kind="observe_only",
    )


def _base_facts(state: RunState) -> list[str]:
    return [
        f"screen={state.session.screen}",
        f"character={state.run.character}",
        f"ascension={state.run.ascension}",
        f"act={state.run.act}",
        f"floor={state.run.floor}",
        f"current_hp={state.player.current_hp}",
        f"max_hp={state.player.max_hp}",
    ]


def _metadata_assumptions(metadata: MetadataProvider | None) -> list[str]:
    assumptions = []
    if not _has_metadata(metadata):
        assumptions.append("Spire Codex metadata cache is unavailable or empty; advice uses live state only.")
    if metadata and getattr(metadata, "warnings", None):
        assumptions.extend(metadata.warnings[:3])
    return assumptions


def _has_metadata(metadata: MetadataProvider | None) -> bool:
    return bool(metadata and (getattr(metadata, "cards", None) or getattr(metadata, "relics", None) or getattr(metadata, "potions", None)))


def _deck_metrics(state: RunState) -> JsonDict:
    attacks = 0
    skills = 0
    powers = 0
    for card in state.player.deck:
        card_type = str(card.type or "").lower()
        if card_type == "attack":
            attacks += 1
        elif card_type == "skill":
            skills += 1
        elif card_type == "power":
            powers += 1
    return {"attacks": attacks, "skills": skills, "powers": powers, "deck_size": len(state.player.deck)}


def _merged_card_facts(option: ChoiceOption, metadata: JsonDict | None) -> JsonDict:
    merged = dict(metadata or {})
    merged.update({key: value for key, value in option.facts.items() if value is not None})
    for key in ("type", "rarity", "cost", "description"):
        if key not in merged and key in option.facts:
            merged[key] = option.facts[key]
    return merged


def _is_early_act1(state: RunState) -> bool:
    return (state.run.act or 1) == 1 and (state.run.floor or 0) <= 8


def _hp_ratio(state: RunState) -> float:
    if not state.player.current_hp or not state.player.max_hp:
        return 0.5
    return max(0.0, min(1.0, state.player.current_hp / state.player.max_hp))


def _hp_ratio_text(state: RunState) -> str:
    if not state.player.current_hp or not state.player.max_hp:
        return "unknown"
    return f"{_hp_ratio(state):.2f}"


def _bounded(value: float) -> float:
    return max(0.0, min(1.0, round(value, 3)))


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _find_option(options: list[ChoiceOption], *needles: str) -> ChoiceOption | None:
    for option in options:
        text = " ".join(str(value) for value in [option.id, option.name, option.kind, option.facts] if value).lower()
        if any(needle in text for needle in needles):
            return option
    return None


def _find_shop_option(options: list[ChoiceOption], *needles: str) -> ChoiceOption | None:
    return _find_option(options, *needles)


def _price(option: ChoiceOption) -> int | None:
    return _as_int(option.facts.get("price") or option.facts.get("cost_gold") or option.facts.get("gold_cost"))


def _starter_count(state: RunState) -> int:
    count = 0
    for card in state.player.deck:
        text = f"{card.id} {card.name} {card.rarity}".lower()
        if "strike" in text or "defend" in text or "starter" in text:
            count += 1
    return count


def _best_shop_item(options: list[ChoiceOption], metadata: MetadataProvider | None) -> ChoiceOption | None:
    if not options:
        return None

    def score(option: ChoiceOption) -> tuple[float, str]:
        text = " ".join(str(value) for value in [option.kind, option.id, option.name, option.facts] if value).lower()
        value = 0.0
        if "relic" in text:
            value += 3.0
        if "card" in text:
            value += 2.0
        if "regent" in text:
            value += 1.0
        if "potion" in text:
            value += 0.5
        price = _price(option)
        if price is not None:
            value -= min(price / 300.0, 1.2)
        if metadata and (metadata.card(option.id) or metadata.relic(option.id) or metadata.potion(option.id)):
            value += 0.4
        return value, option.option_id

    return max(options, key=score)


def _node_type(option: ChoiceOption) -> str:
    return str(option.facts.get("type") or option.facts.get("node_type") or option.name or option.id or "").lower()


def _future_rest_bonus(option: ChoiceOption) -> float:
    rests = _as_int(option.facts.get("future_rest_sites") or option.facts.get("rest_sites_ahead"))
    return 0.3 if rests and rests > 0 else 0.0


def _future_elite_penalty(option: ChoiceOption, hp_ratio: float) -> float:
    elites = _as_int(option.facts.get("future_elites") or option.facts.get("elites_ahead"))
    if not elites:
        return 0.0
    return min(float(elites), 2.0) * (0.5 if hp_ratio < 0.7 else 0.1)


def _least_risky_event_option(options: list[ChoiceOption]) -> ChoiceOption:
    risky_terms = ("lose hp", "damage", "curse", "fight", "combat", "sacrifice", "random")

    def score(option: ChoiceOption) -> tuple[int, str]:
        text = " ".join(str(value) for value in [option.name, option.id, option.facts] if value).lower()
        risk_count = sum(1 for term in risky_terms if term in text)
        return -risk_count, option.option_id

    return max(options, key=score)


def _candidate_summaries(options: list[ChoiceOption]) -> list[JsonDict]:
    return [
        {
            "candidate_id": option.option_id,
            "kind": option.kind,
            "id": option.id,
            "label": option.name,
            "legal": option.legal,
            "facts": option.facts,
            "estimates": option.estimates,
        }
        for option in options
    ]
