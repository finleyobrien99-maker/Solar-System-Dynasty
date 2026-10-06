# Wave 5 slice 3 — war lane

## Integrated locally — 6 October 2026

The completed foreign-policy lane (6170afa + 9831737) is merged with d279db4 in ui-foundations. This section supersedes the pending integration checklist below; previous lane measurements remain as history. No publication is part of this merge.

- GameState and emptyState now hold foreignPolicy {ultimatums, heads}; MIGRATIONS[11] calls the idempotent policy migration. Existing v1–v11 fixtures stay untouched; a new pending-ultimatum v11 fixture preserves exact terms and treaty-review heads.
- Refusals record the actual goal under the ultimatum's ID (or a new AI decision ID), and AI demanders use declareWithGoal with that exact justification. Player demanders explicitly enforce their saved goal from the house profile. No free claim or conquest fallback. Expired warrants are removed during annual policy upkeep.
- Accepted demands use settleDemand. Tribute is a capped actual-credit obligation for the stated duration, without protection. Public rivals now recognise these actual obligations until expiry. HouseConnections receives rivalsOf, and phone/desktop coverage checks filtered public links without private evidence.
- Both treaty edits survive: stances, fear and pacts plus capped transfers, atomic declaration charges and current physical-fleet eligibility. AI–AI defence calls now receive the war's actual cause, including a refused demand's feud.
- The review fixes from 9831737 survive: captive demands/repudiation blocked, defector sabotage uses the existing paid scheme. A pending ultimatum also revalidates the current ruler's freedom on answering; stale/captive answers change no state or dice.
- The breeder strategy unit test now checks actual marriage choices in a controlled family, rather than expecting three stochastic families to outgrow three others. Overall births/survival remain measured in the unchanged 80-game harness. Browser reload/war assertions wait for actual saved state; no deadlines or retries were raised.
- The embedded phone game was rebuilt after the integration: single HTML 1265.88KB (484.05KB gzip), embedded source 1236KB. Wrapper APIs unchanged.

**Combined balance:** identical seeds 1–20, all four bots, 150 cycles, against live 65e16f3. Builder Sovereign 25%→20%, Warmonger 95%→90% (50% target still missed), Passive endings by100 0%→5%, Breeder 5%→5%. Median wins/losses Builder 6.5/0→5.5/0; Warmonger 35/13→37/15. Events 1.40→1.39 per cycle, 147 distinct, none over3%. No fleet/economy retuning; aggregate seeded outcomes do not isolate causation. Reports: %TEMP%/solar-wave5-slice3-integrated-balance.

**Same-save speed:** serial five-sample processes on the unchanged year2681 save, 12,599 living dynasty members /21,002 characters. Canonical prepared-state SHA256 matches both builds: 6273098a0809b1702291d6c6221b4397a9c13bd9bfa64777c8ce22142a9b3863. Median AgeUp live193.6ms→merged183.6ms; samples overlap (164.9–204.7 vs141.0–201.8ms), so treat speed as comparable. Export-save time1503.4→1496.1ms and1624KB both (this is the lz-base64 export path, not autosave). The100ms phone target remains unproven.

**Final combined validation:** npm run check passes typecheck, lint, formatting and957unit tests (55files,9normal fixture-writer skips). E2E_PORT=4273 npm run e2e passes all132tests at1280px and390px. All125frozen saves load, play20cycles when alive and round-trip; no existing fixture was modified. Actual ultimatum and filtered Houses screens were inspected at both widths, with no console errors or sideways scroll. npm run build:app succeeds, and its generated source is included in the final check. Initial browser save races were corrected with state-based waits; the final full suite passes without retries or raised timeouts.


6 October 2026. Built locally on ui-foundations from 65e16f3068c23ac74cf704e3511cd0b7f1a4c8c8. This is a local integration handoff, not a release.

## Built

