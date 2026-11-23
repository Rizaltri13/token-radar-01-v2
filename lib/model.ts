// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// Every number on the board is a term, and every term is kept. A protocol's implied value is not
// one multiple the author picked: it is a chain of five factors, each read off the snapshot itself,
// and the dashboard prints the whole chain for every row, so a reader can check any figure on the
// board back to the snapshot's own fields.
//
//   implied FDV = TVL x peer multiple x growth factor x maturity factor x reach factor
//
// The peer multiple is the market's own verdict: for the protocol's category, the median
// market-cap-to-TVL ratio of the protocols in the same snapshot whose token already trades. A
// category with too few traded peers falls back to its family (the categories that do the same
// economic job, pooled), and only then to the whole market's median. The row always names the tier
// it used and the peer count behind it, and the detail view lists the peers themselves.
//
// Two more stated terms turn the FDV into a farming decision, and they are assumptions, printed as
// such: a launch float (the share of FDV that would circulate at launch, by family) gives an
// implied launch market cap, and a community allocation (the share of supply a launch would hand
// to its users, by family) gives an implied airdrop pool. Against the farm plan's own cash cost,
// the pool gives the board's second lens: pool dollars per dollar of plan cost.
//
// Nothing is keyed to a protocol's name. The same functions score every row; the snapshot's fields
// (TVL, seven-day change, the day DefiLlama began tracking it, its chains, its category) are the
// only inputs.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. The dashboard prints every one of them; nothing is tuned per protocol. */
export interface ModelConstants {
  /** A category needs at least this many traded peers before its own median is trusted. */
  min_peers: number;
  /** Peer multiples are clamped into this band before they value anything. */
  multiple_min: number;
  multiple_max: number;
  /** Growth: the factor moves this far per 100% of seven-day TVL change, inside the clamp band. */
  growth_weight: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  /** Maturity: the factor runs from maturity_floor to 1.0 across maturity_days of tracked age. */
  maturity_floor: number;
  maturity_days: number;
  /** A protocol with no listed_at is aged as this many days for the maturity factor. */
  unknown_age_days: number;
  /** Reach: each chain past the first adds this much, up to reach_max_extra extra chains. */
  reach_step: number;
  reach_max_extra: number;
}

export const MODEL: ModelConstants = {
  min_peers: 4,
  multiple_min: 0.05,
  multiple_max: 2.5,
  growth_weight: 0.4,
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  maturity_floor: 0.65,
  maturity_days: 1460,
  unknown_age_days: 300,
  reach_step: 0.03,
  reach_max_extra: 7,
};

/** The model's version label, printed on the page and in board.json. */
export const MODEL_VERSION = 'launch-radar-1';

/**
 * The launch assumptions, by family: the share of FDV that would circulate at launch (float) and
 * the share of supply a launch would allocate to its community of users (allocation). They are the
 * model's stated priors, printed on the methodology panel; the sensitivity table in every detail
 * view shows what the figures become when the multiple moves instead.
 */
export interface LaunchTerms {
  float_share: number;
  allocation_share: number;
}

const LAUNCH_BY_FAMILY: Record<string, LaunchTerms> = {
  trading: { float_share: 0.2, allocation_share: 0.14 },
  credit: { float_share: 0.18, allocation_share: 0.12 },
  vaults: { float_share: 0.22, allocation_share: 0.13 },
  staking: { float_share: 0.25, allocation_share: 0.15 },
};

const LAUNCH_DEFAULT: LaunchTerms = { float_share: 0.2, allocation_share: 0.12 };

/** The families: categories that do the same economic job, pooled when a category's own traded
 * peers are too few. DefiLlama splits one job into many labels, so the family is the peer group. */
const FAMILY_OF = new Map<string, string>([
  ['Yield', 'vaults'],
  ['Yield Aggregator', 'vaults'],
  ['Risk Curators', 'vaults'],
  ['Onchain Capital Allocator', 'vaults'],
  ['Liquidity Manager', 'vaults'],
  ['Leveraged Farming', 'vaults'],
  ['Farm', 'vaults'],
  ['Lending', 'credit'],
  ['CDP', 'credit'],
  ['CDP Manager', 'credit'],
  ['Uncollateralized Lending', 'credit'],
  ['Collateral Markets', 'credit'],
  ['Dual-Token Stablecoin', 'credit'],
  ['Stablecoin Wrapper', 'credit'],
  ['Dexs', 'trading'],
  ['Derivatives', 'trading'],
  ['Interest Rate Derivatives', 'trading'],
  ['Options', 'trading'],
  ['Staking Pool', 'staking'],
  ['Restaking', 'staking'],
  ['Liquid Staking', 'staking'],
  ['Liquid Restaking', 'staking'],
]);

/** The family a category belongs to, or null when it stands alone. */
export function familyOf(category: string | null): string | null {
  if (category === null) return null;
  return FAMILY_OF.get(category) ?? null;
}

/** The launch terms a category is valued with: its family's, or the stated default. */
export function launchTermsFor(category: string | null): LaunchTerms {
  const family = familyOf(category);
  if (family !== null && LAUNCH_BY_FAMILY[family] !== undefined) return LAUNCH_BY_FAMILY[family]!;
  return LAUNCH_DEFAULT;
}

