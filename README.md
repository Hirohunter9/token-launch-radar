# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hirohunter9/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hirohunter9/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols in a sealed DefiLlama snapshot by the implied value of a launch, priced from the median market-cap-per-TVL of live tokens in the same category, and gives each one a farm plan. The board carries 226 rows: the 40-protocol watchlist plus 186 pre-token protocols below the $50M TVL floor. A static dashboard (ranked board, top-10 spotlight, search, category, chain and watchlist filters, per-protocol detail with the model's own factors, its live peers and its farm plan) sits beside a deterministic Node program that rebuilds the board from the snapshot.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=53e2c3qk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
