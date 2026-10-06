# AI fleet growth: measured options (Fin's balance call)

Claude, 6 October 2026. These are prototypes only: they were built in throwaway worktrees and nothing is committed to the game. Base: `11ee230` (realm defence wired at `c702d52`; slice 2 not wired).

## The gap

- **AI fleet targets** (`world.ts` `fleetTarget`) are `18 + 16 × regions + 2.5 × development + 40 if sovereign + 5 × vassals`.
- **Your fleet cap** (`economy.ts` `fleetCap`) is `60 + 35 × regions + 40 × rank`.
- With three regions, an AI house aims for about 104 ships, while your cap is 245. AI houses build ships for free and keep 30% of their income.
- By cycle 50 the Warmonger bot has a median of 635 ships, against a median AI house's 48 (the biggest has 119).

## The prototype

The AI target moves part of the way towards your own cap for the same land: `old + parity × (cap − old)`. Same 20 seeds × 150 cycles, all four bots (80 games each):

| Parity | Builder Sovereign (target ~30%) | Warmonger Sovereign (target ~50%) | Passive ended by 100 (5–15%) | Breeder ended by 100 (<5%) | Builder credits at end |
|---|---|---|---|---|---|
| 0 (today) | 80% | 100% | 5% | 5% | 286k |
| 0.3 | 40% | 100% | 10% | 5% | 81k |
| **0.4** | **25%** | **85%** | **10%** | **10%** | **65k** |
| 0.5 | 10% | 85% | 10% | 10% | 46k |
| 1.0 | 0% | 65% | 20% | 10% | 19k |

Every variant keeps events under the 3% cap (139 distinct). With only 20 runs per bot, each figure is about ±10 points.

## Reading it

- **Around 0.4 the Builder lands on target**, passive survival stays in band, and credit hoards shrink to about a quarter. The Builder bot stops picking fights it cannot win: median battles won drop from 32 to 5.
- **The Warmonger stays high (85%).** It wins by out-fighting single houses. Its battle losses rise from 12.5 to 16, so the next levers are war exhaustion, coalitions and the slice 2 pacts, not more AI ships.
- **The Breeder's dynasty ends a little more often (5% → 10%).** Bigger AI fleets make AI aggression against you more dangerous.
- **AI ships stay free in these prototypes.** A fuller version would have AI houses pay for and upkeep their fleets from the 30% income they keep. That needs economy changes (the parked `ai-spending` branch did part of this).

## To ship it

Change one number in `fleetTarget` (`world.ts`, the war lane's file), plus a constant. Measure again with slice 2 wired, because non-aggression pacts will also cut wars.