/** Which tier supplied a row's peer multiple. */
export type MultipleTier = 'category' | 'family' | 'global';

/** One tier's calibrated multiple: the median mcap/TVL of its traded protocols. */
export interface CalibratedMultiple {
  multiple: number;
  peers: number;
  tier: MultipleTier;
  family: string | null;
}

/** A traded peer the calibration read: the evidence behind a multiple, shown in the detail view. */
export interface PeerEvidence {
  name: string;
  slug: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

/** The calibration's three tiers plus the peer evidence behind each category and family. */
export interface Calibration {
  byCategory: Map<string, CalibratedMultiple>;
  byFamily: Map<string, CalibratedMultiple>;
  global: CalibratedMultiple;
  peersByCategory: Map<string, PeerEvidence[]>;
  peersByFamily: Map<string, PeerEvidence[]>;
  globalPeers: PeerEvidence[];
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A finite number, else the fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from listed_at to the snapshot's as_of, clamped at zero; null when unreported. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clampMultiple = (m: number, model: ModelConstants): number =>
  Math.min(model.multiple_max, Math.max(model.multiple_min, m));

/** The top peers of a pool by market cap, as evidence: at most six, ratios kept whole. */
function peerSample(pool: PeerEvidence[]): PeerEvidence[] {
  return [...pool]
    .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, 6)
    .map((p) => ({ name: p.name, slug: p.slug, mcap_usd: p.mcap_usd, tvl_usd: p.tvl_usd, ratio: round4(p.ratio) }));
}

/**
 * The calibration: one multiple per category, read off the snapshot's traded protocols. A category
 * needs at least min_peers traded protocols with both a market cap and a TVL before its own median
 * is trusted; below that its family's pooled median stands in when the family qualifies, and below
 * that the whole market's median. Every tier keeps its peer evidence so the page can show it.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const ratiosByCategory = new Map<string, number[]>();
  const ratiosByFamily = new Map<string, number[]>();
  const peersByCategory = new Map<string, PeerEvidence[]>();
  const peersByFamily = new Map<string, PeerEvidence[]>();
  const allRatios: number[] = [];
  const allPeers: PeerEvidence[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const evidence: PeerEvidence = {
      name: p.name,
      slug: p.slug,
      mcap_usd: p.mcap_usd,
      tvl_usd: p.tvl_usd,
      ratio: p.mcap_usd / p.tvl_usd,
    };
    allRatios.push(evidence.ratio);
    allPeers.push(evidence);
    if (p.category !== null) {
      const ratios = ratiosByCategory.get(p.category) ?? [];
      ratios.push(evidence.ratio);
      ratiosByCategory.set(p.category, ratios);
      const peers = peersByCategory.get(p.category) ?? [];
      peers.push(evidence);
      peersByCategory.set(p.category, peers);
      const family = familyOf(p.category);
      if (family !== null) {
        const famRatios = ratiosByFamily.get(family) ?? [];
        famRatios.push(evidence.ratio);
        ratiosByFamily.set(family, famRatios);
        const famPeers = peersByFamily.get(family) ?? [];
        famPeers.push(evidence);
        peersByFamily.set(family, famPeers);
      }
    }
  }
  const global: CalibratedMultiple = {
    multiple: clampMultiple(allRatios.length > 0 ? median(allRatios) : 0.25, model),
    peers: allRatios.length,
    tier: 'global',
    family: null,
  };
  const byCategory = new Map<string, CalibratedMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    if (ratios.length >= model.min_peers) {
      byCategory.set(category, { multiple: clampMultiple(median(ratios), model), peers: ratios.length, tier: 'category', family: null });
    }
  }
  const byFamily = new Map<string, CalibratedMultiple>();
  for (const [family, ratios] of ratiosByFamily) {
    if (ratios.length >= model.min_peers) {
      byFamily.set(family, { multiple: clampMultiple(median(ratios), model), peers: ratios.length, tier: 'family', family });
    }
  }
  const sampledCategories = new Map<string, PeerEvidence[]>();
  for (const [category, peers] of peersByCategory) sampledCategories.set(category, peerSample(peers));
  const sampledFamilies = new Map<string, PeerEvidence[]>();
  for (const [family, peers] of peersByFamily) sampledFamilies.set(family, peerSample(peers));
  return { byCategory, byFamily, global, peersByCategory: sampledCategories, peersByFamily: sampledFamilies, globalPeers: peerSample(allPeers) };
}

/** The multiple one protocol is valued with, its tier, and the peer evidence behind that tier. */
function multipleFor(
  p: SnapshotProtocol,
  calib: Calibration,
): { mult: CalibratedMultiple; peers: PeerEvidence[] } {
  if (p.category !== null) {
    const own = calib.byCategory.get(p.category);
    if (own !== undefined) return { mult: own, peers: calib.peersByCategory.get(p.category) ?? [] };
    const family = familyOf(p.category);
    if (family !== null) {
      const fam = calib.byFamily.get(family);
      if (fam !== undefined) return { mult: { ...fam }, peers: calib.peersByFamily.get(family) ?? [] };
    }
  }
  return { mult: calib.global, peers: calib.globalPeers };
}

/** Every term of one row's valuation, as the board and the detail view print them. */
export interface ValueTerms {
  tvl_usd: number;
  peer_multiple: number;
  multiple_tier: MultipleTier;
  multiple_family: string | null;
  live_peers: number;
  growth_pct: number | null;
  growth_factor: number;
  age_days: number | null;
  maturity_factor: number;
  chain_count: number;
  reach_factor: number;
  implied_fdv_usd: number;
  float_share: number;
  implied_launch_mcap_usd: number;
  allocation_share: number;
  implied_pool_usd: number;
  fdv_at_multiple_low: number;
  fdv_at_multiple_high: number;
}

/** A row's risk flags: each one names a fact of the snapshot record, never an opinion. */
export type RiskFlag =
  | 'DECLINING_TVL'
  | 'YOUNG'
  | 'THIN_TVL'
  | 'SINGLE_CHAIN'
  | 'THIN_PEERS'
  | 'NO_GROWTH_DATA'
  | 'NO_AGE_DATA';

/** The full working on one protocol: its terms, its flags, its grade and its peer evidence. */
export interface Valuation {
  terms: ValueTerms;
  flags: RiskFlag[];
  grade: 'A' | 'B' | 'C' | 'D';
  peers: PeerEvidence[];
}

/**
 * Value one protocol. The FDV chain is TVL x multiple x growth x maturity x reach; the launch
 * terms then split the FDV into a circulating-at-launch figure and a community pool. The flags and
 * the grade read the same record: how the value was evidenced, and what in it should make a farmer
 * careful.
 */
export function valueProtocol(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calib: Calibration,
): Valuation {
  const { mult, peers } = multipleFor(p, calib);
  const age = ageDays(asOf, p.listed_at);
  const growthPct = p.change_7d === null ? null : Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, p.change_7d));
  // The FDV is computed from the rounded terms themselves, exactly as the detail view prints
  // them, so a reader who multiplies the printed chain lands on the board's figure to the dollar.
  const growthFactor = round4(1 + ((growthPct ?? 0) / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityFactor = round4(
    model.maturity_floor +
      (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * (1 - model.maturity_floor),
  );
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), model.reach_max_extra);
  const reachFactor = round4(1 + model.reach_step * extraChains);
  const fdv = Math.max(1, Math.round(p.tvl_usd * round4(mult.multiple) * growthFactor * maturityFactor * reachFactor));
  const launch = launchTermsFor(p.category);
  const terms: ValueTerms = {
    tvl_usd: p.tvl_usd,
    peer_multiple: round4(mult.multiple),
    multiple_tier: mult.tier,
    multiple_family: mult.family,
    live_peers: mult.peers,
    growth_pct: growthPct === null ? null : round2(growthPct),
    growth_factor: round4(growthFactor),
    age_days: age,
    maturity_factor: round4(maturityFactor),
    chain_count: p.chains.length,
    reach_factor: round4(reachFactor),
    implied_fdv_usd: fdv,
    float_share: launch.float_share,
    implied_launch_mcap_usd: Math.round(fdv * launch.float_share),
    allocation_share: launch.allocation_share,
    implied_pool_usd: Math.round(fdv * launch.allocation_share),
    fdv_at_multiple_low: Math.max(1, Math.round(fdv * 0.75)),
    fdv_at_multiple_high: Math.round(fdv * 1.25),
  };
  const flags: RiskFlag[] = [];
  if (p.change_7d !== null && p.change_7d <= -15) flags.push('DECLINING_TVL');
  if (age !== null && age < 90) flags.push('YOUNG');
  if (p.tvl_usd < 15_000_000) flags.push('THIN_TVL');
  if (p.chains.length <= 1) flags.push('SINGLE_CHAIN');
  if (mult.tier === 'global' || mult.peers < 6) flags.push('THIN_PEERS');
  if (p.change_7d === null) flags.push('NO_GROWTH_DATA');
  if (age === null) flags.push('NO_AGE_DATA');
  let score = 0;
  if (mult.tier === 'category') score += 3;
  else if (mult.tier === 'family') score += 2;
  else score += 1;
  if (p.change_7d !== null) score += 1;
  if (age !== null) score += 1;
  if (p.tvl_usd >= 100_000_000) score += 1;
  if (p.tvl_usd >= 1_000_000_000) score += 1;
  if (p.change_7d !== null && p.change_7d <= -15) score -= 1;
  if (age !== null && age < 60) score -= 1;
  const grade: Valuation['grade'] = score >= 6 ? 'A' : score >= 4 ? 'B' : score >= 2 ? 'C' : 'D';
  return { terms, flags, grade, peers };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are products of another asset or protocol, not launches of their own. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Names that begin with an exchange's name: the exchange's own product, not a launch candidate. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Whether a protocol records no token in the snapshot. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and a launch candidate of its own. The
 * house's watchlist exclusions (versioned name, derivative category, a wrapped or staked word in
 * the name, an exchange's name first) are applied to every candidate, not only above the floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}
