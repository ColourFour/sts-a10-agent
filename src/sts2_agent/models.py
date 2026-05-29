from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from typing import Any


SCHEMA_VERSION = "0.1"


JsonDict = dict[str, Any]


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _dict_list(value: Any, field_name: str) -> list[JsonDict]:
    _require(isinstance(value, list), f"{field_name} must be a list")
    for item in value:
        _require(isinstance(item, dict), f"{field_name} entries must be objects")
    return value


def to_jsonable(value: Any) -> Any:
    if is_dataclass(value):
        return {k: to_jsonable(v) for k, v in asdict(value).items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    return value


@dataclass(frozen=True)
class SourceInfo:
    kind: str
    raw_sha256: str
    observed_at: str = "1970-01-01T00:00:00Z"
    source_version: str | None = None
    path: str | None = None
    url: str | None = None

    def __post_init__(self) -> None:
        _require(bool(self.kind), "source.kind is required")
        _require(bool(self.raw_sha256), "source.raw_sha256 is required")


@dataclass(frozen=True)
class SessionInfo:
    screen: str
    is_actionable: bool
    available_actions: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _require(bool(self.screen), "session.screen is required")


@dataclass(frozen=True)
class RunInfo:
    character: str | None
    ascension: int | None
    act: int | None
    floor: int | None
    run_id: str | None = None
    seed: str | None = None


@dataclass(frozen=True)
class CardInstance:
    id: str
    name: str | None = None
    upgraded: bool | None = None
    type: str | None = None
    rarity: str | None = None
    cost: int | str | None = None
    facts: JsonDict = field(default_factory=dict)
    estimates: JsonDict = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require(bool(self.id), "card.id is required")


@dataclass(frozen=True)
class RelicState:
    id: str
    name: str | None = None
    facts: JsonDict = field(default_factory=dict)
    estimates: JsonDict = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require(bool(self.id), "relic.id is required")


@dataclass(frozen=True)
class PotionState:
    slot: int
    id: str | None = None
    name: str | None = None
    can_use: bool | None = None
    requires_target: bool | None = None
    facts: JsonDict = field(default_factory=dict)
    estimates: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class PlayerState:
    current_hp: int | None
    max_hp: int | None
    gold: int | None
    deck: list[CardInstance] = field(default_factory=list)
    relics: list[RelicState] = field(default_factory=list)
    potions: list[PotionState] = field(default_factory=list)
    block: int | None = None
    energy: int | None = None
    stars: int | None = None


@dataclass(frozen=True)
class ChoiceOption:
    option_id: str
    index: int
    kind: str
    id: str | None
    name: str | None
    legal: bool = True
    facts: JsonDict = field(default_factory=dict)
    estimates: JsonDict = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require(bool(self.option_id), "choice.option_id is required")
        _require(bool(self.kind), "choice.kind is required")


@dataclass(frozen=True)
class ChoicesState:
    kind: str | None = None
    options: list[ChoiceOption] = field(default_factory=list)
    can_skip: bool | None = None


@dataclass(frozen=True)
class RunState:
    source: SourceInfo
    session: SessionInfo
    run: RunInfo
    player: PlayerState
    combat: JsonDict = field(default_factory=dict)
    choices: ChoicesState = field(default_factory=ChoicesState)
    facts: JsonDict = field(default_factory=dict)
    estimates: JsonDict = field(default_factory=dict)
    schema_version: str = SCHEMA_VERSION

    def to_dict(self) -> JsonDict:
        return to_jsonable(self)


def validate_run_state(data: JsonDict) -> None:
    _require(data.get("schema_version") == SCHEMA_VERSION, "unsupported run state schema_version")
    _require(isinstance(data.get("source"), dict), "source must be an object")
    _require(bool(data["source"].get("kind")), "source.kind is required")
    _require(bool(data["source"].get("raw_sha256")), "source.raw_sha256 is required")
    _require(isinstance(data.get("session"), dict), "session must be an object")
    _require(bool(data["session"].get("screen")), "session.screen is required")
    _require(isinstance(data.get("run"), dict), "run must be an object")
    _require(isinstance(data.get("player"), dict), "player must be an object")
    _dict_list(data["player"].get("deck", []), "player.deck")
    _dict_list(data["player"].get("relics", []), "player.relics")
    _dict_list(data["player"].get("potions", []), "player.potions")
    _require(isinstance(data.get("choices"), dict), "choices must be an object")
    _dict_list(data["choices"].get("options", []), "choices.options")
    _require(isinstance(data.get("facts"), dict), "facts must be an object")
    _require(isinstance(data.get("estimates"), dict), "estimates must be an object")


@dataclass(frozen=True)
class DecisionCandidate:
    candidate_id: str
    kind: str
    id: str | None
    label: str | None
    legal: bool
    facts: JsonDict = field(default_factory=dict)
    estimates: JsonDict = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require(bool(self.candidate_id), "candidate.candidate_id is required")
        _require(bool(self.kind), "candidate.kind is required")


@dataclass(frozen=True)
class Recommendation:
    action_kind: str
    candidate_id: str | None = None
    confidence: float = 0.0
    summary: str = ""
    fact_reasons: list[str] = field(default_factory=list)
    estimate_reasons: list[str] = field(default_factory=list)
    decision_type: str | None = None
    recommended_action: str | None = None
    recommended_choice: str | None = None
    risk_notes: list[str] = field(default_factory=list)
    reasoning: str | None = None
    known_facts_used: list[str] = field(default_factory=list)
    uncertain_assumptions: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _require(bool(self.action_kind), "recommendation.action_kind is required")


@dataclass(frozen=True)
class PolicyInfo:
    name: str
    version: str
    weights_sha256: str | None = None

    def __post_init__(self) -> None:
        _require(bool(self.name), "policy.name is required")
        _require(bool(self.version), "policy.version is required")


@dataclass(frozen=True)
class ExecutorInfo:
    mode: str = "disabled"
    would_call: JsonDict | None = None

    def __post_init__(self) -> None:
        _require(self.mode == "disabled", "executor.mode must be disabled in v0.1")


@dataclass(frozen=True)
class DecisionRecord:
    timestamp: str
    decision_id: str
    run_ref: JsonDict
    state_ref: JsonDict
    context: JsonDict
    candidates: list[DecisionCandidate]
    recommendation: Recommendation
    policy: PolicyInfo
    executor: ExecutorInfo = field(default_factory=ExecutorInfo)
    schema_version: str = SCHEMA_VERSION
    record_type: str = "recommendation"

    def __post_init__(self) -> None:
        _require(bool(self.timestamp), "timestamp is required")
        _require(bool(self.decision_id), "decision_id is required")

    def to_dict(self) -> JsonDict:
        return to_jsonable(self)


def validate_decision_record(data: JsonDict) -> None:
    _require(data.get("schema_version") == SCHEMA_VERSION, "unsupported decision schema_version")
    _require(data.get("record_type") == "recommendation", "record_type must be recommendation")
    _require(bool(data.get("decision_id")), "decision_id is required")
    _require(bool(data.get("timestamp")), "timestamp is required")
    _require(isinstance(data.get("run_ref"), dict), "run_ref must be an object")
    _require(isinstance(data.get("state_ref"), dict), "state_ref must be an object")
    _require(isinstance(data.get("context"), dict), "context must be an object")
    _dict_list(data.get("candidates", []), "candidates")
    _require(isinstance(data.get("recommendation"), dict), "recommendation must be an object")
    _require(bool(data["recommendation"].get("action_kind")), "recommendation.action_kind is required")
    _require(isinstance(data.get("policy"), dict), "policy must be an object")
    _require(isinstance(data.get("executor"), dict), "executor must be an object")
    _require(data["executor"].get("mode") == "disabled", "executor.mode must be disabled in v0.1")
