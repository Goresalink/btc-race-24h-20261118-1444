[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Goresalink/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Goresalink/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

# Dip-Reversal cbBTC Bot

Entry for the make.fun bounty
[btc-race-24h-20261118-1444](https://make.fun/bounty/btc-race-24h-20261118-1444):
a bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by
minute, on a replay of on-chain prices, starting with 1,000 USDC of
paper money. Long only, no leverage, no shorts, at most one open
position.

## Strategy

Most 1-minute BTC trend signals are noise — on the published dev window
every house trend bot finished below zero. This bot stays in cash most
of the time and only buys a confirmed turn after a real dip:

- **Entry:** the close is at least 1.0% below the close 300 bars (5h)
  ago, **and** the 30-bar return has just crossed above +0.15%.
- **Exit:** take profit at +1.2% over cost, stop loss at −0.5% under
  cost, trailing stop 0.4% below the peak value since entry, or a
  300-bar time stop. Full size (100% of cash) on every entry, with a
  90-bar cooldown after each sell and no new entries in the last 40
  bars of the window.

## Local dev grade

Graded on the kit's frozen dev window with the kit's own grader
(`grade-local`, process driver):

- **Net PnL: +5.35 USDC** (passes the dev gate, net PnL > 0)
- Trades: 2 (one round trip) · Max drawdown: 0.60% · Fees: 0.80 USDC

## The program

`main.ts` (Node 22, TypeScript erasable syntax, stdlib only) speaks the
`agent-fun/bars-replay/v1` protocol via the kit's SDK shim, copied
byte-for-byte into `vendor/makefun-bars.ts`. It reads no clock, no
environment and no network, uses no randomness, and is deterministic:
the same bars always give the same orders.

## Run

```sh
node /bot/main.ts   # the grader runs this; stdin/stdout are NDJSON
```
