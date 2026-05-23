# Contributing to Franklin Trading

## Setup

```bash
git clone https://github.com/BlockRunAI/Franklin-Trading
cd Franklin-Trading
npm install
npm run build
```

## Development

```bash
npm run dev              # Watch mode — recompiles on save
npm start                # Run the agent
npm test                 # Deterministic local tests (no API calls, no wallet funding)
npm run test:strategies  # Strategy-lifecycle tests (backtest → paper → live shape)
npm run test:e2e         # Live E2E tests (real models, needs a funded wallet)
```

## Design canon — read these before opening a PR

1. **[`PHILOSOPHY.md`](PHILOSOPHY.md)** — the one-sentence north star and
   the test we never stop running.
2. **[`docs/CONVICTIONS.md`](docs/CONVICTIONS.md)** — 12 design stances
   formed from analyzing 60+ open issues across TradingAgents, AI-Trader,
   Vibe-Trading, and Hummingbot. Each conviction names the user pain it
   addresses; PRs that weaken a conviction must show the underlying gap
   has closed (citing the upstream issue resolution).
3. **[`docs/adr/`](docs/adr/)** — individual architecture decisions, each
   with status (accepted / superseded / proposed) and rationale.

If your change touches risk, positions, slippage, fact-checking, regime
detection, or the strategy lifecycle, **cite the relevant conviction or
ADR in your PR description.**

## Code Standards

- TypeScript strict mode
- ESM modules only (`"type": "module"`)
- Node >= 20
- **English-only source.** Comments, prompts, tool spec descriptions,
  classifier keyword arrays, and few-shot examples in `src/` must not
  contain literal restricted-script (CJK / Korean / etc.) characters.
  The model is multilingual at runtime; the policy keeps the source
  audit-friendly. A regression test in `test/local.mjs` enforces this on
  every PR. Test fixtures and changelog/release-note evidence are
  exempt.
- **Never reference competitor product names** in commits, comments, or
  source — `docs/CONVICTIONS.md` and ADRs are the only places where
  competitor projects may be cited (and only for issue-evidence).
- **No colons, leading dots, or symlinks in committed paths** — Windows
  compatibility per [CONVICTIONS §12](docs/CONVICTIONS.md#12-cross-platform-from-day-one--windows-is-a-free-differentiator).
  CI matrix enforces this.

## Pull Requests

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to verify compilation
5. Run `npm test` (and `npm run test:e2e` if your change touches model
   calls, x402 settlements, or tool integrations)
6. Submit a PR with a clear description that cites:
   - The conviction or ADR your change advances or amends, if any.
   - The receipt (log line, gateway response, failing test) proving the
     bug is real or the feature is wanted.

### Quality bar for fixes

Franklin Trading is audit-driven: every fix should have a receipt — a
real session, log line, gateway response, or failing test that proves
the bug is real and the fix lands.

When you find a bug, **search the codebase for the same bug class
before opening a PR.** If you find one `JSON.stringify(part.content)`
that destroys image blocks, there are likely four more — fix them all
in the same PR rather than leaving sibling instances unpatched. The
review will surface them anyway, and a one-shot landing is cheaper
than a follow-up cycle.

Add at least one regression test for each behavior you fix. The PR
description should quote the original failure mode (the log line, the
session id, the gateway 402 body, etc.) so the receipt survives in git
history alongside the code change.

For changes touching position accounting, slippage, regime detection,
or the kill switch, **property tests are required** ([ADR 0005](docs/adr/0005-position-accumulator-property-tested.md)).

## Architecture

Franklin Trading uses
[`@blockrun/llm`](https://www.npmjs.com/package/@blockrun/llm) for
model access and x402 micropayments on Base or Solana. The agent loop
lives in `src/agent/`, tools in `src/tools/`, personas in
`src/personas/`, strategies in `src/strategies/`, and the terminal UI
is Ink (React for terminals) under `src/ui/`. Plugins are extensible
via the public SDK in `src/plugin-sdk/`.

For a deeper architecture tour, see
`docs/anatomy-of-an-economic-agent.md` and the ADRs under `docs/adr/`.

## Releases

Patches land on `main` and ship via `chore(release): X.Y.Z — …`
commits that bump `package.json` and prepend a `CHANGELOG.md` entry.
A matching narrative goes under `docs/release-notes/YYYY-MM-DD-*.md`.
Every minor-version tag triggers a competitive-benchmark regeneration
(see [ADR 0007](docs/adr/0007-quarterly-competitive-benchmark.md)) —
if any tracked metric regresses, the release notes surface it.

## License

Apache-2.0
