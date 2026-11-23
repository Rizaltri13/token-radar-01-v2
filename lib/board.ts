// The board: the model's valuations and the plan module's farm plans, assembled into the ranked
// rows board.json carries and the dataset the dashboard renders. One builder makes both from the
// same objects, so the page and the board can never disagree.

import {
  calibrate,
  isRankable,
  valueProtocol,
  MODEL,
  MODEL_VERSION,
  type Calibration,
  type CalibratedMultiple,
  type ModelConstants,
  type PeerEvidence,
  type RiskFlag,
  type Snapshot,
  type SnapshotProtocol,
  type ValueTerms,
} from './model.ts';
import { farmPlan, stepText, type PlanTotals } from './plan.ts';

/** How many traded protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row, with its whole valuation and its farm plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  implied_value_usd: number;
  terms: ValueTerms;
  flags: RiskFlag[];
  grade: 'A' | 'B' | 'C' | 'D';
  plan_cost_usd: number;
  plan_hours: number;
  pool_per_cost: number;
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row plus the peer evidence behind its multiple. */
export interface RadarRow extends BoardRow {
  peers: PeerEvidence[];
}

/** A traded protocol, set apart from the board: the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One line of the calibration table the methodology panel prints. */
export interface CalibrationLine extends CalibratedMultiple {
  category: string;
}

/** Everything the dashboard renders, from the snapshot, in one object. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocol_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_fdv_usd: number;
  total_implied_pool_usd: number;
  global_multiple: number;
  global_peers: number;
  calibration: CalibrationLine[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** The protocols the board ranks, strongest first, with ranks 1..n and every term kept. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; calib: Calibration; peersBySlug: Map<string, PeerEvidence[]> } {
  const calib = calibrate(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, exactly as the house drew it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol the snapshot carries, at any size.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const watch = new Set(snapshot.watchlist);
  const peersBySlug = new Map<string, PeerEvidence[]>();
  const scored = [...chosen.values()].map((p) => {
    const valuation = valueProtocol(p, snapshot.as_of, model, calib);
    peersBySlug.set(p.slug, valuation.peers);
    const plan = farmPlan(p, valuation.terms);
    return { p, valuation, plan };
  });
  scored.sort(
    (a, b) =>
      b.valuation.terms.implied_fdv_usd - a.valuation.terms.implied_fdv_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  const board: BoardRow[] = scored.map((s, i) => {
    const totals: PlanTotals = s.plan.totals;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      token_status: 'pre-token',
      on_watchlist: watch.has(s.p.slug),
      implied_value_usd: s.valuation.terms.implied_fdv_usd,
      terms: s.valuation.terms,
      flags: s.valuation.flags,
      grade: s.valuation.grade,
      plan_cost_usd: totals.cash_cost_usd,
      plan_hours: totals.hours,
      pool_per_cost:
        totals.cash_cost_usd > 0 ? Math.round((s.valuation.terms.implied_pool_usd / totals.cash_cost_usd) * 10) / 10 : 0,
      farm_steps: s.plan.steps.map(stepText),
    };
  });
  return { board, calib, peersBySlug };
}

/** The traded protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1e4) / 1e4 : null,
    }));
}

/** Everything the dashboard renders: the board with its peer evidence, the live set, the calibration. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calib, peersBySlug } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  // The calibration lines the page prints: every category the board actually used, with the tier
  // that valued it, sorted by category name; then every family pool; then the market's own line.
  const lines = new Map<string, CalibrationLine>();
  for (const row of board) {
    const key = row.category ?? '(uncategorised)';
    if (!lines.has(key)) {
      lines.set(key, {
        category: key,
        multiple: row.terms.peer_multiple,
        raw_multiple: row.terms.multiple_raw,
        peers: row.terms.live_peers,
        tier: row.terms.multiple_tier,
        family: row.terms.multiple_family,
      });
    }
  }
  const calibration: CalibrationLine[] = [...lines.values()].sort((a, b) => (a.category < b.category ? -1 : 1));
  // Peer evidence rides with the row it valued, straight from the board's own pass.
  const rows: RadarRow[] = board.map((row) => ({ ...row, peers: peersBySlug.get(row.slug) ?? [] }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocol_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    total_implied_fdv_usd: board.reduce((a, r) => a + r.implied_value_usd, 0),
    total_implied_pool_usd: board.reduce((a, r) => a + r.terms.implied_pool_usd, 0),
    global_multiple: Math.round(calib.global.multiple * 1e4) / 1e4,
    global_peers: calib.global.peers,
    calibration,
    rows,
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, varied values, steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows: the gate takes 100 to 4,000`;
  if (board.length > 4000) return `the board holds ${board.length} rows: the gate takes 100 to 4,000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board names a slug twice';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
