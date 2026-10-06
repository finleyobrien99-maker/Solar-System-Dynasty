# Foreign policy (Wave 5 slice 3, Claude's half): handoff

## Integrated locally — 6 October 2026

Both commits through9831737 are merged with the war lane d279db4 in ui-foundations. All wiring steps below are complete: shared v11 state/migration, frozen pending ultimatum, exact refused-goal wars, imposed tribute without protection, and public Houses rivals. The captive and defector fixes are retained, and captive pending answers are also blocked. Previous measurements below describe this lane alone. Combined balance, speed and final validation are in WAR-GOALS-HANDOFF.md. Final full check passes957unit tests; all132desktop/phone browser tests pass;125frozen saves load/play/round-trip, and the phone game is rebuilt. Nothing is published by this merge.


Built on `65e16f3` (live treaties, save v10, AI_FLEET_PARITY 0.4) in `phase-0-foundations`, committed locally, not pushed. The war lane's half (war goals, peace terms, `warGoals.ts`, v11) is Codex's, per WAVE-5-CONTRACT.md "Slice 3 agreed war-lane interface" and Codex's later note at the top of the contract.

## What it does

- **Stances.** Every AI house has one of seven outlooks, read fresh from its lord's traits and stated ambition: expansionist, honourable, planet first, zealous, mercantile, schemer or cautious. A new lord can turn the house around. Stances shift what a house offers and accepts (`treaties.ts`): honourable lords like pacts and all but never break them, mercantile ones chase trade, expansionists dislike non-aggression, schemers sign non-aggression pacts they mean to break and are likelier to betray.
- **The balance of power.** A house with 2.5× the median landed fleet (`RISING_POWER`) is a *rising power*, you included. Its neighbours in other realms regard it 10 worse ("Fears their growing power"), are warier of its offers, and look for defensive pacts with each other against it, even at lukewarm relations.
- **Ultimatums.** An expansionist lord who is a free adult, at peace and 1.5× stronger than a neighbour plus that neighbour's sworn treaty defenders may demand a region (never a throne-region or a last region) or tribute. It considers this at 6% a cycle, with 10 cycles between demands.
  - An AI target answers with one roll at explained odds: the might ratio, craven, brave, pride, "land is dearer than money", trusted allies, hatred.
  - You are asked through the urgent *An Ultimatum* event. A regent answers for a child ruler by the same odds.
  - Giving in hands over the region (`setOwner`) or signs a tribute treaty, and the victim remembers.
  - On refusal, the demander remembers ("Defied our demands"). **The war over exactly that demand is the war lane's** (see below). Until it is merged, a refusal brings no war, and never a war over some other target.
- **Your demands.** The house profile has *Press a demand*: hand over a named region, or pay tribute, at the odds shown, with a second-tap confirmation. A 5-cycle cooldown follows. A refusal gives you no free claim.
- **Rivals.** `rivalsOf` names up to three houses a house is publicly set against, worst first: at war, fears their power, sworn rival, broken promises, forced tribute, cold relations. It never uses private knowledge. For you, it names the houses set against you. The house profile shows them.
- **Envoys ration themselves.** *Envoys at Court* now interrupts you at most once every 6 cycles (`ENVOY_GAP`). Offers in between wait in Realm's *Envoys waiting*, which already lists every offer. Fear of rising powers had pushed the event to 2.9% of all events.

## The interface

From `src/game/foreignPolicy.ts`. Reads are pure.

