# Named regents: handoff to Codex

Claude, 5 October 2026. Base: released `64e1637` (fast-forwarded). Branch `phase-0-foundations`, local only, nothing pushed. ROADMAP 12.3 (and 6.6): the next slice after Wave 4. No save change; SAVE_VERSION stays **8**.

## What it adds in play

- **A real person rules for a child.** When the head of any house is under 16, a regent governs: a parent first (a parent who married in counts), otherwise a grandparent, grown sibling, uncle or aunt; for you, councillors too. The council picks by statecraft (Diplomacy + Economy + Intrigue, +6 for a parent). Regents are 20 to 75, free, at home, of the house and not ruling another house.
- **You can overrule it, or plan ahead.** *A Regent for the Child* (urgent) lets you keep the council's choice or swap in the surviving parent, another relative or a councillor. While you are an adult with a minor heir, Life shows **Guardian for your heir**: name someone and they take the chair as the late ruler asked, with no vote. Each candidate shows a forecast (likely to hand back power / comfortable / hungry for power).
- **What a regent does.** Greedy (5%) and deceitful (3%) regents quietly skim the treasury each cycle, capped at 30 + 15 × rank; honest ones take nothing. You don't see it until *The Ledgers* turn up (ward 10+, 30+ taken): keep the proof, tell the council (they may replace the regent; failure angers them) or say nothing. Kind/generous/honest/patient/gregarious regents make the child fond of them; cruel/greedy/wrathful/arrogant/paranoid ones the opposite (±2 a cycle, capped ±30). *Lessons in Rule* (ward 8+): sit at their elbow (+1 in their best skill) or slip off to the docks (+1 Command).
- **Sixteen.** An explained grip decides whether they hand over: years in office (up to +5), Ambitious +4, Greedy +2, Deceitful +2, Arrogant +1, Honest −3, Content −3, Humble −3, their own child −3, their opinion of the ward ±2. Cling chance `(grip − 3) × 10%`, capped 70%, for one to three cycles. A clinging regent keeps war, schemes, activities, abdication, siege orders, coalition pledges and independence locked (`canAct` is false). *The Regent Will Not Go* fires each cycle: demand the seal (your Diplomacy against theirs, +25% with ledger proof), buy them out (60 + 20 × grip credits), have them arrested (your Intrigue against theirs, +10% with a spymaster; success puts them in your cells, their kin resent it) or wait. Failures add a cycle, never past majority + 4. On time with clean books: the ward is grateful (+15); skimmed books show the total and leave a grudge (−15).
- **AI houses, same rules.** Their child lords get regents who skim their own house's credits and shape their wards. At majority an ambitious AI regent can cling (news) or, with chance `(grip − 6) × 8%` capped 30%, keep the house outright: the ward lives on with a grave −60 grudge. Your own regent can only cling in this slice. In 20 harness games, 100 AI regencies began, 2 regents clung and none usurped.

## Code

| File | What |
|---|---|
| `src/game/regency.ts` | Rules. Reads: `regencyOf`, `regentOf`, `clinging`, `regentCandidates`, `regentScore`, `regentTie`, `gripOf`, `clingChance`, `clingYears`, `usurpChance`, `skimRate`, `guardianWard`, `namedGuardian`, `guardianBlocker`, `majorityYear`. Changes: `nameGuardian`, `clearGuardian`, `appointRegent`, `replaceRegent`, `exposeSkimming`, `extendRegency`, `endRegency`, `regencyTick`. |
| `src/game/eventsRegency.ts` | Four events, registered in `events.ts`. They don't use `canAct()`: a child (or a ruler under a clinging regent) can answer them. |
| `src/ui/sections/RegencySection.tsx` | Life tab, after Succession outlook: the regent, the clinging deadline, the grip and its reasons, known skimming; or the guardian picker. |
| Tests | `regency.test.ts` (13), `eventsRegency.test.ts` (13), `e2e/regency.spec.ts` (4 × desktop/390px). |

**Shared files touched (small, please keep on merge):**

- `core.ts`: new `regentHolding(s)`; `canAct` also requires `!regentHolding(s)`.
- The same `|| regentHolding(s)` added to the age gates in `activities.ts`, `intrigue.ts`, `war.ts` (declare war, independence), `life.ts` (abdication, `regencyActive`), `siege.ts` (player orders) and `coalitions.ts` (pledge).
- `tick.ts`: `regencyTick(s)` right after `successionTick(s)`.
- `events.ts`: registers `REGENCY_EVENTS`.
- `LifeTab.tsx`: mounts `RegencySection`. The red regency pill now wraps, and says "The regent still holds the seal" when clinging; the longer text overflowed at 390px before the wrap.
- `testkit.ts`: the every-system bot names guardians.

## Saved data: no version bump

- `s.flags['regent:<houseId>'] = { due: 0, data: { id, ward, since, skimmed, exposed, until } }` (due 0 is a marker). `until` is 0 until the ward comes of age, then the year a clinging regent leaves. Read only through `regencyOf`.
- `s.flags['guardian:<playerHouseId>'] = { due: 0, data: { id } }`, cleared when used.
- `regency_choice` and `regent_challenge` flags are due this cycle; each event clears its own.
- Old saves: nobody is regent until the next Age Up, when any child head (yours or AI) gets one; if nobody is fit, the old faceless regency council carries on exactly as before. A typed `Clan.regency` in a future v9 can be migrated from these flags.

## Checks

- `npm run check`: **699** passed, five fixture-writer skips. Every frozen v1–v8 save still loads, plays 20 cycles and round-trips with regencies running; the old faceless council is kept when nobody is fit.
- `npm run e2e` on ports 5233/4233: all **94** browser tests pass at 1280px and 390px, including the new regency spec: name a guardian; overrule the council; live under the regent; take the seal at 16; a clinging regent's event and Life section; no sideways scroll; no console errors. Screens inspected at both widths. That is how the overflowing pill at 390px was found and fixed.
- Balance, same 20 seeds × 150 cycles (80 games), against `64e1637`. Passive endings by 100 went from **10% to 5%**. Breeder stayed at **5%**. Builder Sovereign went from **80% to 75%**. Warmonger Sovereign stayed at **100%**. Events: 1.4 per cycle, 138 distinct, none above 3%. Within noise: AI regencies change the dice stream.
- Speed: on the same saved 10k-member state, Age Up takes 191–199 ms on both codebases. `regencyTick` itself is 0.1 ms. Serial benchmark runs differ only because the seeded game diverges (17,332 against 16,908 characters at the checkpoint).

## Not in this slice

Your own regent seizing your house, or plotting against the ward (the uncle-regent who is also next in line is already common: a natural next story); regents shown on AI house profiles; a regency council of several people; AI houses under a regent holding back from war; and elective/partition succession.
