# Breakout Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dario-larsen/volume-breakout-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dario-larsen/volume-breakout-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for the make.fun `token-radar-01` bounty: 200 pre-token
protocols ranked by the implied value of a token they have not issued yet, on
a dashboard a reader can sort, filter and open protocol by protocol.

## The angle: volume breakout

TVL alone is a photograph; the 7-day change is the motion. A launch is worth
farming when a protocol's volume is breaking out of its pack, so this radar
prices each protocol the way the market already prices the ones that trade,
then pays up for breakout and for a long runway with no token:

```
implied = TVL × market multiple × breakout multiplier × runway multiplier
```

- **Market multiple** — the category's own median market-cap-per-TVL among
  its live-token protocols (at least 3 of them), else the snapshot's global
  median. The market's price per TVL dollar, not a house constant.
- **Breakout multiplier** — the protocol's 7-day TVL growth against its
  category's median 7-day change, clamped to [-60, +150] points and weighted
  0.35; ×1.25 at +50% (a surge), ×1.15 at +20% on $50M+ of TVL (a breakout),
  ×0.90 when the 7-day change is unreported (momentum unverified).
- **Runway multiplier** — up to +25% for up to three years tracked with no
  token; 1.10 when the listing date is unknown.

The board covers all 40 watchlist protocols plus the 158 early ones whose
volume breaks out hardest (every other pre-token protocol is a wrapped,
staked or bridged product of a token that already trades, and is left out).
Live-token protocols are kept apart on their own tab, shown at the market's
own values — never mixed into the ranking. Every
row carries a five-step farm plan with what it costs and how long it takes,
generated from the protocol's own record by `dashboard/farm.js`, the same
file the page and the board both use, so they can never disagree.

A protocol on this board **records no token** in the snapshot. That is
DefiLlama's record, never proof it has none. Implied value is this radar's
own claim from the snapshot's figures, not a prediction that a token is
issued, or when, or at what price.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes
`/output/board.json`, `/output/data.js`, copies `dashboard/` and
`screenshots/` to `/output`, and writes `/output/dossier.json` with the
vendored make.fun library (`vendor/makefun-board.ts`).

Open `out/dashboard/index.html` in a browser (served, e.g. from `out/`), or
open the screenshots in `screenshots/`: the board, a protocol's detail view
and a filtered view.

## Files

- `main.ts` — entrypoint: read the snapshot, score it, write the outputs.
- `lib/model.ts` — the breakout model, the board builder and the gate checks.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js` and the
  shared farm-plan generator `farm.js`.
- `dashboard/farm.js` — the farm plan generator, shared by `main.ts` and the
  page: one source of truth for every protocol's five steps.
- `vendor/makefun-board.ts` — the make.fun dossier library from the kit.
- `screenshots/` — the board, a detail view and a filtered view.
