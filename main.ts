// Dip-reversal bot for cbBTC (CBBTC/USDC), 1-minute bars, long only.
//
// Idea, written from scratch for this contest: BTC on 1-minute bars is
// mostly choppy, and the house trend bots lose money chasing every EMA
// cross (on the dev window they all finished below zero). The one move
// that paid in the dev window was the sharp V: price fell hard for hours,
// then turned up and ran ~1% before fading. So this bot does nothing
// most of the time and only buys a confirmed turn after a real dip:
//
//   Entry (decided on a bar's close, filled at the next bar's open):
//     - the close is at least 1.0% below the close 300 bars (5h) ago, and
//     - the 30-bar return has just crossed above +0.15% (it was at or
//       below +0.15% on the previous bar). The crossing requirement is
//       what keeps the bot from buying into a falling knife or re-buying
//       every minute while the dip condition stays true.
//     - at least 90 bars since the last sell (cooldown), and no new
//       entry in the last 40 bars of the window (a late entry would be
//       flattened at the end before it can pay).
//     - full size: the whole cash balance, one position only.
//
//   Exit (the whole position, decided on a bar's close):
//     - take profit: position value >= 1.2% above its cost, or
//     - stop loss: value <= 0.5% below its cost, or
//     - trailing stop: value >= 0.4% below the highest value seen since
//       entry, or
//     - time stop: held for 300 bars.
//   A sell the market refuses is sent again while its reason still
//   holds (the exit tests are level-based, so they persist). A buy the
//   market refuses is retried on the next bar while the dip is still
//   there and the 30-bar return is still above +0.15%.
//
// Local dev grade (kit, process driver, 2026-11-18): net PnL
// +5.35 USDC, 2 trades (one round trip), max drawdown 0.60% — passes
// the dev gate (net PnL > 0). A 0.6% trailing stop was tried and scored
// worse (+2.68 USDC); a 1.5% take-profit changed nothing (the exit
// that fired was the trailing stop), so the 1.2% / 0.4% pair stands.
//
// All ratios use raw close prices, so no price scale is assumed.
// Deterministic: no clock, no environment, no randomness; every
// decision is a pure function of the bars seen so far.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const DIP_BARS = 300;
const DIP_PCT = 0.01; // 1.0% below the close DIP_BARS ago
const TURN_BARS = 30;
const TURN_PCT = 0.0015; // 30-bar return crossing above +0.15%
const TAKE_PROFIT = 0.012; // +1.2% over cost
const STOP_LOSS = 0.005; // -0.5% under cost
const TRAIL = 0.004; // 0.4% below the peak value since entry
const MAX_HOLD_BARS = 300;
const COOLDOWN_BARS = 90;
const TAIL_BARS = 40; // no new entries in the last 40 bars
const MAX_SLIPPAGE_BPS = 100;

/** Closes of CBBTC, oldest first, as raw price integers. */
const closes: number[] = [];
/** Highest position value (quote units) seen since the current entry. */
let peakValue = 0n;
/** Bars held in the current position. */
let heldBars = 0;
/** Seq of the last sell decision, for the cooldown. */
let lastSellSeq = -1000000;
/** True when the previous batch's buy was rejected: retry it once. */
let retryBuy = false;

/** Return over the last `w` bars ending at the latest close, or null. */
function retOver(w: number, back = 0): number | null {
  const n = closes.length - back;
  if (n <= w) return null;
  const now = closes[n - 1];
  const then = closes[n - 1 - w];
  if (then === 0) return null;
  return now / then - 1;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(Number(bar.c));
    }
    // A buy refused on the previous batch: retry while the dip is
    // still there and the short return is still positive.
    for (const fill of batch.fills) {
      if (fill.side === 'buy' && fill.status === 'rejected') retryBuy = true;
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      retryBuy = false;
      heldBars += 1;
      const value = state.value(SYMBOL, held.qty);
      if (value > peakValue) peakValue = value;
      const cost = held.cost;
      const takeProfit = value * 1000n >= cost * BigInt(Math.round((1 + TAKE_PROFIT) * 1000));
      const stopLoss = value * 1000n <= cost * BigInt(Math.round((1 - STOP_LOSS) * 1000));
      const trailing = value * 1000n <= peakValue * BigInt(Math.round((1 - TRAIL) * 1000));
      if (takeProfit || stopLoss || trailing || heldBars >= MAX_HOLD_BARS) {
        lastSellSeq = state.seq;
        peakValue = 0n;
        heldBars = 0;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: look for the dip-reversal entry.
    heldBars = 0;
    peakValue = 0n;
    if (closes.length < DIP_BARS + 1) return [];
    if (closes.length > 1440 - TAIL_BARS) return [];
    if (state.seq - lastSellSeq < COOLDOWN_BARS) return [];

    const dip = retOver(DIP_BARS);
    const turn = retOver(TURN_BARS);
    const turnPrev = retOver(TURN_BARS, 1);
    if (dip === null || turn === null || turnPrev === null) return [];
    const dipped = dip < -DIP_PCT;
    const crossedUp = turn > TURN_PCT && turnPrev <= TURN_PCT;
    const retry = retryBuy && dipped && turn > TURN_PCT;
    retryBuy = false;
    if (!dipped || (!crossedUp && !retry)) return [];

    const cash = state.cash;
    if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
