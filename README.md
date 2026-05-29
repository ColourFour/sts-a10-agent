# STS2 A10 Agent

Local Slay the Spire 2 advisor/agent research project.

Goal: build a Regent-first decision engine that can eventually farm Ascension 10 reliably through inspectable state parsing, deterministic calculators, policy evaluation, and run logging.

v0.1 target:
- Read or receive current STS2 run state
- Normalize state into JSON
- Resolve card/relic/game metadata
- Advise on card rewards and between-room decisions
- Log recommendations and reasoning
- Remain read-only by default
