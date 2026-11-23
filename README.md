# Launch Radar — token-radar-01, second entry

A token launch radar: it ranks the protocols in the sealed DefiLlama snapshot that record no
token by the value their launch would imply, keeps every term of that valuation on the page, and
writes a farm plan per protocol priced in cash and hours.

## The model

For each pre-token protocol, in `lib/model.ts`:

```
implied FDV = TVL × peer multiple × growth factor × maturity factor × reach factor
```

- **Peer multiple** — the median market-cap÷TVL of the protocols in the same snapshot whose token
  already trades: the category's own median when it has at least 4 traded peers, else its family
  pool (vaults, credit, trading, staking), else the whole market's median (a stated 0.25× if the
  snapshot held no traded protocol at all). Clamped to 0.05–2.50×, with the raw median printed
  beside the clamped value in every detail view, so the clamp is never a hidden term.
  The tier and peer count are printed on every row; the largest peers are listed in the detail
  view, and the FDV is computed from the rounded terms exactly as printed, so the chain a reader
  multiplies by hand lands on the board's figure.
- **Growth factor** — 1 + (7-day TVL change clamped to −50%…+100%, rounded as printed) × 0.4.
- **Maturity factor** — 0.65 rising to 1.00 over 1,460 days of DefiLlama tracking.
- **Reach factor** — 1 + 0.03 per chain past the first, up to 7 extra.
- **Launch terms (priors, not snapshot readings)** — a float share by family (18–25%) gives the
  implied launch market cap; a community allocation by family (12–15%) gives the implied airdrop
  pool. Every detail view carries two sensitivities, both recomputed through the same printed
  chain: the FDV with the peer multiple scaled ±25% and re-clamped into the band, and the pool
  with the two priors scaled ±25%.
- **Eligibility (stated exclusions)** — products of another asset or protocol are not ranked: a
  wrapped, staked or staking word in the name, an exchange's name first, a versioned release
  name, or a derivative category (bridges, liquid staking and restaking, exchange tokens).
- **Conviction grade (A–D)** — counts how the value was evidenced: tier, peer count, complete
  data, scale. **Risk flags** name facts of the record (declining TVL, tracked under 90 days,
  thin TVL, one chain, thin peers, missing data).

`lib/plan.ts` writes each row's 7-step farm plan with per-step cash cost and time, sized by the
protocol's TVL tier and held for a period set by its age; `lib/board.ts` assembles the board,
self-checks it against the gate's rules, and prepares the dashboard's dataset. Protocols whose
token already trades are never ranked — they are the calibration's evidence and are shown
separately at their market caps.

## Running it

Node 22, standard library only, no network, deterministic (same snapshot, same bytes):

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|input-dir>
```

Writes `board.json` (the ranked board), `data.js` (the dashboard's dataset), `dashboard/` and
`screenshots/` (copied from this repository), and `dossier.json` (built with
`vendor/makefun-board.ts`, the scorer's own library, kept byte for byte).

The dashboard is a static page over `data.js`: a sortable, filterable board (search, category,
chain, grade, watchlist), a per-protocol detail view with the full valuation chain, a sensitivity
table (the multiple ±25% re-clamped, and the launch priors ±25%), the traded peers behind each
multiple, the farm plan, the calibration table (raw median beside the multiple in use), and the
live-token set — every view addressable by URL hash (`#/board`, `#/p/<slug>`,
`#/board?watch=1`).

## Layout

`main.ts` (entrypoint) · `lib/model.ts` (the valuation) · `lib/plan.ts` (the farm plans) ·
`lib/board.ts` (assembly, gate self-check, dashboard dataset) · `dashboard/` (the page) ·
`screenshots/` (renders of the generated page) · `vendor/makefun-board.ts` (the scorer's dossier
library, unmodified).

## Screenshots

`screenshots/` holds real renders of the generated dashboard (Chrome, 1440×1000): the board, a
detail view, a watchlist-filtered view, and a second detail view for a row whose raw peer median
(0.0324×) sits below the clamp floor, showing the raw and clamped multiples side by side.

Data: DefiLlama `https://api.llama.fi/protocols`, frozen in the sealed snapshot (as of
2026-11-14). A protocol "records no token" here by that snapshot's record; an implied value is
this board's own claim, not a prediction.
