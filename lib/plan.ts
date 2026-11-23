// The farm plans: what a reader does about one row of the board.
//
// A plan is derived from the protocol's own record — its category decides the core actions, its
// first chain decides the gas note, its TVL decides the capital tier, its tracked age decides the
// holding window — and from the row's own valuation: the plan names the implied pool it is farming
// toward and prices itself, in cash and in hours, so the board can divide one by the other. Every
// step carries its cost and its time in the step's own words; the plan's totals are the sum of the
// same figures, not a second set of numbers.
//
// The plans say what the record supports. The protocol records no token in the snapshot, so a plan
// farms the activity a launch would most plausibly reward; it never promises a token, an
// allocation or a date.

import type { SnapshotProtocol, ValueTerms } from './model.ts';

/** One farm step: the action, what it costs in cash, and how long it takes. */
export interface FarmStep {
  text: string;
  cost_usd: number;
  cost_note: string;
  time_note: string;
  minutes: number;
}

/** A step as board.json carries it: one string, action then cost then time, 20 to 600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost_note}. Time: ${step.time_note}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** One transaction's rough cash cost on a chain, in dollars, as the plan budgets it. */
export function gasUsd(chain: string): number {
  if (chain === 'Ethereum') return 8;
  if (chain === 'Solana') return 0.05;
  if (chain === 'Bitcoin') return 2;
  return 0.5;
}

/** A chain's gas cost in words a farmer can budget. */
export function gasNote(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 of Ethereum gas at a quiet time';
  if (chain === 'Solana') return 'a few cents of Solana fees';
  if (chain === 'Bitcoin') return 'about $2 of Bitcoin fees';
  return `under $1 of gas on ${chain}`;
}

/** How much capital one farm position carries, tiered by the protocol's own TVL. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  if (tvlUsd >= 25_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's tracked age: younger protocols get a longer window. */
export function holdDaysFor(ageDays: number | null): number {
  if (ageDays === null) return 30;
  if (ageDays < 180) return 60;
  if (ageDays < 365) return 45;
  return 30;
}

/** Whole dollars, short form, for plan text. */
function usd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** The category's two core actions: what to open, then what to repeat so the account reads as use. */
function coreActions(p: SnapshotProtocol, capital: number, chain: string): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) {
    return [
      `Supply $${capital} of USDC to ${name} on ${chain} and leave the supply position open.`,
      `Borrow about a third of the supplied value against it, hold the borrow for a week, then repay; repeat the borrow once a month so the account shows real use, and keep the health factor above 1.6 at all times.`,
    ];
  }
  if (c.includes('dex') || c.includes('trading')) {
    return [
      `Provide $${capital} split between USDC and the pool's other asset in ${name}'s main ${chain} pool and keep the LP position open.`,
      `Make two swaps a week through ${name}'s own interface, about $${Math.max(20, Math.round(capital / 5))} each way, so the wallet builds trade volume as well as liquidity.`,
    ];
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) {
    return [
      `Deposit $${capital} of USDC as margin on ${name} and open one small position, no more than 2x, sized so a 20% move cannot liquidate it.`,
      `Close and reopen a hedge once a week, alternating long and short, so the account records trading days in more than one week of the season.`,
    ];
  }
  if (c.includes('bridge')) {
    return [
      `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}.`,
      `Bridge a smaller amount back a week later, and use some of the bridged funds in one app on ${chain} before you return, so both directions and the destination chain see real activity.`,
    ];
  }
  if (c.includes('staking') || c.includes('restak')) {
    return [
      `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`,
      `Claim any staking rewards from ${name}'s own page once a month and restake them, so the position compounds and the claim history grows.`,
    ];
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return [
      `Deposit $${capital} into one of ${name}'s curated vaults on ${chain} and keep the vault shares in the wallet.`,
      `Add a small top-up, about a tenth of the first deposit, every second week, so the account shows steady use rather than a single visit.`,
    ];
  }
  if (c.includes('yield') || c.includes('farm') || c.includes('liquidity')) {
    return [
      `Deposit $${capital} into ${name}'s main vault on ${chain} and keep the shares.`,
      `Harvest the vault's rewards from its own page once a month and redeposit them into the same vault, so the yield compounds in the same wallet.`,
    ];
  }
  if (c.includes('stable')) {
    return [
      `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`,
      `Provide about half of it as liquidity in the stable asset's main pool, so the wallet both holds and uses the asset.`,
    ];
  }
  if (c.includes('rwa')) {
    return [
      `Subscribe $${capital} to ${name}'s yield asset on ${chain}, completing any eligibility check its own site asks for, and hold the asset.`,
      `Hold through at least two of the asset's distribution dates and claim each distribution from ${name}'s own page.`,
    ];
  }
  if (c.includes('basis')) {
    return [
      `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`,
      `Leave the position untouched for a full month before the first top-up, so the account's holding period is unambiguous.`,
    ];
  }
  if (c.includes('prediction')) {
    return [
      `Fund $${capital} on ${name} and place one position in its most liquid market.`,
      `Place one position a week in a different market each time, sized under a tenth of the fund, so the account reads as a user and not as a single bet.`,
    ];
  }
  if (c.includes('insurance')) {
    return [
      `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy to its expiry.`,
      `Stake a smaller amount into ${name}'s underwriting pool as well, if it offers one, so the account appears on both sides of the market.`,
    ];
  }
  if (c.includes('chain')) {
    return [
      `Bridge $${capital} of USDC onto ${name} and make it the wallet's home chain for this farm.`,
      `Transact on ${name} every week: one swap, one contract interaction and one transfer out, so the wallet's activity spreads across real use.`,
    ];
  }
  return [
    `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    `Use one more of ${name}'s own features each week — a second deposit, a vote or a claim — so the account shows more than a single visit.`,
  ];
}

