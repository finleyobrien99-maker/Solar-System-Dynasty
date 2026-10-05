# Realm defence (Wave 5, slice 1): engine handoff to Codex

Claude, 5 October 2026, on `phase-0-foundations` from `71fb1e3`. Built to Codex's WAVE-5-CONTRACT.md: Claude's commit adds only new engine modules, an unregistered event and tests. **No shared file is edited.** War, AI, tick, types, save and UI wiring below is Codex's. Fin approved: sovereigns always answer, vassals get explained odds, a world attacked repeatedly unites, defenders send half their fleet.

## Files

| File | What |
|---|---|
| `src/game/diplomacyTypes.ts` | `RealmRole`, `Reason`, `RealmCallOffer`, `RealmCallAnswer` as in the contract. Answers also carry `rulerId` and `year`. |
| `src/game/realmDefence.ts` | Decisions, explanations and world unity. It never moves ships. |
| `src/game/eventsRealmDefence.ts` | `REALM_DEFENCE_EVENTS`: *The Realm Calls*, your own answer as a vassal. Not registered yet. |
| `src/game/realmDefence.test.ts` | 16 tests: who is called, purity, local feuds, revolt/independence, AI/player parity, blocks vs refusals, one roll per house, mandatory sovereigns (you included), your explicit answer and its revalidation, a finished war is inert, the event, unity and fading. |

## Rules

- **Who is called.** A territorial war (`claim`, `holy`, `conquest`, `feud`) from outside the defender's realm (`realmOf` follows the real liege chain, safe against cycles) calls every landed house of that realm, sovereign included. While the attacked world is **united**, every landed house of that world is called too (role `planet`), even independents and the sovereign's rivals. The attacker's own realm is never called.
- **Hard blocks are not refusals** (`answer: 'blocked'`, no grievance):
  - the ruler is a captive or a child, or a regent holds your seal;
  - ships are already lent (league `coalition` or `realmAid`), or the house is at war;
  - it has a truce with, or is allied to, the attacker (peace is honoured, never silently broken);
  - it has fewer than 2 ships.
- **Certain answers.** The sovereign, and every house of a united world, accept without a roll. The same rule applies to you: as sovereign you are bound, `answer: 'accepted'`, no choice.
- **Sworn houses** roll once with rng.ts at `DUTY 0.45`, adjusted by:

  | Factor | Effect |
  |---|---|
  | Loyalty to the liege (opinion ÷ 200) | ±0.3 |
  | Kin by marriage to the defender | +0.2 |
  | Kin by marriage to the attacker | −0.3 |
  | Hates the attacker | +0.15 |
  | Friendly with the attacker | −0.2 |
  | Brave | +0.1 |
  | Wrathful | +0.05 |
  | Honest | +0.05 |
  | Craven | −0.25 |
  | Deceitful | −0.1 |
  | Shares the attacker's faith in a holy war | −0.25 |
  | Same faith as the defender | +0.05 |

  The total is clamped to 0.05–0.95, and every factor appears in `reasons`. Loyalty to you uses the house's opinion of your house; between AI houses it is the rulers' personal opinion.
- **Your answer as a vassal** is `pending`, never rolled. `answerRealmCall(s, warId, accept, share?)`:
  - revalidates the war, your ruler, fleet, oaths and loans;
  - sets `proposedShips` (half, or `TOKEN_SHARE` 10%), `rulerId` and `year`;
  - returns the answer, or `undefined` with nothing changed.

  Refusing is always allowed.
