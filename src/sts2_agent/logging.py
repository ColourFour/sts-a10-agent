from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .models import (
    DecisionCandidate,
    DecisionRecord,
    ExecutorInfo,
    PolicyInfo,
    Recommendation,
    RunState,
    validate_decision_record,
)
from .advice import AdvisorRecommendation


def build_foundation_decision_record(
    state: RunState,
    *,
    decision_id: str | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Build a valid read-only recommendation record without policy scoring.

    This is intentionally not a Regent policy. It exists so the v0.1 foundation
    can prove logging shape and validation before policy modules are added.
    """
    state_dict = state.to_dict()
    choices = state_dict["choices"]
    candidates: list[DecisionCandidate] = []
    for option in choices.get("options", []):
        candidates.append(
            DecisionCandidate(
                candidate_id=option["option_id"],
                kind=option["kind"],
                id=option.get("id"),
                label=option.get("name"),
                legal=option.get("legal", True),
                facts=option.get("facts", {}),
                estimates={
                    "score_total": 0.0,
                    "score_components": {},
                    "risk_notes": [],
                },
            )
        )

    selected = candidates[0].candidate_id if candidates else None
    record = DecisionRecord(
        timestamp=timestamp or datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        decision_id=decision_id or str(uuid.uuid4()),
        run_ref=state_dict["run"],
        state_ref={
            "source_kind": state_dict["source"]["kind"],
            "raw_sha256": state_dict["source"]["raw_sha256"],
            "normalized_sha256": None,
        },
        context={
            "choice_kind": choices.get("kind"),
            "screen": state_dict["session"]["screen"],
        },
        candidates=candidates,
        recommendation=Recommendation(
            candidate_id=selected,
            action_kind="observe_only",
            confidence=0.0,
            summary="No policy implemented in the v0.1 foundation.",
            fact_reasons=["State was normalized successfully."],
            estimate_reasons=[],
            decision_type=choices.get("kind") or state_dict["session"]["screen"],
            recommended_action="Observe only; no policy recommendation was produced.",
            recommended_choice=None,
            risk_notes=["Foundation logging is schema-only and does not rank choices."],
            reasoning="No policy implemented in the v0.1 foundation.",
            known_facts_used=["State was normalized successfully."],
            uncertain_assumptions=["No decision heuristic was run."],
        ),
        policy=PolicyInfo(name="foundation_no_policy", version="0.1.0"),
        executor=ExecutorInfo(),
    ).to_dict()
    validate_decision_record(record)
    return record


def build_recommendation_decision_record(
    state: RunState,
    recommendation: AdvisorRecommendation,
    *,
    decision_id: str | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    state_dict = state.to_dict()
    candidates = _candidate_records(state, recommendation)
    normalized_payload = json.dumps(state_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    record = DecisionRecord(
        timestamp=timestamp or datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        decision_id=decision_id or str(uuid.uuid4()),
        run_ref=state_dict["run"],
        state_ref={
            "source_kind": state_dict["source"]["kind"],
            "raw_sha256": state_dict["source"]["raw_sha256"],
            "normalized_sha256": _sha256(normalized_payload),
        },
        context={
            "choice_kind": state_dict["choices"].get("kind"),
            "screen": state_dict["session"]["screen"],
            "advisor_recommendation": recommendation.to_dict(),
        },
        candidates=candidates,
        recommendation=Recommendation(
            candidate_id=recommendation.candidate_id,
            action_kind=recommendation.action_kind,
            confidence=recommendation.confidence,
            summary=recommendation.reasoning,
            fact_reasons=recommendation.known_facts_used,
            estimate_reasons=recommendation.uncertain_assumptions,
            decision_type=recommendation.decision_type,
            recommended_action=recommendation.recommended_action,
            recommended_choice=recommendation.recommended_choice,
            risk_notes=recommendation.risk_notes,
            reasoning=recommendation.reasoning,
            known_facts_used=recommendation.known_facts_used,
            uncertain_assumptions=recommendation.uncertain_assumptions,
        ),
        policy=PolicyInfo(name="read_only_regent_heuristics", version="0.1.0"),
        executor=ExecutorInfo(),
    ).to_dict()
    validate_decision_record(record)
    return record


def write_jsonl_record(path: str | Path, record: dict[str, Any], *, append: bool = True) -> None:
    validate_decision_record(record)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if append else "w"
    with Path(path).open(mode, encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True, ensure_ascii=False))
        handle.write("\n")


def validate_jsonl_log(path: str | Path) -> int:
    count = 0
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                record = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(record, dict):
                raise ValueError(f"{path}:{line_number}: record must be a JSON object")
            try:
                validate_decision_record(record)
            except ValueError as exc:
                raise ValueError(f"{path}:{line_number}: {exc}") from exc
            count += 1
    return count


def _candidate_records(state: RunState, recommendation: AdvisorRecommendation) -> list[DecisionCandidate]:
    by_id = {str(item.get("candidate_id")): item for item in recommendation.candidates}
    records: list[DecisionCandidate] = []
    for option in state.choices.options:
        scored = by_id.get(option.option_id, {})
        estimates = dict(option.estimates)
        if scored:
            estimates.update(
                {
                    "score_total": scored.get("score_total"),
                    "score_components": scored.get("score_components", {}),
                    "risk_notes": scored.get("risk_notes", []),
                }
            )
        records.append(
            DecisionCandidate(
                candidate_id=option.option_id,
                kind=option.kind,
                id=option.id,
                label=option.name,
                legal=option.legal,
                facts=option.facts,
                estimates=estimates,
            )
        )
    if not records and recommendation.candidate_id:
        records.append(
            DecisionCandidate(
                candidate_id=recommendation.candidate_id,
                kind=recommendation.decision_type,
                id=None,
                label=recommendation.recommended_choice,
                legal=True,
                facts={},
                estimates={"risk_notes": recommendation.risk_notes},
            )
        )
    return records


def _sha256(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()
