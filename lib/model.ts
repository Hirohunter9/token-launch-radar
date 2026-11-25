// Token Radar's valuation model: category-calibrated comparables, v2.
//
// A protocol with no token is valued the way markets value its peers that
// already trade: by the multiple the market pays per dollar of TVL in its
// own category. The multiple is computed from this snapshot, never from a
// hand-written list of names and never from a fixed constant.
//
//   multiple(cat) = the shrunk blend of the category's own median
//                   mcap/TVL and the global median: with n live comps in
//                   the category and a prior weight k = 3,
//                     used = (n x median + k x global) / (n + k),
//                   the category median clipped to [0.02, 2.5] first.
//                   A category with one live comp still speaks, at a
//                   quarter weight; a category with none falls back to
//                   the global median whole. v1's hard cliff (category
//                   median trusted at n >= 3, global below it) priced 21
//                   of 36 categories — including the board's top rows —
//                   off the global median even when their own live comp
//                   traded at a very different multiple.
//
//   growth    = clamp(change_7d, -50, +100) per cent
//   growthMult = 1 + (growth / 100) * 0.4 when growth is up,
//                1 + (growth / 100) * 0.6 when growth is down:
//                TVL fleeing over seven days weighs more than TVL
//                arriving, because flight is the stronger signal.
//   maturity  = 0.60 + 0.40 * (1 - e^(-age_days / 365))
//               (age unknown: 365 days — the middle of the range)
//               The first year running with no token is the endurance
//               signal; after that the factor saturates instead of
//               climbing on a straight ramp to 1.20.
//   breadth   = 1 + 0.03 * min(chains - 1, 10)
//   implied   = max(1, round(min(tvl * multiple * growthMult
//                   * maturity * breadth, 5 * tvl)))
//
// Why this shape: TVL is the one hard figure the snapshot gives for every
// protocol, and market-cap-per-TVL is the multiple practitioners use for
// deposit-driven businesses (lending, staking, DEXs). Growth and age are
// the snapshot's own momentum and endurance signals: a protocol still
// growing after years with no token is the one whose launch would be
// worth the most. Chain breadth is a small diversification premium — a
// protocol live on many chains is less exposed to any one of them.
//
// What the model refuses to do: it never values a protocol from a launch
// FDV (Blast's $2B, zkSync's ~$700M, Magic Eden's $15B-then-$4.2B show
// launch prices are set by low-float dynamics, not fundamentals), it never
// invents revenue or fees the snapshot does not carry (so no DCF), and it
// never mixes live-token protocols into the ranking — their market caps
// are facts, shown apart, never a model's output.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Prior weight: a category's own median counts as this many live protocols in the blend. */
  shrinkage_prior: number;
  /** The multiple is clipped to this range after shrinkage. */
  multiple_floor: number;
  multiple_cap: number;
  /** Growth's weight when the 7-day change is up. */
  growth_weight_up: number;
  /** Growth's weight when the 7-day change is down: flight weighs more than inflow. */
  growth_weight_down: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity's floor and range; the first year without a token is the endurance signal. */
  maturity_floor: number;
  maturity_range: number;
  /** Days for the maturity curve to reach ~63% of its range. */
  maturity_tau_days: number;
  /** Age assumed when the snapshot records no listing date. */
  unknown_age_days: number;
  /** Breadth premium per extra chain, capped at ten extra chains. */
  breadth_step: number;
  breadth_cap_chains: number;
  /** Implied value never exceeds this many times TVL. */
  implied_cap_multiple: number;
}

export const MODEL: ModelConstants = {
  shrinkage_prior: 3,
  multiple_floor: 0.02,
  multiple_cap: 2.5,
  growth_weight_up: 0.4,
  growth_weight_down: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_tau_days: 365,
  unknown_age_days: 365,
  breadth_step: 0.03,
  breadth_cap_chains: 10,
  implied_cap_multiple: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-comps-2';

/** A live-token protocol the board sets aside, at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  /** Market cap per dollar of TVL, the multiple the market pays. Null without both figures. */
  mcap_per_tvl: number | null;
}

/** One category's comparables: what the market pays its live tokens. */
export interface CompsRow {
  category: string;
  /** Live protocols in the category carrying both a market cap and TVL. */
  n: number;
  /** Their median market-cap-per-TVL, or null when there are none. */
  median: number | null;
  /** The multiple the model actually used for this category. */
  used: number;
  /** Share of the blend the category's own median carries, 0 when it has no live comps. */
  weight: number;
  /** Whether the multiple is the shrunk blend or the global median alone. */
  source: 'shrunk' | 'global';
}