- **Feelings are personal only** (house memory waits for Slice 2's writer):
  - a deliberate refusal: the direct liege's ruler feels `REFUSAL_GRIEVANCE −15`, or −5 for a token squadron;
  - accepting: the defender's ruler +10 towards the helper's ruler, and the helper's ruler −10 towards the attacker's ruler.
- **Unity.** `recordPlanetConquest(s, attackerId, region, cb)` counts only a real territorial settlement by a house of another world. `UNITY_CONQUESTS 2` such conquests, before they fade (one per `OUTRAGE_FADE 10` quiet cycles), unite the world for `UNITY_YEARS 10`. A same-world conquest doesn't count. State lives in flags `outrage:<planet>` and `united:<planet>`, behind `planetOutrageOf`, `unitedUntil`, `recordPlanetConquest` and `realmDefenceTick`. Move them into typed v9 state if you like; nothing else touches them.
- **Reads are pure.** `realmCallPreview`, `planetOutrageOf`, `unitedUntil`, `pendingRealmCall` and `answerBlocker` never write or roll. The tests check with JSON snapshots.

## Wiring (Codex)

1. **Types (v9).** Add to War and AiWar: `realmCalls?: RealmCallAnswer[]` and `realmAid?: FleetContribution[]`. `realmDefence.ts` already reads them through its local `RealmWar` type.
2. **Declarations.** In `declareWar` (you attack), `aiDeclareWar` (AI attacks you) and `declareHouseWar` (AI vs AI, cb `'conquest'`), after every check and payment:
   1. `const calls = realmCall(s, { warId, attackerId, defenderId, regionId, cb })`;
   2. reserve each `accepted` answer's `proposedShips` from that house's home fleet into `realmAid`;
   3. then `coalitionCall` with those houses excluded;
   4. save `calls` as `war.realmCalls`.

   Call `realmCall` once per war. It logs one news line about who came.
3. **Your answer.** After `answerRealmCall(..., true)` returns an accepted answer, reserve its `proposedShips` into that war's `realmAid`. Either wrap the call or edit the two accept effects in `eventsRealmDefence.ts`; those are the only callers. Register `REALM_DEFENCE_EVENTS` in `events.ts`.
4. **Fighting.** `realmAid` counts in `enemySide`, `playerSide` and `tickAiWars` like coalition ships. It shares losses, fatigue, commander snapshots and fates, truces for `sent > 0`, and return of survivors once. League expiry and withdrawal touch only `coalition`. Per the contract, remove the abstract liege shares: 40% in `enemySide`, 30% in `tickAiWars`. Dedupe your defensive vassal share against houses already in `realmAid`.
5. **Conquest.** Call `recordPlanetConquest` next to each `recordExpansion`: `war.ts` (twice) and `ai.ts` (once).
6. **Tick.** Call `realmDefenceTick(s)` once per Age Up.
7. **UI.**
   - **Declaring war:** show `realmCallPreview(s, s.playerClanId, owner, regionId, cb)` in System's region panel ("Who will defend House X": sovereign certain, vassals' odds, blockers).
   - **Realm war cards:** show `war.realmCalls`: role, answer, reasons (`label` plus optional `value`), proposed/sent/lost ships from `realmAid`.
   - **Battle reports:** label realm helpers apart from leagues.
8. **Harness.** Add per-run counts of realm answers by kind (accepted, refused, blocked, pending) and of unity events.

## Constants for Fin's review before release

`REALM_SHARE 0.5`, `TOKEN_SHARE 0.1`, `DUTY 0.45`, `UNITY_CONQUESTS 2`, `UNITY_YEARS 10`, `OUTRAGE_FADE 10`, `REFUSAL_GRIEVANCE −15`, `TOKEN_GRIEVANCE −5`, and the factor table above.

## Checks

- `npm run check` equivalents on this commit: typecheck, lint and format are clean; **715** unit tests pass (699 + 16 new), five fixture-writer skips. No shared file changed, so no old-save or browser behaviour changed.
- **Prototype measurement**, for direction only. It was built in a throwaway worktree with my own wiring, not committed, and its realm aid rode in `coalition`. Same 20 seeds × 150 against the regents baseline:

  | Bot | Baseline | Prototype |
  |---|---|---|
  | Passive endings by cycle 100 | 5% | 5% |
  | Breeder endings by cycle 100 | 5% | 5% |
  | Builder reaching Sovereign | 75% | 80% |
  | Warmonger reaching Sovereign | 100% | 100% |
  | Warmonger battles lost (median) | 8 | 10 |

  Events: 139 distinct, none over 3%. 1,000-run long simulations still survive 200 cycles.
- **Realm calls in 20 prototype games** (Builder and Warmonger): 359 of 1,065 wars called a realm, including 171 of the 243 wars the bots started. 478 houses answered with 17,012 ships in total, 319 stayed home and 429 were blocked. No world united.
- **Why the conquest targets barely move: fleet size, not rules.** A second prototype also called the other sworn houses to defend their liege's throne. It changed nothing for the Builder: the bots win independence first, and after that their attack on the throne is already an outside attack, so it is already covered. The real gap, median of 8 seeds:

  | Cycle | Warmonger fleet | AI median fleet | Biggest AI fleet | Warmonger credits |
  |---|---|---|---|---|
  | 50 | 635 | 48 | 119 | 2.7k |
  | 100 | 693 | 47 | 94 | 123k |

  The Builder has 413 ships at cycle 100. AI fleets shrink over time, while the bots' credits inflate. A whole realm answering with half its ships adds about 100. Realm defence matters for the feel of the game and in AI-against-AI wars, where fleets are comparable. To make conquest hard, AI houses need real economic and military growth (the parked `ai-spending` branch, or an AI fleet target scaled to holdings and treasury) and credit sinks. That is Fin's balance call.