- All four saved attacking goals: a specific region, tribute for a specified duration, capped humiliation, or liberation of a specific landed direct vassal.
- Both player and AI declare and settle the same exact terms. Non-territorial wars save target:'' and take no region. The existing conquest price is 120 prestige for either attacker; no new base prices, income multipliers or fleet tuning.
- Refused demands have exact, expiring, one-use saved justifications. All three declaration paths consume them only on a successful declaration. A regional claim cannot justify unrelated goals. House profiles allow explicit second-tap enforcement of the player's recorded demand.
- Realm peace options explain signed war score, weariness and diplomacy. One envoy/war/house/cycle, one AI acceptance roll, exact two-cycle incoming offers waiting for explicit consent. Settlement revalidates the current war, parties, ownership and allegiance and returns actual surviving loans once with participant truces.
- Ordinary new region declarations save a cession goal too. Existing saved wars without a goal retain their old settlement; migration never reconstructs goals.
- Houses shows actual AI–AI treaties, guarantee and tribute directions, reciprocal marriages, recorded blood feuds, allegiance and current opponents. Planet/faith filters remain. The marriage graph is computed once per render. Public rival presentation accepts Claude's eventual rivalsOf result.
- Non-territorial campaigns hide siege controls. War aims, peace and the Codex explain limits and consequences. All UI mutations go through act().

## Review of the released treaty wiring

Kept the existing regency, custody, real-fleet and realm rules. Fixed:

- Tribute treaties debit and credit actual capped balances for AI–AI, AI–player and player–AI, at most once/year. Age Up excludes the already transferred tribute from the recurring income calculation. Forecast lines still show currently payable tribute.
- AI conquest now pays the same existing 120-prestige price as the player from its own house. Full declaration + truce + overlapping-promise costs are checked before a mutation or decision roll.
- A refused AI betrayal decision leaves the existing truce and prestige untouched. All pair treaties end on a successful declaration, including trade. Overlapping promises incur one 50-prestige declaration charge and one deed, with each victim memory preserved.
- Pending pact calls require the exact current treaty ID; civil-war primary houses and physical contributors cannot promise another fleet. Non-territorial pact calls remain answerable and return real ships.
- Legacy defeat/victory credit transfers are capped by the actual payer; no loot is minted from an empty treasury.
- Battle commander/ruler snapshots still receive their own recorded consequences. Negotiated peace does not invent another captive roll or other unstated loot.

Old tests that deliberately exercise successful AI declarations now fund the attacker. Cost assertions include both the unchanged conquest price and the unchanged truce price.

## Public APIs

warGoals.ts exports WarGoal, PeaceTerms, PeaceProposal, PeaceTribute and RefusedWarDemand.

- goalBlocker(s, attacker, defender, goal), goalLabel(s, goal): pure.
- recordRefusedDemand(s,id,from,to,goal,expires): only after an actual refusal; at most ten future cycles. No invented history.
- refusedWarDemand(s,id): unused, unexpired exact record. The successful low-level declaration itself marks used.
- settleDemand(s,attacker,defender,goal): for an actually accepted demand. Revalidates the physical effect; no war or defensive treaty is created.
- war.ts declareWithGoal(s,attacker,defender,goal,{breakOath?,justification?}): routes all primary-house combinations. A justification is the real saved refused-demand ID.
- peace.ts peaceTerms(s,warOrId,proposerId?), peaceAcceptance(s,warOrId,terms,recipient), offerPeace(s,warOrId,terms?,proposerId?), acceptPeace(s,warOrId,accept,recipientId?), peaceOfferBlocker(...), settlePeace(...).
- Existing war.ts offerPeace(s,warId,terms?,proposerId?) stays compatible. Missing-goal wars retain the old chance and settlement.
- peaceTributeTick and peaceOffersTick are wired before diplomacy and income.

At decisive score, the attacker receives exactly the saved goal; a winning defender receives capped quarter-treasury reparations. AI–AI campaigns time out after five cycles, player campaigns after seven. Tribute pays the next N cycles, capped to current whole credits, once/year, and confers no protection. Humiliation transfers available prestige, followed by the ordinary 60-prestige victory award.

## Integration with Claude's foreign-policy lane

