// Breakout Radar — the volume-breakout model for token-radar-01.
//
// The angle: a launch is worth farming when the protocol's volume is breaking
// out of its pack. TVL alone is a photograph; the 7-day change is the motion.
// This model prices a pre-token protocol the way the market already prices
// the ones that trade, then pays up for breakout and for a long runway with
// no token, and pays down for cooling volume.
//
//   multiple     = the category's own market multiple: the median mcap/TVL of
//                  the live-token protocols in the same category (at least 3
//                  of them), else the whole snapshot's median. The market's
//                  price per TVL dollar, not a house constant.
//   relGrowth    = change_7d minus the category's median 7-day change
//                  (all protocols in the category), clamped to [-60, 150].
//                  A protocol growing 40 points faster than its category is
//                  breaking out of it; one 40 points behind is cooling off.
//   breakoutMult = 1 + 0.35 * relGrowth / 100
//                  x 1.25 when change_7d >= 50 (a surge)
//                  x 1.15 when change_7d >= 20 and TVL >= $50M (a breakout)
//                  x 0.90 when change_7d is unreported (momentum unverified)
//   runwayMult   = 1 + 0.25 * min(age_days, 1095) / 1095
//                  (age unknown: 1.10). A protocol that ran years with no
//                  token carries more pent-up launch value than a new one.
//   implied      = max(1, round(tvl_usd * multiple * breakoutMult * runwayMult))
//
// No protocol name is ever special-cased: the same function scores every row.
// A protocol records no token, never "has none": the snapshot is DefiLlama's
// record, not proof, and a token may exist that it does not carry.
// The board never ranks a wrapped, staked or bridged product of a token that
// already trades (WBTC, a bridge, a liquid-staking receipt): the watchlist's
// own rule, applied to the early pool. The watchlist itself is the floor and
// is always covered in full.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  rel_weight: number;
  rel_floor: number;
  rel_cap: number;
  surge_pct: number;
  surge_bonus: number;
  breakout_pct: number;
  breakout_tvl: number;
  breakout_bonus: number;
  unverified_mult: number;
  runway_weight: number;
  runway_days: number;
  unknown_age_mult: number;
  min_category_samples: number;
}

