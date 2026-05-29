# STS2 Tooling Research and v0.1 Integration Decision

Date: 2026-05-29

Scope: research only for a new `sts2-a10-agent` repo. No repo skeleton or source code is proposed for creation in this task.

## Executive Decision

Build a new Python CLI-first repo. Do not fork any inspected project as the base.

Use external tooling as inputs, not as the project foundation:

| Repo | Inspected ref | License | Recommendation |
| --- | --- | --- | --- |
| [Gennadiyev/STS2MCP](https://github.com/Gennadiyev/STS2MCP) | [`2fb53908301a108dac9bf665e88be7a5db12ee4c`](https://github.com/Gennadiyev/STS2MCP/commit/2fb53908301a108dac9bf665e88be7a5db12ee4c), default branch `main` | MIT | Integrate read-only via its localhost HTTP API. Do not fork or vendor. |
| [ptrlrd/spire-codex](https://github.com/ptrlrd/spire-codex) | [`55160c2b72c70547b53553990e4540769423fe93`](https://github.com/ptrlrd/spire-codex/commit/55160c2b72c70547b53553990e4540769423fe93), default branch `staging` | PolyForm Noncommercial 1.0.0 for source; hosted API terms separately | Integrate as an explicit data-sync/API source with cache and attribution. Do not vendor dumps without license review. |
| [thequantumfalcon/spirescope](https://github.com/thequantumfalcon/spirescope) | [`1185bd9d12c5187393d7b5ce362e0e92277f9356`](https://github.com/thequantumfalcon/spirescope/commit/1185bd9d12c5187393d7b5ce362e0e92277f9356), default branch `master` | MIT for code; bundled wiki-derived data under CC BY-SA 4.0 | Reference for save/log parsing ideas and local-first UX. Do not fork or vendor data. Optional API adapter later. |
| [CharTyr/STS2-Agent](https://github.com/CharTyr/STS2-Agent) | [`2617fb19736bdb809aef7a530b4e9e2797fefac7`](https://github.com/CharTyr/STS2-Agent/commit/2617fb19736bdb809aef7a530b4e9e2797fefac7), default branch `main` | AGPL-3.0-only | Reference protocol ideas only. Do not fork, vendor, or copy code. No v0.1 integration. |

The safest v0.1 is a deterministic advisor that accepts raw state from files, stdin, or a read-only HTTP snapshot, normalizes it into one `RunState`, resolves known IDs against an explicit data cache, emits card reward and between-room recommendations, and writes JSONL records. Combat should be observation-only unless a source exposes enough clean state for deterministic notes; action execution stays stubbed and disabled.

## Inspection Method

Validation used GitHub API metadata, raw file reads, and a zip snapshot where practical. The inspected files included README/setup/API docs, license files, API wrappers, state builders/parsers, data loaders, and key route/service files. Temporary inspection artifacts were kept under `/tmp/sts2-tooling-research` and are not part of this repo.

No code from the inspected repos was copied into this repository.

## Repo Findings

## 1. Gennadiyev/STS2MCP

Repository: [Gennadiyev/STS2MCP](https://github.com/Gennadiyev/STS2MCP)

Inspected commit: [`2fb53908301a108dac9bf665e88be7a5db12ee4c`](https://github.com/Gennadiyev/STS2MCP/commit/2fb53908301a108dac9bf665e88be7a5db12ee4c)

Inspected files: `README.md`, `mcp/README.md`, `mcp/server.py`, `docs/raw-simplified.md`, `McpMod.StateBuilder.cs`, `McpMod.Actions.cs`, `McpMod.Compendium.cs`, `LICENSE`.

### What it provides

STS2MCP is a Slay the Spire 2 C# mod plus optional Python MCP bridge. The mod exposes a localhost REST API on `localhost:15526`; the MCP bridge wraps it as tools for AI clients.

It is broad enough to drive a full run: menu navigation, profile switching, combat card play, potions, rewards, card reward choices, map nodes, rest sites, shops, events, treasure, relic choices, card selection overlays, Crystal Sphere, game over handling, and multiplayer variants.

For our v0.1, the valuable part is not the action layer. The valuable part is the live state snapshot and profile/compendium endpoints.

### Interfaces/endpoints/data formats that matter

Useful read endpoints:

| Endpoint | Use for us |
| --- | --- |
| `GET /api/v1/singleplayer?format=json` | Primary live singleplayer state input. |
| `GET /api/v1/profile` | Optional profile facts: discoveries, character stats, aggregate stats. |
| `GET /api/v1/compendium` | Optional profile-shaped progress summary and recent run history. |
| `GET /api/v1/wiki?query=...&item_type=...&limit=...` | Selective discovered card/relic lookup. |
| `GET /api/v1/profiles` | Profile slot metadata, not needed for v0.1 advisor decisions. |

Important state fields observed in docs/source:

- Top-level `state_type`.
- `run`: `act`, `floor`, `ascension`.
- `player`: character, HP, max HP, gold, relics, potions, max potion slots, plus combat-only energy, hand, piles, orbs, pets.
- Combat states: `monster`, `elite`, `boss`, `hand_select`; hand cards include `index`, description, target type, `can_play`, and `unplayable_reason`; enemies include `entity_id`, HP/block/status/intents.
- Choice states: `card_reward.cards`, `map.next_options`, `rest_site.options`, `shop.items`, `event.options`, `treasure.relics`, `relic_select.relics`, `card_select.cards`.
- Action indices are source-local and must be treated as ephemeral. Re-read state after every game transition.

Action endpoints exist through `POST /api/v1/singleplayer` and `POST /api/v1/multiplayer`, but v0.1 should not call them. If an action interface is added later, keep it behind a disabled executor.

### macOS and Windows support

Good for both. The README says release DLLs are platform-agnostic .NET assemblies and includes macOS app-bundle mod install instructions. Build requirements are .NET 9 SDK and the base game. Windows has `build.ps1`; macOS has direct `dotnet build` instructions and app-bundle data directory handling.

This is the strongest macOS-first live-state candidate.

### License constraints

MIT. Forking or vendoring would be permitted by license, but we should not vendor because the project is a large action-capable mod and not our desired base. Integrating via HTTP avoids coupling our repo to its implementation.

### Recommendation

Integrate read-only through `GET /api/v1/singleplayer?format=json` as the first live adapter. Do not fork. Do not vendor.

Use only:

- HTTP state snapshot.
- Optional profile/compendium lookup.
- Optional wiki lookup for discovered items.

Do not call action POST endpoints in v0.1.

### Risks and moving-target issues

- Tested upstream against a specific STS2 version noted in its README (`v0.103.2` at inspected ref). STS2 internals are moving.
- No authentication on localhost, and the mod is action-capable. Our integration must remain read-only by default.
- State shape is a community protocol, not a stable official API.
- Multiplayer is explicitly beta upstream; ignore for v0.1.
- Some durable catalog data is intentionally selective/profile-scoped, so it is not a full static-data substitute.

## 2. ptrlrd/spire-codex

Repository: [ptrlrd/spire-codex](https://github.com/ptrlrd/spire-codex)

Inspected commit: [`55160c2b72c70547b53553990e4540769423fe93`](https://github.com/ptrlrd/spire-codex/commit/55160c2b72c70547b53553990e4540769423fe93)

Inspected files: `README.md`, `LICENSE.md`, `API_TERMS.md`, `backend/app/main.py`, `backend/app/models/schemas.py`, `backend/app/routers/cards.py`, `backend/app/routers/runs.py`, `backend/app/routers/exports.py`, `backend/app/services/data_service.py`.

### What it provides

Spire Codex is a comprehensive STS2 data website and FastAPI API backed by reverse-engineered game data. It covers cards, relics, potions, monsters, encounters, events, powers, keywords, intents, orbs, afflictions, modifiers, achievements, epochs, acts, ascensions, merchant pricing, changelogs, run submissions, leaderboards, and exports.

For v0.1, this is the best static metadata source, especially for card/relic/potion/monster facts and richer card fields.

### Interfaces/endpoints/data formats that matter

Hosted API: [https://spire-codex.com/api/*](https://spire-codex.com/api/*)

Important endpoints:

| Endpoint | Use for us |
| --- | --- |
| `GET /api/cards?lang=eng` and `/api/cards/{id}` | Resolve card facts: cost, type, rarity, target, damage/block vars, upgrade data, keywords, tags, image URLs. |
| `GET /api/relics`, `/api/potions` | Resolve relic/potion facts. |
| `GET /api/monsters`, `/api/encounters`, `/api/events` | Resolve between-room and combat context where available. |
| `GET /api/ascensions` | Resolve A10 effects by level. |
| `GET /api/merchant/config` | Later shop pricing support. |
| `GET /api/exports/{lang}` | Bulk zip of entity JSON for one language. |
| `GET /api/versions` and changelog endpoints | Data version discovery and drift tracking. |

Useful data shape examples from inspected Pydantic schemas:

- `Card`: `id`, `name`, `description`, `cost`, `is_x_cost`, `star_cost`, `type`, `rarity`, `target`, `color`, `damage`, `block`, `hit_count`, `powers_applied`, `cards_draw`, `energy_gain`, `hp_loss`, `keywords`, `tags`, `vars`, `upgrade`, `type_variants`, `can_be_generated_in_combat`.
- `Relic`: `id`, `name`, `description`, `rarity`, `pool`, `merchant_price`, `name_variants`, `notes`.
- `Monster`: HP ranges, ascension HP ranges, moves, damage values, block values, encounters, innate powers, attack patterns.
- `Event`: pages/options/preconditions/outcomes where parser coverage exists.
- `Ascension`: `level`, `name`, `description`.

The hosted API terms allow community use under rate limits, encourage attribution, and explicitly warn there is no SLA and no guarantee response schemas will remain stable between game patches.

### macOS and Windows support

The hosted API is OS-independent. Local development is Python 3.10+ plus Node.js 20+. The extraction/update pipeline uses GDRE Tools, ILSpy, Python, and Node/Playwright; README lists Windows, macOS, and Linux Steam install paths and says the update script auto-detects OS/game paths.

For our v0.1, prefer the hosted API or user-supplied cached export over running this full stack locally.

### License constraints

Source license is PolyForm Noncommercial 1.0.0. Hosted API terms are separate and allow community use within rate limits. Game data belongs to Mega Crit and is served by Spire Codex as a community reference.

Do not vendor the repo or data dumps into `sts2-a10-agent` without a specific license review. A v0.1 data sync cache in the user's cache directory is safer than committing game-data JSON to our repo.

### Recommendation

Integrate as an explicit static-data provider, not as code. Recommended v0.1 behavior:

1. `data sync` downloads selected `eng` data or `/api/exports/eng` into a user cache.
2. Cache includes `source`, `commit_or_version`, `downloaded_at`, API terms URL, and content hashes.
3. The repo itself contains no large game-data dump.
4. Runtime advisor can operate offline from the cache after sync.

Do not fork. Do not vendor parser code or full data.

### Risks and moving-target issues

- Noncommercial source license and game-data ownership constraints.
- Hosted API has rate limits and no SLA.
- Response schemas can change between game patches.
- Parser outputs are reverse-engineered and may lag a new STS2 build.
- Some data is extracted with regex from decompiled code; useful but not official.
- Runtime-dynamic behavior still needs live state facts; static descriptions cannot be trusted for all arithmetic.

## 3. thequantumfalcon/spirescope

Repository: [thequantumfalcon/spirescope](https://github.com/thequantumfalcon/spirescope)

Inspected commit: [`1185bd9d12c5187393d7b5ce362e0e92277f9356`](https://github.com/thequantumfalcon/spirescope/commit/1185bd9d12c5187393d7b5ce362e0e92277f9356)

Inspected files: `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `pyproject.toml`, `docs/project-guidance.md`, `sts2/models.py`, `sts2/saves.py`, `sts2/logparser.py`, `sts2/watcher.py`, `sts2/routes.py`, `sts2/config.py`.

### What it provides

SpireScope is a local-first Python/FastAPI dashboard for STS2. It does not require a game mod. It reads local save files and `godot.log`, presents a web dashboard, tracks live runs via SSE, parses run history, and computes analytics from personal run history.

For our v0.1, its most useful contribution is not as a dependency. It demonstrates:

- Save file locations and shapes.
- Current run and run history parsing.
- Debounced save-file watching with polling fallback.
- How much can and cannot be inferred without a mod.

### Interfaces/endpoints/data formats that matter

Relevant local API if a user already runs SpireScope:

| Endpoint | Use for us |
| --- | --- |
| `GET /api/live?player=0` | Current run snapshot from save/log merge. |
| `GET /api/live/stream?player=0` | SSE stream of live run updates. |
| `GET /api/runs` | Parsed run history. |
| `GET /api/cards/{card_id}` | Card detail plus local stats/synergies. |
| `GET /api/search?q=` | Local fuzzy lookup. |
| `GET /api/export/stats` and `/api/export/runs` | Aggregate stats/run export. |

Its `CurrentRun` model includes `active`, `character`, HP, gold, act, floor, run time, deck IDs, upgrade flags, relics, potions, events seen, encounters won, floor history, and co-op player count. Its save parser reads `current_run.save`, `current_run_mp.save`, backups, `progress.save`, and `history/*.run`. Its log parser adds fresher but partial data such as card rewards, potions, gold, encounter starts, cards played, extra turns, and elites defeated.

### macOS and Windows support

Python package is OS-independent and requires Python 3.11+. README provides a Windows packaged download and source install for other OSes. Save paths are documented for Windows, macOS, Linux, and Steam Deck/Proton. The config code handles Windows/macOS/Linux save locations; game install auto-detection is stronger on Windows than macOS.

### License constraints

Code is MIT. Third-party notices state bundled wiki-derived JSON data in `sts2/data/` is republished under CC BY-SA 4.0. Game data/art belongs to Mega Crit.

Code could be reused under MIT, but the repo is a dashboard with broad surface area. We should not vendor its bundled data. If any save parsing approach is reimplemented, write it independently and test against our own fixtures.

### Recommendation

Reference only for save/log parser behavior, local-first design, and fixture ideas. Do not fork. Do not vendor. Do not make SpireScope a required v0.1 dependency.

An optional future adapter for `GET /api/live` is reasonable after the primary `state` file/stdin and STS2MCP adapters are stable.

### Risks and moving-target issues

- Save/log parsing is less complete than mod state and cannot expose clean legal actions.
- `godot.log` is partial and pattern-based.
- Bundled static data has CC BY-SA implications.
- Local dashboard API is not designed as a stable external advisor protocol.
- It has many analytics features that would distract v0.1 from deterministic recommendations.

## 4. CharTyr/STS2-Agent

Repository: [CharTyr/STS2-Agent](https://github.com/CharTyr/STS2-Agent)

Inspected commit: [`2617fb19736bdb809aef7a530b4e9e2797fefac7`](https://github.com/CharTyr/STS2-Agent/commit/2617fb19736bdb809aef7a530b4e9e2797fefac7)

Inspected files: `README.md`, `LICENSE`, `build-and-env.md`, `docs/api.md`, `docs/setup.md`, `mcp_server/README.md`, `mcp_server/src/sts2_mcp/server.py`, `mcp_server/src/sts2_mcp/client.py`, `STS2AIAgent/Game/GameStateService.cs`, `STS2AIAgent/Game/GameActionService.cs`, `STS2AIAgent/Server/Router.cs`, `mcp_server/pyproject.toml`, `mcp_server/data/README.md`.

### What it provides

STS2-Agent is a C# STS2 mod plus Python FastMCP server. It exposes a richer agent-facing state/action protocol than STS2MCP in several areas: `available_actions`, detailed combat hand/enemy payloads, dynamic card values, action stability status, SSE events, game-data lookup, and guided/layered/full MCP profiles.

It is clearly oriented toward autonomous play and layered planner/combat agents. README mentions AlphaZero training payload enrichment and controlled reward resolution.

### Interfaces/endpoints/data formats that matter

Important HTTP API:

| Endpoint | Use or observation |
| --- | --- |
| `GET /health` | Mod loaded/status. |
| `GET /state` | Full state snapshot, response wrapped as `{ ok, request_id, data }`. |
| `GET /actions/available` | Actions plus index/target requirements. |
| `POST /action` | Executes actions. Not appropriate for v0.1. |
| `GET /events/stream` | SSE stream for action windows and screen/action changes. |
| `GET /data/{collection}` | Game metadata collections used by MCP data tools. |

Relevant state fields:

- `state_version`, `run_id`, `screen`, `in_combat`, `turn`, `available_actions`.
- `combat.player`: HP, block, energy, stars, powers.
- `combat.hand`: index, `card_id`, name, upgraded, target type, requires target, X-cost flags, energy/star costs, raw/resolved rules text, dynamic values, `playable`, `unplayable_reason`.
- `combat.enemies`: index, `enemy_id`, HP/block, alive/hittable, powers, `move_id`, decomposed intents with damage/hits/total damage/status count.
- `run`: floor, HP, gold, max energy, deck, relics, potions, ascension effects.
- Choice payloads for map, reward, selection, chest, event, rest, shop, modal, game over.

MCP profiles:

- `guided`: `health_check`, `get_game_state`, `get_raw_game_state`, `get_available_actions`, compact `act`, game-data tools, waits.
- `layered`: adds planner/combat handoff and knowledge tools.
- `full`: adds legacy per-action tools.

### macOS and Windows support

The repo has Windows PowerShell scripts and macOS/Linux shell scripts for building the mod and starting stdio/network MCP. Build docs list .NET SDK, Python 3.11+, `uv`, and Godot 4.x. The install README is more Windows-oriented, but `build-and-env.md` explicitly covers macOS/Linux and has regression script entries for shell.

### License constraints

The repository is AGPL-3.0-only. This is the key constraint. Do not copy code, schemas expressed as code, data files, or MCP implementation into the new repo. Also note `mcp_server/data/README.md` says its game data comes from Spire Codex and retains only English data; that combines AGPL repo distribution with upstream data licensing concerns.

### Recommendation

Reference protocol ideas only. Do not fork. Do not vendor. Do not integrate in v0.1.

It is useful as evidence that a clean state/action protocol can exist, especially `available_actions`, dynamic card values, and facts needed for combat support. But AGPL plus action-heavy orientation makes it a poor foundation for a permissive, read-only v0.1 advisor.

### Risks and moving-target issues

- AGPL contamination risk if code is copied.
- Strong autonomous-action orientation conflicts with read-only v0.1.
- State/action behavior is tightly coupled to STS2 internals and game version.
- Docs include "implemented, pending real-game validation" style notes for some capabilities.
- It vendors or packages English data sourced from Spire Codex, so data licensing still needs review.

## Minimal v0.1 Architecture

### Proposed language/runtime

Use Python 3.12 with `uv`. Keep compatibility with Python 3.11 if low-cost because all inspected Python tooling is 3.11+.

Recommended dependencies:

- `pydantic` v2 for schemas and validation.
- `httpx` for optional read-only HTTP snapshot fetches.
- `typer` or `argparse` for CLI. Prefer `typer` only if the project is comfortable adding it; otherwise `argparse` is enough.
- `pytest` for fixture and policy tests.
- No LLM dependency.
- No game mod dependency in package install.

Why Python: the target work is JSON normalization, deterministic scoring, cached data resolution, CLI workflows, fixtures, and JSONL logs. Python also aligns with the MCP/data projects already inspected.

### Directory structure

This is the recommended first skeleton for a later implementation task:

```text
sts2-a10-agent/
  pyproject.toml
  README.md
  docs/
    research/
      STS2_TOOLING_RESEARCH_2026_05_29.md
    schemas/
      run_state.md
      decision_log.md
  src/
    sts2_a10/
      __init__.py
      cli.py
      adapters/
        __init__.py
        file_input.py
        stdin_input.py
        sts2mcp_http.py
      state/
        __init__.py
        raw_source.py
        run_state.py
        normalize.py
        hashes.py
      data/
        __init__.py
        provider.py
        cache.py
        spire_codex.py
        resolver.py
        provenance.py
      calc/
        __init__.py
        deck_metrics.py
        card_value.py
        path_value.py
        risk.py
      policy/
        __init__.py
        card_reward.py
        map_choice.py
        rest_choice.py
        shop_choice.py
        event_choice.py
        potion_choice.py
        combat_notes.py
      executor/
        __init__.py
        disabled.py
        preview.py
      log/
        __init__.py
        decision_jsonl.py
  tests/
    fixtures/
      raw/
        sts2mcp/
      normalized/
      data_minimal/
      expected_logs/
    test_normalize_*.py
    test_policy_*.py
    test_jsonl_schema.py
```

Only create this in the next implementation task, not as part of this research task.

### State input strategy

v0.1 should accept state from two concrete read-only paths, plus a documented adapter interface:

1. File or stdin: primary test path and safest runtime path.
2. STS2MCP HTTP: `GET http://localhost:15526/api/v1/singleplayer?format=json`.
3. A documented source-adapter interface for future inputs, but no `STS2-Agent` or `SpireScope` adapter implementation in v0.1.

Input commands should always snapshot raw input before normalization when logging is enabled. The advisor must never call an action endpoint by default.

Recommended source priority:

1. `--state path.json` or stdin for deterministic replay.
2. `--source sts2mcp --url http://localhost:15526` for live local runs.
3. Later: `--source spirescope --url http://127.0.0.1:8000` for local save/log state, with explicit caveat that legal actions and combat detail are incomplete.
4. Later, and only after a license/process decision: a read-only `STS2-Agent` protocol adapter for users who already run that mod. No code copy.

### Static data strategy

Do not commit large game-data dumps to the repo.

Use an explicit data cache:

```text
~/.cache/sts2-a10-agent/
  data/
    spire-codex/
      eng/
        manifest.json
        cards.json
        relics.json
        potions.json
        monsters.json
        encounters.json
        events.json
        ascensions.json
```

`manifest.json` should include:

- `source_name`: `spire-codex`
- `source_url`
- `api_terms_url`
- `license_note`
- `downloaded_at`
- `version` if available
- per-file `sha256`

Resolution rules:

- Facts from live state win over static text when they conflict.
- Static data is used for names, base card facts, rarity, character/color, keywords/tags, known upgrades, relic descriptions, monster metadata, ascension descriptions.
- Calculators use numeric facts from state when available (`dynamic_values`, live costs, live damage/block previews, current HP/energy/stars).
- Estimates must be labeled estimates in recommendation output.

### Normalized RunState shape

The normalized shape should be one internal schema regardless of source:

```json
{
  "schema_version": "0.1",
  "source": {
    "kind": "sts2mcp",
    "source_version": null,
    "url": "http://localhost:15526",
    "observed_at": "2026-05-29T00:00:00Z",
    "raw_sha256": "..."
  },
  "session": {
    "mode": "singleplayer",
    "screen": "card_reward",
    "is_actionable": true,
    "available_actions": ["select_card_reward", "skip_card_reward"]
  },
  "run": {
    "run_id": null,
    "seed": null,
    "character": "REGENT",
    "ascension": 10,
    "act": 1,
    "floor": 7,
    "boss_id": null
  },
  "player": {
    "current_hp": 51,
    "max_hp": 75,
    "gold": 142,
    "block": null,
    "energy": null,
    "stars": null,
    "relics": [
      { "id": "RELIC_ID", "name": "Name", "facts": {}, "estimates": {} }
    ],
    "potions": [
      { "slot": 0, "id": "POTION_ID", "can_use": null, "requires_target": null }
    ],
    "deck": [
      {
        "instance_id": null,
        "id": "CARD_ID",
        "name": "Name",
        "upgraded": false,
        "type": "Attack",
        "rarity": "Common",
        "cost": 1,
        "facts": { "source": "state+static" },
        "estimates": {}
      }
    ]
  },
  "combat": {
    "turn": null,
    "phase": null,
    "hand": [],
    "enemies": [],
    "legal_actions": []
  },
  "choices": {
    "kind": "card_reward",
    "options": [
      {
        "option_id": "card_reward:0",
        "index": 0,
        "kind": "card",
        "id": "CARD_ID",
        "name": "Name",
        "legal": true,
        "facts": {},
        "estimates": {}
      }
    ],
    "can_skip": true
  },
  "facts": {
    "unresolved_ids": [],
    "warnings": []
  },
  "estimates": {
    "deck_metrics": {},
    "path_risk": null
  }
}
```

Required design rule: facts and estimates are separate. Static card text, live costs, current HP, and source-provided legal actions are facts. Synergy scores, path risk, future elite survivability, and confidence are estimates.

### Decision/logging record shape

Use JSONL from the start. One recommendation equals one line.

```json
{
  "schema_version": "0.1",
  "record_type": "recommendation",
  "timestamp": "2026-05-29T00:00:00Z",
  "decision_id": "uuid-or-ulid",
  "run_ref": {
    "run_id": null,
    "seed": null,
    "character": "REGENT",
    "ascension": 10,
    "act": 1,
    "floor": 7
  },
  "state_ref": {
    "source_kind": "sts2mcp",
    "raw_sha256": "...",
    "normalized_sha256": "..."
  },
  "context": {
    "choice_kind": "card_reward",
    "screen": "card_reward"
  },
  "candidates": [
    {
      "candidate_id": "card_reward:0",
      "kind": "card",
      "id": "CARD_ID",
      "label": "Card Name",
      "legal": true,
      "facts": {
        "type": "Attack",
        "rarity": "Common",
        "cost": 1
      },
      "estimates": {
        "score_total": 18.5,
        "score_components": {
          "frontload": 6.0,
          "defense": 0.0,
          "curve": 2.0,
          "regent_synergy": 4.0,
          "deck_need": 6.5
        },
        "risk_notes": []
      }
    }
  ],
  "recommendation": {
    "candidate_id": "card_reward:0",
    "action_kind": "pick_card",
    "confidence": 0.64,
    "summary": "Pick the card because it improves current deck needs.",
    "fact_reasons": [
      "The deck is short on low-cost attacks."
    ],
    "estimate_reasons": [
      "The policy estimates this improves early Act 1 elite survivability."
    ]
  },
  "policy": {
    "name": "regent_card_reward_v0",
    "version": "0.1.0",
    "weights_sha256": null
  },
  "executor": {
    "mode": "disabled",
    "would_call": null
  }
}
```

No LLM-generated arithmetic should be written as a score. Scores must come from deterministic calculators.

### Initial policy modules

Implement deterministic heuristics first:

| Module | v0.1 responsibility |
| --- | --- |
| `RegentCardRewardPolicy` | Pick/skip card rewards using deck composition, live card facts, Regent-first card color, energy/star costs, damage/block needs, rarity, upgrade value, and duplicate penalties. |
| `MapChoicePolicy` | Score next map nodes from current HP, floor, visible path, elite/rest/shop/event density, known boss if present, and A10 risk. |
| `RestChoicePolicy` | Rest vs smith vs special options using HP threshold, upcoming elite/boss risk, and deterministic upgrade value. |
| `ShopChoicePolicy` | Recommend purchases/removal only when shop state and prices are explicit facts. Otherwise say insufficient data. |
| `EventChoicePolicy` | Use known event facts when resolved; otherwise prefer nonlethal, non-random, non-deck-damaging conservative options. |
| `PotionChoicePolicy` | Recommend potion keep/use/discard only from source-provided can-use/can-discard facts and deterministic risk thresholds. |
| `CombatNotesPolicy` | Observation-only notes: summarize lethal risk, block gap, playable hand, known enemy intents. No action selection in v0.1 unless explicitly promoted after state/action validation. |

Regent-first means:

- Default character target is `REGENT`.
- Card reward policy should prioritize Regent cards and Regent mechanics before cross-character generality.
- Tests should include Regent deck shapes first.
- Other characters can pass through generic rules later, but no balancing effort should be spent on them in v0.1.

### CLI commands

Proposed v0.1 commands:

```text
sts2-a10 snapshot --source sts2mcp --url http://localhost:15526 --out raw.json
sts2-a10 normalize --source auto --state raw.json --out run_state.json
sts2-a10 advise --state raw.json --source auto --log logs/recommendations.jsonl
sts2-a10 advise --normalized run_state.json --log logs/recommendations.jsonl
sts2-a10 data sync --source spire-codex --lang eng
sts2-a10 data status
sts2-a10 replay --fixture tests/fixtures/raw/sts2mcp/card_reward_regent_*.json --log tmp/replay.jsonl
sts2-a10 executor status
```

`executor status` should report `disabled` in v0.1. There should be no command that sends actions to a mod in v0.1.

### Test fixture strategy

Use fixtures to make every recommendation replayable:

- Raw state fixtures from each supported source, stripped to the minimum required fields.
- Normalized golden fixtures.
- Expected recommendation JSONL lines with deterministic scores.
- Synthetic static data fixtures for unit tests.
- Optional real-ID fixtures may include IDs and numeric fields, but avoid committing full descriptions or large dumps until data licensing is reviewed.

Minimum fixture matrix:

| Fixture group | Purpose |
| --- | --- |
| `raw/sts2mcp/card_reward/regent_*` | First card reward decisions. |
| `raw/sts2mcp/map/regent_*` | Between-room path scoring. |
| `raw/sts2mcp/rest/regent_*` | Rest/smith decisions. |
| `raw/sts2mcp/shop/regent_*` | Buy/remove/pass decisions. |
| `raw/sts2mcp/event/regent_*` | Event choices with known and unknown events. |
| `raw/sts2mcp/combat/regent_*` | Observation-only combat notes. |
| `data_minimal/*.json` | Small synthetic card/relic/potion/monster facts. |
| `expected_logs/*.jsonl` | JSONL schema and score regression checks. |

Tests should verify:

- Normalization is deterministic.
- Unknown fields do not crash normalization.
- Missing static data produces warnings, not hallucinated facts.
- All log records pass schema validation.
- Scores are reproducible.
- Recommendations never include executable action calls when executor mode is disabled.

### What is intentionally deferred

- RL, self-play, AlphaZero, policy-gradient training, or any learned policy.
- Required LLM dependency.
- Autonomous game control.
- Combat action selection and card-play execution.
- Multiplayer.
- Windows packaging.
- A web UI.
- Building a new STS2 mod.
- Vendoring Spire Codex, SpireScope, STS2MCP, or STS2-Agent code.
- Vendoring large game-data dumps.
- Community stats ingestion.
- Long-term memory or run-farming loops.
- Cloud sync.

## First Implementation Task After Research

Create the minimal Python project skeleton and implement only the schema/fixture foundation:

1. `pyproject.toml` with Python 3.12, `pydantic`, CLI, and `pytest`.
2. `RunState` and decision JSONL Pydantic models.
3. File/stdin raw-state adapter.
4. STS2MCP raw-state normalizer for `card_reward`, `map`, `rest_site`, `shop`, `event`, and combat observation fields.
5. JSONL writer.
6. A tiny synthetic fixture set and tests proving deterministic normalization and log schema validation.

Do not implement live action execution. Do not implement RL. Do not add game-data dumps. Do not add a web UI.

Only after that foundation is green should the first Regent card-reward policy be added.

## Final Recommendation

Start with a read-only, deterministic advisor:

- STS2MCP provides the best macOS-first live state adapter.
- Spire Codex provides the best static data source, but only through explicit sync/cache with provenance.
- SpireScope should inform save/log fallback design but not be a dependency.
- STS2-Agent should inform protocol design, especially `available_actions` and dynamic values, but AGPL means no code copy and no v0.1 dependency.

This architecture keeps the repo small, legal-risk-aware, replayable, and useful before any automation exists. It also gives us a clean upgrade path: once normalization, data resolution, JSONL logs, and Regent reward/map policies are stable, action execution can be added as a separate opt-in layer with strict safety gates.