Claude's root lane is now committed locally as **6170afa**; its source and remaining untracked coordination files have been preserved. FOREIGN-POLICY-HANDOFF.md supplies the policy wiring. Do this at the merge, before any publication:

1. Merge treaties.ts carefully: keep these capped payments, atomic full-cost checks, civil-war eligibility and one bundled breach charge, plus Claude's stance and balance-of-power changes.
2. Add foreignPolicy?: ForeignPolicyState in shared types and emptyState. Call migrateForeignPolicy(s) from this lane's existing MIGRATIONS[11]. Do not create a second bump or alter published v10.
3. After a real refusal in foreignPolicy.ts, recordRefusedDemand with the exact DemandGoal (amount AND years for tribute). For an AI demander, call declareWithGoal with that same ID and goal, once. The player sees the saved justification in War aims. Do not mint a claim or fall back to ordinary conquest.
4. Accepted demands call settleDemand, with the extra forced-tribute house memory if needed. Imposed tribute is a peaceTributes obligation, not a protection treaty.
5. In HousesSection pass rivals={rivalsOf(s,house.id,s.playerClanId)} to HouseConnections. Its public shape is {id,reasons:{label:string}[]}[] and matches Claude's Rival. No private evidence or hooks belong in these reasons.
6. Add a new frozen v11 pending-ultimatum fixture and combined refusal/acceptance E2E. Existing v1–v11 snapshots stay untouched.
7. Run combined checks, browser tests and a fresh combined balance measurement; rebuild the embedded phone game again after integration. This lane's balance does not include Claude's new policy engine.

## Validation and measurements

Full check: typecheck, lint, format and **913 unit tests pass** (8 fixture-writing tests skipped in normal mode). All **124 production browser tests pass** on desktop and 390px. Goal/peace/house-web screenshots were inspected; the new flows have no console errors or horizontal overflow. **24 v11 fixtures** cover real goals, offers, obligations and refused demands; all 100 historical v1–v10 fixtures remain byte-for-byte untouched and every frozen save loads, plays 20 cycles where the dynasty survives, and round-trips. The embedded phone game was rebuilt. No publication was performed.

Exact live baseline and this war lane: same seeds 1–20, all four bots, 150 cycles (80 games each), Fin's approved AI_FLEET_PARITY 0.4 unchanged.

| Metric | 65e16f3 | War lane |
|---|---:|---:|
| Passive ended by 100 | 0% | 0% |
| Breeder ended by 100 | 5% | 5% |
| Builder Sovereign | 25% | 10% |
| Warmonger Sovereign | 95% | 95% |
| Builder median battles won/lost | 6.5 / 0 | 3.5 / 0 |
| Warmonger median battles won/lost | 35 / 13 | 32.5 / 11.5 |
| Events/cycle | 1.40 | 1.41 |
| Distinct events | 141 | 142 |

Warmonger still misses the 50% target and Builder falls below its roughly 30% target. This is not evidence that the war lane solved balance. New exact terms remove unstated conquest loot/captive rolls, payment review stops minted tribute, and AI declarations now require their actual prestige; seeded runs diverge, so individual causes are not isolated by this aggregate comparison. Keep these results beside Claude's combined measurement.

Reports: %TEMP%/solar-wave5-slice3-baseline-balance and solar-wave5-slice3-war-balance-final. Archived exact baseline source: solar-wave5-slice3-baseline-65e16f3.

Same saved 10k state: solar-dynasty-wave4-bench.json, year 2681, 12,599 living dynasty members, 21,002 total characters. Clear pending notices only, clone outside the tick timer, assert the year advances, five samples per process. Shared canonical prepared-state SHA256: 6273098a0809b1702291d6c6221b4397a9c13bd9bfa64777c8ce22142a9b3863.
Serial baseline median Age Up: 206.4 and 179.3ms; war lane: 194.6 and 199.8ms. Copy 69.6–81.5ms; autosave 250.8–278.7ms; saved 1357KB. The final recipient-eligibility guard does not run in this old state's benchmark tick. No clear slowdown outside observed variability; the existing 100ms phone target remains unmet. Overlapping/blocked-tick timing trials were discarded.
