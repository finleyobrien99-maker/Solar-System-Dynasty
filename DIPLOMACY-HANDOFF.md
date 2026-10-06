# Wave 5 slice 2, house relations and treaties: engine handoff to Codex

Claude, 6 October 2026, on `phase-0-foundations` (from `c702d52`). Built to WAVE-5-CONTRACT.md while you revise slice 1 in the UI worktree. This commit adds only new modules, two appended types, an unregistered event, a standalone section and tests. **No shared file is edited**: no realmDefence.ts, war.ts, ai.ts, tick.ts, types.ts, save.ts, economy.ts or screens. Fin said "do what you think and continue".

## What it adds in play

- **Every house regards every other house, with reasons** (`houseRelation(s, from, to)`, -100 to 100).
  - **AI towards AI:** half the rulers' personal regard, share a world +8 or neighbouring worlds +3, share a faith +5, bound by marriage +15, the houses' own memories of each other, trust ÷ 4, treaties, at war −40, and a little wariness of a far greater neighbour.
  - **AI towards you:** the existing `Clan.opinion` is the one authority, used as is. It already includes the house's memories of you, so nothing is copied or counted twice. Trust, treaties and war are added on top.
- **AI houses remember each other** (`rememberHouse`, `houseMemoriesOf`, `houseMemorySum`). It is a sparse, one-directional record with memory.ts rules: −40 or worse is grave and fades at most 0.8% a cycle, and while a grave grudge of −20 or worse stands, favours count for a quarter. At most 6 per pair. A memory *of you* goes through memory.ts `remember`, unchanged. You keep no house memories.
- **Trust**, from −100 to 100 per direction, neutral until houses deal with each other. It grows +2 each way per cycle while any treaty holds, at most once per pair per cycle, and +5 when a treaty runs its full course.
- **Five treaties.** Each has terms and an end; `a` is the stronger side for guarantee and tribute.

  | Treaty | Effect | Cycles |
  |---|---|---|
  | Non-aggression pact | Neither declares war on the other | 10 |
  | Defensive pact | Each defends the other | 10 |
  | Trade agreement | Each earns `6 + 2 × min rank` credits a cycle | 10 |
  | Guarantee | `a` defends `b` against anyone | 15 |
  | Tribute | `b` pays `a` `15 + 10 × rank` a cycle; `a` swears not to attack `b` and defends it | 10 |

  A guarantor or tribute recipient must have 1.5× the other side's ships. At most 8 treaties per house.
- **Making them.**
  - **Your offer to an AI house** is answered at once, with one roll at explained odds (`treatyAcceptance`), and then you wait a cycle before trying that house again. Odds combine:
    - a base for the kind;
    - fear of your fleet, or a much stronger house "keeping its options open";
    - designs on your lands;
    - greed;
    - a shared enemy;
    - how the house regards you, and how far it trusts you;
    - paranoia.
  - **An AI offer to you** waits as a proposal for two cycles. *Envoys at Court* (`treaty_offer`, urgent) lets you accept, which revalidates the terms, or decline, a small −5 memory. At most two offers wait at once, and a new envoy comes at most every three cycles.
  - **Between AI houses:** one roll.
- **Breaking them** (`breakTreaty`). A broken promise sets back:
  - the victim's trust in the breaker by 60;
  - every other landed house's trust in the breaker by 15;
  - your prestige by 50, when you are the breaker.

  It also records a grave memory for abandoning a defensive pact or guarantee (−45), or −30 for other promises, plus an `oathsBroken` deed. Ending a trade agreement early costs less (−20 and −5). `treatyWarBlocker(s, attacker, defender)` stops a declaration under a non-aggression pact, a defensive pact, a guarantee you give, or tribute you receive. `breakTreatiesForWar` breaks all of them when you (or an AI) declare anyway.
- **Defending a partner** (`pactDefenders(s, defender, attacker)`). Defensive partners, a guarantor and a tribute recipient are called, each with half their available fleet. An AI partner answers at 85%, adjusted by temperament and regard; you are asked (`yours`). Blocked, without breach: captive, child or regent, sworn to the attacker's realm, sworn peace with the attacker, already at war or lending ships, too few ships. A partner who stays home has broken the treaty (`pactRefused`).
- **AI houses make their own deals.** Each cycle, each landed AI house has a 12% chance to look for one. `bestDeal` lists what it wants (relation, fear, common enemies, greed, ambition) and weighs its top four options by the other side's odds, so it never asks a hostile giant for a pact. Defensive pacts and guarantees are only between different realms; a realm already binds its own houses.
  - **What it produces:** over six Builder games of 100 cycles it signed 138 non-aggression pacts, 91 trade agreements, 10 guarantees and 8 defensive pacts, about 5 live at a time, with an offer to you every few cycles. `diplomacyTick` costs about 3 ms a cycle.