/** A live peer shown beside a board row's detail view. */
export interface PeerRow {
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

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
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_n: number;
    multiple_source: 'shrunk' | 'global';
    multiple_weight: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  multiple_n: number;
  multiple_source: 'shrunk' | 'global';
  multiple_weight: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  /** True when the snapshot's watchlist names this protocol. */
  on_watchlist: boolean;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist_tvl_usd: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Median multiple across every live protocol carrying both figures. */
  global_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
  comps: CompsRow[];
  /** Top live peers per category, by market cap, for the detail view. */
  peers: Record<string, PeerRow[]>;
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

/** The median of a non-empty list, or null when it holds nothing. */
export function median(values: number[]): number | null {
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

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * Whether a protocol is one the board may rank: pre-token, not a
 * centralised exchange (its token would be equity, not a launch), and not
 * a versioned pool of a protocol that may already have a token.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Categories the house's watchlist rule keeps out: a bridge, a staked product, a wrapper, an exchange. */
const EXCLUDED_CATEGORY = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
  'Stablecoin Wrapper',
]);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol above the floor may still join the board: it passes
 * the house's own watchlist exclusions (category, version marker, wrapped
 * word, exchange name). The snapshot carries no parent-protocol field, so
 * that part of the house's rule cannot be applied from here — and the
 * rules say a protocol the watchlist leaves out is no worse a subject.
 */
export function passesWatchlistRule(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The comparables table: every category's live median, and the global one. */
export function buildComps(snapshot: Snapshot, model: ModelConstants = MODEL): { comps: CompsRow[]; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.tvl_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const clip = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const globalMedian = median(all) ?? 0.2;
  const global = clip(globalMedian);
  const comps: CompsRow[] = [];
  for (const key of [...byCategory.keys()].sort()) {
    const list = byCategory.get(key)!;
    const med = median(list);
    // Shrinkage (credibility blend): the category's own median counts as
    // n live protocols against a prior of `shrinkage_prior` at the global
    // median. One live comp still speaks, at a quarter weight; the median
    // is clipped before it enters the blend, so one wild ratio (a 400x
    // prediction-market comp) cannot drag the blend with it.
    const weight = list.length / (list.length + model.shrinkage_prior);
    const clipped = med === null ? null : clip(med);
    const used = clipped === null ? global : weight * clipped + (1 - weight) * global;
    comps.push({ category: key, n: list.length, median: med, used, weight, source: clipped === null ? 'global' : 'shrunk' });
  }
  return { comps, global };
}

/** The multiple one category gets, from the comparables table. */
export function multipleFor(category: string | null, comps: CompsRow[], global: number): { multiple: number; n: number; source: 'shrunk' | 'global'; weight: number } {
  const row = comps.find((c) => c.category === (category ?? 'Other'));
  if (row === undefined) return { multiple: global, n: 0, source: 'global', weight: 0 };
  return { multiple: row.used, n: row.n, source: row.source, weight: row.weight };
}

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthWeight = growthPct >= 0 ? model.growth_weight_up : model.growth_weight_down;
  const growthMult = 1 + (growthPct / 100) * growthWeight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days));
  const extraChains = Math.max(0, Math.min(protocol.chains.length - 1, model.breadth_cap_chains));
  const breadthMult = 1 + model.breadth_step * extraChains;
  const raw = protocol.tvl_usd * multiple * growthMult * maturityMult * breadthMult;
  const implied = Math.max(1, Math.round(Math.min(raw, protocol.tvl_usd * model.implied_cap_multiple)));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { comps, global } = buildComps(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whatever its category.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the floor.
  // No TVL cut beyond the snapshot's own $5M line — the radar exists to
  // find the early ones, and a small protocol growing fast outranks a big
  // one standing still once the multiples are applied.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);
  // Above the floor, the watchlist is not the whole story: rankable
  // pre-token protocols it leaves out join when they pass the house's own
  // exclusion rule — a bridge or a staked product never does. v1 missed
  // 18 of them, including the snapshot's largest pre-token protocol.
  const above = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd && passesWatchlistRule(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of above) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { multiple, n, source, weight } = multipleFor(p.category, comps, global);
    const { implied, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, multiple, model);
    return { p, implied, multiple, n, source, weight, growthPct, growthMult, maturityMult, breadthMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.multiple),
      multiple_n: s.n,
      multiple_source: s.source,
      multiple_weight: round4(s.weight),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 2_000_000_000) return 300;
  if (p.tvl_usd >= 500_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 90) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the loan market open.`;
  if (c.includes('dex') || c.includes('amm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm')) return `Deposit $${capital} into ${name}'s main yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in an open market on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** Typical gas for one transaction on a chain: mainnet costs real money, L2s and fast chains do not. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 of gas';
  if (chain === 'Solana' || chain === 'Stellar' || chain === 'Provenance') return 'under $0.10 of gas';
  return 'about $0.50 of gas';
}