| Contract item | Supplied |
|---|---|
| `stanceOf(s, houseId, viewerId?) -> {kind; reasons}` | Yes. The reasons are traits and the stated ambition, both already public on the lord's card, so every viewer sees the same. `undefined` for the player. `STANCE_NAME` has display names. |
| `rivalsOf(s, houseId, viewerId?)` -> public rival IDs/reasons | Yes: `Rival[] = {id; reasons: Reason[]}[]`, at most `MAX_RIVALS` = 3. |
| Ultimatum state, `migrateForeignPolicy(s)` from `MIGRATIONS[11]` | `ForeignPolicyState = {ultimatums: SavedUltimatum[]; heads: Record<string, string>}` (`diplomacyTypes.ts`). `ultimatums` holds **only ultimatums waiting for your answer** (`{id, from, to, goal, year, expires}`, `ANSWER_YEARS` = 2); AI targets answer at once. `heads` notes each AI house's lord at its last treaty review (see below). The migration adds an empty record and invents nothing: the first cycle only notes the lords, so no succession is invented. It is idempotent. |
| Goal shapes | `DemandGoal` (`diplomacyTypes.ts`) is exactly your `WarGoal`'s cede and tribute members: `{kind:'cede'; regionId}` and `{kind:'tribute'; amount; years}`. `tributeDemand(s, payer)` gives the usual terms (15 + 10 × rank credits a cycle for 10 cycles, inside your 1000 and 20-cycle caps). You can alias one to the other. |
| Refused demands | **Yours**, as your note asks (`recordRefusedDemand` / `refusedWarDemand`, `s.warJustifications`). I keep no copy. |

Answers name the exact ultimatum (`answerUltimatum(s, give, id)`). Stale or repeated answers change nothing and roll no dice. A demand overtaken by events (a war, a lost region) hides both answers and offers only "Send the envoys home". `foreignPolicyTick` drops lapsed entries.

## Wiring at the merge (Codex's shared files, then two small edits in foreignPolicy.ts)

Until v11, my code reads and writes `s.foreignPolicy` through `WithForeignPolicy` (an optional intersection type), exactly as diplomacy did before v10. None of it is released.

1. `types.ts`: `foreignPolicy?: ForeignPolicyState` on `GameState`. `WithForeignPolicy` can then become plain `GameState`.
2. `world.ts` `emptyState`: `foreignPolicy: { ultimatums: [], heads: {} }`.
3. `save.ts` `MIGRATIONS[11]`: call `migrateForeignPolicy(s)`.
4. v11 fixtures: include an ultimatum waiting for the player (the contract asks for a pending ultimatum).
5. **`refuse(s, u, _id?)`** in foreignPolicy.ts already receives the ultimatum's own id when you refuse. AI targets get none, so make one. After the memory and log lines, add:
   ```ts
   const id = _id ?? newId(s, 'ul');
   if (recordRefusedDemand(s, id, u.from, u.to, u.demand, s.year + GRIEVANCE_YEARS) && u.from !== s.playerClanId)
     declareWithGoal(s, u.from, u.to, u.demand, { justification: id });
   ```
   That is the real decision followed by the exact saved goal. No second roll, no other target. Your own justified war is then offered from the war screen.
6. **`yieldTo(s, u)`**: replace its physical lines (`setOwner` + `recordExpansion` + the cede memory, and `signTreaty`) with `settleDemand(s, u.from, u.to, u.demand)`. `settleDemand` already writes the "Yielded" memory and the log. Keep my tribute memory ("Forced tribute from us", −25), which `settleDemand` does not write. Drop my "gives in" log line, or keep it for AI–AI news. Tribute then becomes a `peaceTributes` obligation instead of a slice 2 tribute treaty, so the payer no longer gets the receiver's protection. That is the right reading for extortion.
7. Copy to restore once (5) is in:
   - the refusal outcome in `eventsForeignPolicy.ts` already reports what happened ("House X declares war." or "House X will not forget it.");
   - the hint under *Press a demand* (`HouseDiplomacySection.tsx`), today "If they refuse, they will remember it.", becomes "If they refuse, you may go to war over exactly this.";
   - the refusal e2e (`e2e/foreignPolicy.spec.ts`) can again expect *War Declared!* and the realm call.

## Added while you built war goals (second local commit)