export const MODEL: ModelConstants = {
  rel_weight: 0.35,
  rel_floor: -60,
  rel_cap: 150,
  surge_pct: 50,
  surge_bonus: 1.25,
  breakout_pct: 20,
  breakout_tvl: 50_000_000,
  breakout_bonus: 1.15,
  unverified_mult: 0.9,
  runway_weight: 0.25,
  runway_days: 1095,
  unknown_age_mult: 1.1,
  min_category_samples: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'breakout-1';

/** How many pre-token protocols outside the watchlist the board carries. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  breakout_tier: string;
  implied_value_usd: number;
  model: {
    market_multiple: number;
    category_median_change: number;
    relative_growth_pct: number;
    breakout_multiplier: number;
    runway_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  r: number;
  s: string;
  n: string;
  c: string | null;
  h: string[];
  t: number;
  g: number | null;
  v: number;
  b: number;
  m: number;
  u: number;
  a: number | null;
  k: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  s: string;
  n: string;
  c: string | null;
  h: string[];
  t: number;
  m: number | null;
  g: number | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  v: string;
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list of numbers, or null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word wrapped, staked or staking is a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Names that begin with an exchange's name are that exchange's product, not a launch of its own. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a wrapped, staked or bridged product of a token that
 * already trades: WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in
 * Binance's staking product, and neither is a protocol still waiting on a
 * launch of its own. The watchlist's own rule, applied to the early pool.
 */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return true;
  if (VERSIONED.test(p.name)) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** The market context the model reads from the snapshot itself. */
export interface MarketContext {
  /** Median mcap/TVL per category, from live-token protocols with a market cap. */
  categoryMultiple: Map<string, number>;
  /** Median mcap/TVL over every live-token protocol with a market cap. */
  globalMultiple: number;
  /** Median 7-day TVL change per category, over every protocol that reports one. */
  categoryChange: Map<string, number>;
  /** Median 7-day TVL change over every protocol that reports one. */
  globalChange: number;
}

/** Build the market context: the medians the multiples and relative growth read. */
export function marketContext(snapshot: Snapshot): MarketContext {
  const multiplesByCat = new Map<string, number[]>();
  const changesByCat = new Map<string, number[]>();
  const allMultiples: number[] = [];
  const allChanges: number[] = [];
  for (const p of snapshot.protocols) {
    const cat = p.category ?? 'Uncategorised';
    if (p.change_7d !== null && Number.isFinite(p.change_7d)) {
      const list = changesByCat.get(cat) ?? [];
      list.push(p.change_7d);
      changesByCat.set(cat, list);
      allChanges.push(p.change_7d);
    }
    if (!isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      const list = multiplesByCat.get(cat) ?? [];
      list.push(ratio);
      multiplesByCat.set(cat, list);
      allMultiples.push(ratio);
    }
  }
  const globalMultiple = median(allMultiples) ?? 0.2;
  const globalChange = median(allChanges) ?? 0;
  const categoryMultiple = new Map<string, number>();
  for (const [cat, values] of multiplesByCat) {
    if (values.length >= MODEL.min_category_samples) {
      const m = median(values);
      if (m !== null && m > 0) categoryMultiple.set(cat, m);
    }
  }
  const categoryChange = new Map<string, number>();
  for (const [cat, values] of changesByCat) {
    const m = median(values);
    if (m !== null) categoryChange.set(cat, m);
  }
  return { categoryMultiple, globalMultiple, categoryChange, globalChange };
}

/** The market multiple for one protocol: its category's median, else the global median. */
export function marketMultiple(p: SnapshotProtocol, ctx: MarketContext): number {
  const cat = p.category ?? 'Uncategorised';
  return ctx.categoryMultiple.get(cat) ?? ctx.globalMultiple;
}

/** The category's median 7-day change, else the global median change. */
export function categoryMedianChange(p: SnapshotProtocol, ctx: MarketContext): number {
  const cat = p.category ?? 'Uncategorised';
  return ctx.categoryChange.get(cat) ?? ctx.globalChange;
}

/** A protocol's breakout tier, from its own 7-day change against the breakout lines. */
export function breakoutTier(p: SnapshotProtocol, relGrowth: number): string {
  const g = p.change_7d;
  if (g === null) return 'unverified';
  if (g >= MODEL.surge_pct) return 'surging';
  if (g >= MODEL.breakout_pct && p.tvl_usd >= MODEL.breakout_tvl) return 'breakout';
  if (relGrowth >= 15) return 'heating';
  if (g < -20) return 'cooling';
  return 'steady';
}

export interface ScoredProtocol {
  implied: number;
  marketMult: number;
  catChange: number;
  relGrowth: number;
  breakoutMult: number;
  runwayMult: number;
  age: number | null;
  tier: string;
}

/** The multipliers and the implied value one protocol gets under the model. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  ctx: MarketContext,
  model: ModelConstants = MODEL,
): ScoredProtocol {
  const marketMult = marketMultiple(p, ctx);
  const catChange = categoryMedianChange(p, ctx);
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const relGrowth = Math.min(model.rel_cap, Math.max(model.rel_floor, rawGrowth - catChange));
  let breakoutMult = 1 + (relGrowth / 100) * model.rel_weight;
  if (p.change_7d === null) {
    breakoutMult *= model.unverified_mult;
  } else if (p.change_7d >= model.surge_pct) {
    breakoutMult *= model.surge_bonus;
  } else if (p.change_7d >= model.breakout_pct && p.tvl_usd >= model.breakout_tvl) {
    breakoutMult *= model.breakout_bonus;
  }
  const runwayMult = age === null ? model.unknown_age_mult : 1 + (Math.min(age, model.runway_days) / model.runway_days) * model.runway_weight;
  const implied = Math.max(1, Math.round(p.tvl_usd * marketMult * breakoutMult * runwayMult));
  const tier = breakoutTier(p, relGrowth);
  return { implied, marketMult, catChange, relGrowth, breakoutMult, runwayMult, age, tier };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const ctx = marketContext(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols outside the watchlist, by implied value
  // under this model — volume breaking out, not just the biggest TVL below the
  // floor. A chosen protocol stays chosen; the watchlist is never displaced.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, ctx, model) }))
    .sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, ctx, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.s.age,
    breakout_tier: s.s.tier,
    implied_value_usd: s.s.implied,
    model: {
      market_multiple: round4(s.s.marketMult),
      category_median_change: round4(s.s.catChange),
      relative_growth_pct: round4(s.s.relGrowth),
      breakout_multiplier: round4(s.s.breakoutMult),
      runway_multiplier: round4(s.s.runwayMult),
      age_days: s.s.age,
    },
    farm_steps: farmStepsFor(s.p, s.s.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      s: p.slug,
      n: p.name,
      c: p.category,
      h: p.chains,
      t: p.tvl_usd,
      m: p.mcap_usd,
      g: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    r: row.rank,
    s: row.slug,
    n: row.name,
    c: row.category,
    h: row.chains,
    t: row.tvl_usd,
    g: row.change_7d,
    v: row.implied_value_usd,
    b: Math.round(row.model.breakout_multiplier * 1000),
    m: Math.round(row.model.market_multiple * 1000),
    u: Math.round(row.model.runway_multiplier * 1000),
    a: row.age_days,
    k: row.breakout_tier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    v: MODEL_VERSION,
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, the gate wants 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

// ---- Farm plans -----------------------------------------------------------
// The plan generator lives in dashboard/farm.js and is shared with the page:
// one source of truth, so the detail view shows exactly the steps board.json
// carries. main.ts imports that file for its side effect and reads it back
// off globalThis.

export interface FarmPlanApi {
  farmSteps: (p: {
    name: string;
    category: string | null;
    chains: string[];
    tvl_usd: number;
    change_7d: number | null;
    age_days: number | null;
  }) => string[];
}

function farmPlan(): FarmPlanApi {
  const api = (globalThis as unknown as { FarmPlan?: FarmPlanApi }).FarmPlan;
  if (!api) throw new Error('dashboard/farm.js did not register globalThis.FarmPlan');
  return api;
}

/** A protocol's farm plan: the shared generator's five steps, as board.json carries them. */
export function farmStepsFor(
  p: SnapshotProtocol,
  age: number | null,
): string[] {
  return farmPlan().farmSteps({
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: age,
  });
}