/** The weekly action, in the words a farmer can follow: it repeats the protocol's own activity, by category. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Adjust the supply or the borrow on ${name} once a week so the position stays active.`;
  if (c.includes('dex') || c.includes('amm')) return `Swap a small amount through ${name}'s pools once a week and keep the liquidity in range.`;
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm')) return `Claim or restake the vault yield on ${name} once a week and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge a small amount through ${name} once a week so the route stays warm.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Restake the staking rewards on ${name} once a week and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close and reopen one small hedged position on ${name} once a week.`;
  if (c.includes('prediction')) return `Settle one market a week on ${name} and take a fresh position.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Rebalance into ${name}'s newest allocation once a week.`;
  if (c.includes('stable')) return `Top up or rotate the stable position on ${name} once a week.`;
  if (c.includes('rwa')) return `Check the asset's yield accrual on ${name} once a week and hold.`;
  if (c.includes('insurance')) return `Renew or extend the cover on ${name} once a week so the policy never lapses.`;
  if (c.includes('basis')) return `Roll the basis position on ${name} once a week.`;
  return `Do one qualifying action every week, such as a deposit, a borrow, a swap or a governance vote.`;
}

/** Where the rewards are claimed, by category: the protocol's own page, never a link from elsewhere. */
function claimFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex') || c.includes('amm')) return `Before you withdraw, open ${name}'s pool rewards page from its official site and claim the trading fees only from the link it publishes.`;
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm')) return `Before you withdraw, open ${name}'s vault rewards page from its official site and claim the yield only from the link it publishes.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Before you withdraw, open ${name}'s bridge rewards page from its official site and claim only from the link it publishes.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Before you withdraw, open ${name}'s staking rewards page from its official site and claim the staking rewards only from the link it publishes.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Before you withdraw, open ${name}'s trading rewards page from its official site and settle the funding only from the link it publishes.`;
  if (c.includes('prediction')) return `Before you withdraw, open ${name}'s market settlement page from its official site and claim winnings only from the link it publishes.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Before you withdraw, open ${name}'s lending rewards page from its official site and claim only from the link it publishes.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Before you withdraw, open ${name}'s vault rewards page from its official site and claim only from the link it publishes.`;
  return `Before you withdraw, open the protocol's own rewards page from its official site and claim only from the link it publishes.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list of names. Three of the six
 * steps vary by category — the entry action, the weekly action and the
 * claim — and every gas cost follows the chain the position sits on. It
 * never promises an airdrop: a protocol records no token, and a token may
 * never come.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, chain),
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: claimFor(p),
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates and every transaction, and set a reminder to review the position before any announced snapshot.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_per_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The top live peers of each category, by market cap, for the detail view. */
export function peersByCategory(snapshot: Snapshot): Record<string, PeerRow[]> {
  const byCategory = new Map<string, PeerRow[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.tvl_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push({ name: p.name, mcap_usd: p.mcap_usd, tvl_usd: p.tvl_usd, ratio: round4(p.mcap_usd / p.tvl_usd) });
    byCategory.set(key, list);
  }
  const out: Record<string, PeerRow[]> = {};
  for (const [key, list] of byCategory) {
    out[key] = list.sort((a, b) => b.mcap_usd - a.mcap_usd).slice(0, 5);
  }
  return out;
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    multiple_n: row.model.multiple_n,
    multiple_source: row.model.multiple_source,
    multiple_weight: row.model.multiple_weight,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    on_watchlist: onWatchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { comps, global } = buildComps(snapshot, model);
  const live = liveRows(snapshot);
  const watchlistSet = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlistSet.has(r.slug)).length;
  const watchlistTvl = snapshot.protocols
    .filter((p) => watchlistSet.has(p.slug))
    .reduce((sum, p) => sum + p.tvl_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist_tvl_usd: watchlistTvl,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(global),
    rows: board.map((r) => radarRow(r, watchlistSet.has(r.slug))),
    live,
    comps,
    peers: peersByCategory(snapshot),
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
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