- **A new lord reviews the treaties.** When an AI house's lord changes, through any route (death, crisis, usurping regent), the new lord reviews the house's treaties once (`reviewTreaties` in `foreignPolicyTick`). They may repudiate one for a stated reason (`repudiationReason`):
  - they despise the partner (relations of −30 or worse);
  - an expansionist wants a free hand against a weaker neighbour (non-aggression);
  - a planet-first lord won't bleed for another world (defensive pact, guarantee given);
  - a payer won't keep paying tribute to a house no stronger than their own.

  Honourable lords keep every word; schemers keep non-aggression pacts they mean to betray; a regency keeps the house's word. Repudiation is no breach: the partner loses 15 trust (`REPUDIATE_TRUST`) and remembers it (−20), with no prestige loss and no Oathbreaker name. You get *A Treaty Repudiated* if it was yours.
- **You may repudiate too.** In the first 5 cycles of a reign (`REPUDIATE_WINDOW`), on the same terms, a treaty signed before your ruler took the throne gets a *Repudiate* button beside *Break it* in the house profile (`predecessorTreaty`, `repudiateBlocker`, `repudiateTreaty`).
- **Rivals plot.** In `aiIntrigue.ts` `aiPlans`, the houses' own quarrels now add to a lord's hatred, in full: house-to-house memories (kept apart from the lords' personal feelings, so nothing counts twice) plus 15 for broken promises. A rising power next door is a sabotage target even without hatred (+55). Plots against you still come from `ai.ts`; untouched.
- **Three events** in `eventsForeignPolicy.ts`:
  - *A Border Incident*: two quarrelling neighbours of yours ask you to judge. Mediate (40 credits, +20 prestige, both cool), side with either, or stay out.
  - *The Neighbours Confer*: you are a rising power and at least two neighbours meet about it. Buy off their host (80 credits), parade the fleet (+25 prestige, all of them like you less), or let them talk.
  - *A Defector*: someone flees a house set against you. Your options:
    - send your saboteurs with their maps: `runScheme(s, 'sabotage', house)`, the ordinary paid scheme with its usual odds, cost and exposure, using one of your schemes this cycle and no fleet;
    - shelter them and nothing more;
    - send them back;
    - let them go.

  Each of the first two leaves the memory "Sheltered our traitor". Other effects are memories, so grave grudges cap the goodwill (memory.ts).
- **Codex's review (FOREIGN-POLICY-REVIEW.md), both fixed:**
  - A captive ruler can no longer repudiate (`rulerFree`: grown, out of regency, not a captive). The same rule now covers pressing demands and answering them: while you are captive, your council answers an ultimatum (*Your Council Answers*), as a regent does for a child.
  - The defector no longer "raids" with ships you may not have. It is covert sabotage by the existing rules (above).

  Regressions: a captive repudiation changes nothing (whole state and seed); captive demands are blocked and the council answers; the defector with no fleet still sabotages at the scheme's cost, and with no credits that option is greyed while the others stay open.
- **Codex entries** (`CodexModal.tsx`): *Treaties and trust* (slice 2 had none) and *Foreign policy*.

## Edits to shared files this slice (please review)

- `treaties.ts`:
  - stance effects in `treatyAcceptance` ("Wary of your growing power" −15%; honourable, mercantile, expansionist, planet-first and schemer shifts);
  - `commonThreat` counts rising powers;
  - `bestDeal` reads stances and lets the neighbours of a rising power seek defensive pacts at relations of 5 or more (+10 utility);
  - `mightBreakPromises` and `aiResolvePromises` read stances (schemer +15%; an honourable lord's chance is 0.5%);
  - `diplomacyTick` calls `foreignPolicyTick` before `houseMemoriesTick`.
  
  You also edited treaties.ts; keep your capped-payment and atomic-breach review.
- `houseRelations.ts`: "Fears their growing power" −10.
- `events.ts`: `...FOREIGN_POLICY_EVENTS`.
- `eventsDiplomacy.ts`: `ENVOY_GAP`.
- `HouseDiplomacySection.tsx`: the stance line with a *Rising power* pill, *Rivals*, *Press a demand* and *Repudiate*.
- `aiIntrigue.ts`: house quarrels and rising powers in `aiPlans` (above).
- `CodexModal.tsx`: two entries, after *Marriage ties between houses*.

## Measured

Same 20 seeds × 150 cycles (80 games), against the live `65e16f3`. This is my half alone; with it, refusals bring no war.

| | Before | After |
|---|---|---|
| Passive endings by 100 | 0% | 5% (back inside the 5–15% band) |
| Builder Sovereign by 150 | 25% | 20% |
| Builder endings by 100 | 0% | 5% |
| Warmonger Sovereign by 150 | 95% | 90% (battles won/lost 35/13 → 33.5/10) |
| Breeder endings by 100 | 5% | 5% |
| Treaties signed per game | 73–105 | 101–129 |

- **Events.** 143 distinct events fire, none over 3%: pirates 2.36%, Envoys at Court 2.34% (1.79% before; 2.89% without `ENVOY_GAP`), An Ultimatum 0.37%.
- **Speed.** Age Up on the same saved 10k state, alternating serial runs: medians 160–163 ms against 158–164 ms for `65e16f3` (one noisy run at 220 ms).
  - The first build was about 35% slower: `bestDeal` asked `commonThreat` about many more pairs, and each call rebuilt the marriage-pact map.
  - Fixed: lukewarm pairs only check for a rising power next to both (`risingThreat`), and the pact map is passed through.

### Second commit, measured (same 20 seeds × 150, all four bots)

| | First commit (6170afa) | Second commit |
|---|---|---|
| Builder Sovereign by 150 | 20% | 30% |
| Warmonger Sovereign by 150 | 90% | 85% |
| Passive endings by 100 | 5% | 0% (one game in twenty; below the 5–15% band again) |
| Builder / Breeder endings by 100 | 5% / 5% | 10% / 10% |
| Treaties signed per game | 101–129 | 81–122 (new lords repudiate) |

- **Events.** 145 distinct events, none over 3%. Envoys at Court 1.96%, An Ultimatum 0.27%, A Defector 0.14%, A Border Incident 0.02%, The Neighbours Confer 0.02%. The last two are rare by design: a public quarrel next door, or you as a rising power facing neighbours of another realm. Their frequency is a feel call for Fin.
- **AI intrigue,** 20 passive games × 150 cycles against `65e16f3` (scratch counter over the log):
  - assassinations 33 → 35, caught assassins 25 → 32;
  - shipyard sabotage 415 → 669 (aimed at rising powers and at houses with grudges);
  - 86 treaties repudiated by new lords (about 4 a game).
- **Speed.** Age Up on the same saved 10k state, serial and alternating: medians 174–178 ms against 170–176 ms for `65e16f3`.

## Tests

- Second commit: `foreignPolicy.test.ts` adds new-lord reviews (no invented succession; expansionist heir; honourable heir and regency keep the word; you are told), your repudiation (window, self-signed, captive), and rival plots (house quarrels, rising powers). `eventsForeignPolicy.test.ts` covers the three new events (conditions, each option, pure previews).
- `e2e/foreignPolicy.spec.ts` adds *Repudiate* on a predecessor's treaty but not yours (desktop and 390px).
- First commit, `foreignPolicy.test.ts` (18 tests):
  - stances, and that honourable lords keep their word;
  - rising power and fear; defensive pacts against a giant; purity;
  - target choice and protector deterrence;
  - AI cede and tribute; refusals remembered with no stand-in war;
  - your answer (give in or refuse), and your demands, with no free claim;
  - blockers; the regent answering;
  - stale and repeated answers inert with dice untouched; lapsed event options; two waiting ultimatums;
  - migration idempotence; rivals (public reasons only); the envoy gap.
- `e2e/foreignPolicy.spec.ts`, desktop and 390px:
  - an ultimatum arrives with both fleets and you refuse;
  - a house shows its stance and rivals, and you press a demand.
