# STS2 A10 Agent

Local Slay the Spire 2 advisor/agent research project.

## GitHub Pages Applet Hub

This repository also contains a Vite/React applet hub that is deployed to
GitHub Pages by `.github/workflows/deploy-pages.yml`.

Live site:

```text
https://colourfour.github.io/sts-a10-agent/#/applets
```

Useful local commands from the repository root:

```bash
npm ci
npm run typecheck --if-present
npm test --if-present
npm run build
```

The build output is written to `dist/`, which is the directory uploaded by the
GitHub Pages workflow.

Goal: build a Regent-first decision engine that can eventually farm Ascension 10 reliably through inspectable state parsing, deterministic calculators, policy evaluation, and run logging.

## v0.1 Read-Only Advisor

This repo is intentionally boring and read-only at v0.1. It does not execute game actions, solve combat, call an LLM, run RL, or vendor external game data.

Current scope:

- Load raw JSON state from a file or stdin.
- Normalize a tiny STS2MCP-style fixture into a stable `RunState` JSON shape.
- Read live state from a local STS2MCP HTTP endpoint.
- Route the current screen to first-pass Regent-focused advice for card rewards, shops, rest sites, maps, events, and combat observation.
- Write and validate JSONL recommendation records.
- Provide CLI smoke commands and tests with mocked live HTTP.
- Preserve the tooling research report in `docs/research/`.

Deferred:

- Full Regent card-reward policy.
- Rich Spire Codex data sync and calculators.
- Combat solver.
- Any action executor.

## Setup

Use Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
```

If your shell only has `python3`, create the venv with `python3 -m venv .venv`; once activated, `python` should resolve to the venv interpreter.

## CLI Usage

Show help:

```bash
python -m sts2_agent --help
```

Dump raw JSON in stable formatting:

```bash
python -m sts2_agent dump-state fixtures/raw/sts2mcp/card_reward_regent.json
```

Normalize a fixture:

```bash
python -m sts2_agent normalize-fixture fixtures/raw/sts2mcp/card_reward_regent.json
```

Normalize and write a foundation JSONL recommendation record:

```bash
python -m sts2_agent normalize-fixture \
  fixtures/raw/sts2mcp/card_reward_regent.json \
  --log /tmp/sts2-a10-recommendations.jsonl
```

Validate a decision log:

```bash
python -m sts2_agent validate-log /tmp/sts2-a10-recommendations.jsonl
python -m sts2_agent validate-log fixtures/logs/sample_recommendations.jsonl
```

## Live STS2MCP Usage

Start Slay the Spire 2 with STS2MCP installed, then run:

```bash
python -m sts2_agent probe-live
python -m sts2_agent dump-live
python -m sts2_agent normalize-live
python -m sts2_agent advise-live
python -m sts2_agent advise-live --log logs/recommendations.local.jsonl
```

Use a custom STS2MCP URL or timeout when needed:

```bash
python -m sts2_agent advise-live --base-url http://localhost:15526 --timeout 3
```

`advise-live` prints a recommendation object with:

- decision type
- recommended action and choice
- confidence
- risk notes
- short reasoning
- known facts used
- uncertain assumptions

The command is read-only. It only calls `GET /api/v1/singleplayer?format=json`; it does not call any STS2MCP action endpoint.

## Spire Codex Cache

The advisor can use a local Spire Codex cache when present, but missing data is only a warning. Runtime cache files live under `data/cache/spire-codex/`, which is ignored by git.

Best-effort refresh:

```bash
python -m sts2_agent advise-live --refresh-metadata
```

Do not commit cached Spire Codex data without a license review.

## Tests

```bash
python -m pytest
git diff --check
git status --short
```

## Research

The current tooling research note is at:

```text
docs/research/STS2_TOOLING_RESEARCH_2026_05_29.md
```

Its v0.1 decision is: build a new Python CLI-first repo, use STS2MCP as the first read-only live-state adapter, keep Spire Codex as a later cached static-data source, write JSONL logs from the start, and avoid AGPL code copying.