/** A plan's totals: the cash it burns (capital excluded — capital is held, not spent) and its hours. */
export interface PlanTotals {
  cash_cost_usd: number;
  hours: number;
  capital_usd: number;
  hold_days: number;
}

/**
 * A protocol's farm plan: seven steps. The plan opens with the wallet, runs the category's two
 * core actions on a weekly cadence for the holding window its age sets, and closes with the record
 * keeping that makes any later claim provable. One step is the valuation step: it states the row's
 * implied pool and the plan's own cash cost side by side, which is the board's efficiency lens.
 */
export function farmPlan(p: SnapshotProtocol, terms: ValueTerms): { steps: FarmStep[]; totals: PlanTotals } {
  const chain = chainOf(p);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(terms.age_days);
  const gas = gasUsd(chain);
  const weeks = Math.max(2, Math.round(hold / 7));
  const [core1, core2] = coreActions(p, capital, chain);
  const weeklyGas = gas * 3;
  const steps: FarmStep[] = [
    {
      text: `Set up one fresh wallet for ${p.name} alone, fund it from an exchange withdrawal, and keep its seed phrase offline; one wallet per protocol keeps every farm separable and auditable.`,
      cost_usd: 3,
      cost_note: 'under $3 to fund and make the first transaction',
      time_note: '10 minutes',
      minutes: 10,
    },
    {
      text: core1,
      cost_usd: gas,
      cost_note: `$${capital} of capital (held, not spent) and ${gasNote(chain)}`,
      time_note: '15 minutes to set up',
      minutes: 15,
    },
    {
      text: core2,
      cost_usd: gas * 2,
      cost_note: `${gasNote(chain)} per action, plus the capital already in`,
      time_note: '10 minutes a week',
      minutes: 10,
    },
    {
      text: `Keep a weekly cadence for ${hold} days: the core actions above, one governance or community action whenever ${p.name} opens one, and nothing in bursts on a single day, which reads as farming rather than use.`,
      cost_usd: Math.round(weeklyGas * weeks * 100) / 100,
      cost_note: `about $${Math.max(1, Math.round(weeklyGas))} of gas a week on ${chain}, ${weeks} weeks in all`,
      time_note: '15 minutes a week',
      minutes: 15,
    },
    {
      text: `Hold every position for at least ${hold} days so the activity appears in more than one weekly snapshot of the protocol's books; most points and activity programs count snapshots, not visits.`,
      cost_usd: 0,
      cost_note: `the $${capital} stays in the position; nothing further is spent`,
      time_note: `${hold} days`,
      minutes: 0,
    },
    {
      text: `Size the effort to the radar's own figures: this board values a ${p.name} launch at ${usd(terms.implied_fdv_usd)} of FDV, an implied community pool of ${usd(terms.implied_pool_usd)} at a ${(terms.allocation_share * 100).toFixed(0)}% allocation. ${p.name} records no token in this snapshot, so before you withdraw, open its own points or rewards page if it has one and screenshot your balance; a points page is a record of activity, not a promise of a token.`,
      cost_usd: 0,
      cost_note: 'nothing to check, and never pay anyone to claim for you',
      time_note: '10 minutes',
      minutes: 10,
    },
    {
      text: `Log the wallet, the dates and every transaction hash in a farm log; if a token is ever announced, claim only from the link the protocol publishes on its own site, and unwind the position once any claim window you qualify for has closed.`,
      cost_usd: 0,
      cost_note: 'nothing but the log',
      time_note: '5 minutes',
      minutes: 5,
    },
  ];
  const cash = Math.round(steps.reduce((a, s) => a + s.cost_usd, 0) * 100) / 100;
  const minutes = steps.reduce((a, s) => a + s.minutes, 0) + 10 * (weeks - 1);
  return { steps, totals: { cash_cost_usd: cash, hours: Math.round((minutes / 60) * 10) / 10, capital_usd: capital, hold_days: hold } };
}
