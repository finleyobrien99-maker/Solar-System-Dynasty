# Named commanders: handoff to Codex

## Integrated by Codex — 5 October 2026

This supersedes the patch-application and missing-UI notes below. Commanders are integrated with house truces, saved weariness and named civil-war leaders on ui-foundations. The wiring patch is historical: **do not apply it again**. Actual battle reports snapshot player/enemy commander IDs, retain tappable profiles through succession and reload, and foreign house profiles show their serving commander. Capture clears the appointment; craven AI heads delegate. Civil-war deaths/captures close claims and return surviving contributions once, without minting ships. War-ending deeds stay with the rulers who actually fought, including a ruler who fell in that battle. One person receives one roll even if an input accidentally repeats them on both sides.

Save version is7 with one Codex migration; old saves receive no invented truces or fatigue. Commander appointments keep the due0 story-flag representation. Twelve new frozen v7 saves include a genuine named battle report. All616 checks and80 production browser checks pass at desktop and390px. A120-seed civil-war ledger sweep verifies deaths/captures; population-cap testing now compares equal full lifetimes while ordinary long-war simulations remain. Final80-game balance and serial10k benchmark are recorded in ROADMAP and %TEMP%/solar-dynasty-wave3-combined-final. The final phone embed and deployment are handled by Codex.


Claude, 6 October 2026. Base: released `8c01dca` (fast-forwarded). Branch `phase-0-foundations`, local only: nothing pushed. Built to WAVE-3-CONTRACT.md: Claude's commits touch only Claude's files plus one event-registration line; **all shared wiring is in `COMMANDERS-WIRING.patch`** for Codex to apply, adapt or replace. Truces and war costs are Codex's.

## What it adds in play

- **One commander per house.** You appoint an adult of your close family or council (never the ruler, a child, a captive, someone outside the 16–70 age range or a ward abroad) from a **Fleet commander** section on the Realm tab. AI houses put their best kin in command, the lord included (a craven lord never leads himself), and now and then replace a much worse one.
- **Their own Command only.** A commander leads every battle the ruler doesn't lead in person, and every battle when you are attacked. Strength uses `(1 + Command × 0.04) × (1 + their fleet traits)`: no council seat, VIP, relic-as-stat or ruler bonus. While a commander is in post the admiral seat adds nothing to battles; with nobody in command the old ruler/admiral formula is unchanged. The enemy fights with its commander instead of its lord.
- **One consequence roll per person per battle.** Deeds go on the commander's own record (battles won/lost, battles led, wounds), so they can earn war epithets ("the Victorious", "the Unbeaten", "the Bold"). Danger scales with their own side's losses (`0.5 + lossShare × 5`, clamped 0.5–2.5; without ship numbers, ×2 in defeat). Base odds per battle: death 1.2%, capture 4% × danger in defeat only (prisoner of the winning house, existing ransom and execution rules apply), wounds 5% (scars, sometimes maiming in defeat), War Hero 12% on a victory. AI-against-AI battles pass `danger: 0.5`.
- **Families feel it.** A commander's close kin hold the enemy commander (or lord) responsible for a death (−40, fading, not a grave blood feud), and blame their own lord (−15) unless the commander was brave or ambitious. Replacing or relieving a commander stings (−10, −20 if proud).
- **Events (registered):** *The Vanguard* (bold kin ask for the fleet), *A Fallen Commander* (urgent; how the house mourns), *A Celebrated Commander* (three or more victories; honour, reward or rein them in).

## API (`src/game/commanders.ts`), as the contract asked

| Contract | Here |
|---|---|
| `commanderFor(s, houseId, personal = false)` | Pure. With `personal` and your house: the ruler (adult, free). Otherwise the appointed commander, or `undefined`. |
| `commandersTick(s)` | Clears appointments that no longer stand (dead, captive, too old, left the house, ward abroad), then AI appointments. Your own post stays empty until you fill it. |
| `onCommandedBattle(s, battle): string[]` | One roll per snapshotted commander; returns report lines. `commandedBattleFates` returns the same with `who`, `died`, `captured`, `wounded`, `hero`, e.g. to post only deaths as news. |

`CommandedBattle` = `{ id, attacker, defender, attackerCommanderId?, defenderCommanderId?, attackerWon, attackerShips?, attackerLosses?, defenderShips?, defenderLosses?, danger? }`. Fleets are only read. Snapshot IDs before the battle (and before the ruler's old personal roll can trigger succession). For a battle the ruler leads in person, the patch passes no commander for your side and keeps the old ruler roll, so nobody rolls twice; if you'd rather route the ruler through `onCommandedBattle` too, pass `commanderFor(s, player, true)` and drop the old roll.

Also exported: `commanderOf`, `eligibleCommanders`, `commandBlocker`, `appointCommander`, `dismissCommander`, `personalCommand`, `commandFactor`, `leadFactor`, `battleRecord`, `commandedSince`.

## The patch (`COMMANDERS-WIRING.patch`, applies cleanly to this branch)

- `war.ts`: commander branch in `playerSide`; enemy commander's Command and fleet traits in `enemySide`; snapshot of both commanders and fleets in `fightBattle`, then `onCommandedBattle` after real losses, notes appended to the report's `note`.
- `ai.ts`: `commandersTick(s)` before `tickAiWars`; `leadFactor` on both sides; snapshot then `commandedBattleFates` (danger 0.5) after real fleet losses, deaths and captures posted as news.
- `RealmTab.tsx`: import and mount `CommanderSection` after the Fleet section.
- `testkit.ts` (tests only): the every-system bot appoints commanders, so long simulations and old-save play exercise them.
- `src/game/commanders.wiring.test.ts` (new): no borrowed admiral bonus, ruler still leads in person, enemy commander used, fleet losses equal the report.
- `e2e/commanders.spec.ts` (new): appoint, see the enemy's commander, fight a real battle, record updates, no sideways scroll, no console errors.

## Saved data: no version bump

- `s.flags['commander:<houseId>'] = { due: 0, data: { id, since } }` (due 0 is only a marker), read through `commanderOf`.
- `s.flags.fallen_commander = { due, data: { id, kin } }` for the urgent event; cleared when it fires. Only for your commanders other than the ruler.
- On appointment a commander gets a `reputation` record (existing field and shape) so deeds can earn names; the yearly epithet tick still only touches house heads.
- SAVE_VERSION stays **6**. A typed `Clan.commanderId` in v7 can be migrated from these flags. Old saves start with nobody in command and play exactly as before.

## Checks

- This branch: `npm run check` 563 passed, 2 fixture-writer skips.
- With the patch applied: `npm run check` 567 passed (frozen v1–v6 saves load, play 20 cycles appointing commanders, and round-trip); 70 browser tests passed at desktop and 390px on ports 5233/4233, including the commander spec; screens inspected at both widths.
- Balance against `8c01dca` with the patch, same seeds (balance bots don't appoint commanders, so this measures the AI side): 20 × 150 Builder Sovereign 85% → 80%, Warmonger 100% → 100%; 50 × 100 endings within noise; Passive alone, 200 games: endings 16% → 17%.
- Serial 10k benchmark with the patch, alternated with the release: Age Up 126.8 ms vs 126.0 ms.

## Not in this slice

Siege choices; fleets as entities; commanders from outside the family; a commander portrait or line in the battle modal (only the report `note`); enemy commanders in `ClanModal`; commanders as succession claimants (the feelings are there for `succession.ts` to read).
