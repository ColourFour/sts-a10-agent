from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


DEFAULT_SPIRE_CODEX_API = "https://spire-codex.com/api"
DEFAULT_CACHE_DIR = Path("data/cache/spire-codex")


JsonDict = dict[str, Any]


@dataclass
class SpireCodexMetadataProvider:
    """Small cached static-data provider for Spire Codex facts.

    Cache files are local runtime artifacts. They are intentionally ignored by
    git and are safe to delete.
    """

    cache_dir: Path = DEFAULT_CACHE_DIR
    api_base_url: str = DEFAULT_SPIRE_CODEX_API
    lang: str = "eng"
    timeout: float = 8.0
    cards: dict[str, JsonDict] = field(default_factory=dict)
    relics: dict[str, JsonDict] = field(default_factory=dict)
    potions: dict[str, JsonDict] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def load(self, *, refresh: bool = False) -> None:
        if refresh:
            self.refresh()

        self.cards = self._load_index("cards.json")
        self.relics = self._load_index("relics.json")
        self.potions = self._load_index("potions.json")

    def refresh(self) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        manifest: JsonDict = {
            "source_name": "spire-codex",
            "source_url": self.api_base_url.rstrip("/"),
            "api_terms_url": "https://spire-codex.com/api",
            "license_note": "Runtime cache only; do not commit hosted API data without license review.",
            "downloaded_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "files": {},
        }
        for filename, endpoint in {
            "cards.json": f"/cards?lang={self.lang}",
            "relics.json": f"/relics?lang={self.lang}",
            "potions.json": f"/potions?lang={self.lang}",
        }.items():
            try:
                payload = self._fetch(endpoint)
            except (OSError, ValueError) as exc:
                self.warnings.append(f"Could not refresh Spire Codex {filename}: {exc}")
                continue

            text = json.dumps(payload, sort_keys=True, ensure_ascii=False, indent=2) + "\n"
            path = self.cache_dir / filename
            path.write_text(text, encoding="utf-8")
            manifest["files"][filename] = {"sha256": hashlib.sha256(text.encode("utf-8")).hexdigest()}

        if manifest["files"]:
            (self.cache_dir / "manifest.json").write_text(
                json.dumps(manifest, sort_keys=True, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

    def card(self, card_id: str | None) -> JsonDict | None:
        return self._lookup(self.cards, card_id)

    def relic(self, relic_id: str | None) -> JsonDict | None:
        return self._lookup(self.relics, relic_id)

    def potion(self, potion_id: str | None) -> JsonDict | None:
        return self._lookup(self.potions, potion_id)

    def status(self) -> JsonDict:
        return {
            "cache_dir": str(self.cache_dir),
            "cards": len(self.cards),
            "relics": len(self.relics),
            "potions": len(self.potions),
            "warnings": list(self.warnings),
        }

    def _fetch(self, endpoint: str) -> Any:
        url = self.api_base_url.rstrip("/") + endpoint
        request = Request(url, method="GET", headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read()
        except (URLError, TimeoutError, OSError) as exc:
            raise OSError(f"{url}: {exc}") from exc
        return json.loads(body.decode("utf-8"))

    def _load_index(self, filename: str) -> dict[str, JsonDict]:
        path = self.cache_dir / filename
        if not path.exists():
            self.warnings.append(f"No cached Spire Codex file at {path}")
            return {}

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            self.warnings.append(f"Could not load cached Spire Codex file {path}: {exc}")
            return {}

        return _index_entities(payload)

    @staticmethod
    def _lookup(index: dict[str, JsonDict], entity_id: str | None) -> JsonDict | None:
        if not entity_id:
            return None
        return index.get(entity_id) or index.get(entity_id.lower()) or index.get(entity_id.upper())


def _index_entities(payload: Any) -> dict[str, JsonDict]:
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            entities = payload["data"]
        elif isinstance(payload.get("items"), list):
            entities = payload["items"]
        else:
            entities = list(payload.values())
    elif isinstance(payload, list):
        entities = payload
    else:
        return {}

    index: dict[str, JsonDict] = {}
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        entity_id = entity.get("id") or entity.get("key")
        if not entity_id:
            continue
        text_id = str(entity_id)
        index[text_id] = entity
        index[text_id.lower()] = entity
        index[text_id.upper()] = entity
    return index