- **Money.** `diplomacyTick` settles AI houses' side of trade and tribute. Your side is `diplomacyCreditLines(s)`, so the economy screen shows every credit.

## Files

| File | What |
|---|---|
| `diplomacyTypes.ts` | Adds `TreatyKind`, `TreatyTerms`, `Treaty`, `TreatyProposal`, `HouseMemory`, `DiplomacyState`. The realm-call types are unchanged. |
| `houseRelations.ts` | `diplomacyOf`, `ensureDiplomacy`, `migrateDiplomacy`, trust, house memories, `houseRelation`, `treatiesBetween`, `neighbours`, `mightOf`. |
| `treaties.ts` | Blockers, acceptance, proposing and answering, breaking, war blockers, pact defenders, money, AI deals, `diplomacyTick`. |
| `eventsDiplomacy.ts` | `DIPLOMACY_EVENTS` (*Envoys at Court*), not registered. |
| `ui/sections/HouseDiplomacySection.tsx` | Standalone, not mounted. A foreign house shows its regard for you with reasons, trust both ways, the treaties between you with Break, and offers with odds and reasons. Your own house lists your treaties. |
| `treaties.test.ts` | 19 tests: relations and their reasons, a single authority for opinion of you, grave memories, purity, migration, blockers, your offers vs AI offers, revalidation, lapse, trust once a cycle, breach costs, war blockers, tribute, pact defenders (blocks, your choice), money, AI deals (deterministic, live houses only, at most 8), the frightened tribute offer, and the event. |

## Wiring (yours)

1. **Save.** Add `GameState.diplomacy?: DiplomacyState`, and call `migrateDiplomacy(s)` in whichever version migration you choose. Old saves start with no treaties, neutral trust and no invented history. `clan.allied`, truces, trade routes and `clan.memories` are untouched and stay authoritative.
2. **Tick.** Call `diplomacyTick(s)` once per Age Up, after `peaceTick` and before the AI tick, so new pacts hold this cycle.
3. **Declarations.**
   - `warBlocker` / `declareWar(..., breakOath)`: on `treatyWarBlocker`, either block or, on an explicit break, `breakTreatiesForWar`.
   - `aiDeclareWar` and `declareHouseWar`: AI respects `treatyWarBlocker` unless it chooses to betray (as `aiMayBreakTruce` does), in which case `breakTreatiesForWar`.
   - `startAiWar` and `aggressionOnPlayer`: filter out pact-protected targets the same way.
4. **Realm call.** Merge `pactDefenders(s, defender, attacker)` into `realmCall`'s answers, with a role such as `'pact'` and the `treatyId` kept. Reserve the ships of accepted answers as you do `realmAid`. On `refused`, call `pactRefused(s, clanId, treatyId)`; your own refusal through *The Realm Calls* likewise.
5. **Economy.** Add `diplomacyCreditLines(s)` to `creditLines`.
6. **Events.** Register `DIPLOMACY_EVENTS`.
7. **Screens.**
   - Mount `HouseDiplomacySection clanId={id}` in ClanModal; for your own house it lists your treaties.
   - The Houses view can show `houseRelation(s, id, player).value` and `treatiesOf`.
8. **Harness.** Count treaties signed and broken by kind.

## Constants for Fin's review

| Constant | Value |
|---|---|
| `TREATY_YEARS` | see table above |
| `MAX_TREATIES` | 8 |
| `TRUST_PER_CYCLE` | 2 |
| `TRUST_ON_COMPLETION` | 5 |
| `BREACH_VICTIM` / `BREACH_EVERYONE` | −60 / −15 |
| Trade breach (victim / everyone) | −20 / −5 |
| `BREACH_PRESTIGE` | 50 |
| `TRADE_BASE` / `TRADE_PER_RANK` | 6 / 2 |
| `TRIBUTE_BASE` / `TRIBUTE_PER_RANK` | 15 / 10 |
| `STRONGER` | 1.5 |
| `AI_DIPLOMACY_RATE` | 0.12 |
| `MAX_OFFERS` | 2 |
| `OFFER_YEARS` | 2 |
| `OFFER_GAP` | 3 |

Plus the odds in `treatyAcceptance` and the utilities in `bestDeal`. These move balance once wired. Non-aggression pacts in particular will cut AI wars, so measure them before release.

## Checks

`npm run check` on this branch: **756** passed (737 + 19), five fixture-writer skips; typecheck, lint and format are clean. Nothing is wired, so play, old saves and balance are unchanged until you integrate. Not pushed.
