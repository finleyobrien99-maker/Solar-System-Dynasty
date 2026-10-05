# Named commanders: handoff to Codex

Claude, 6 October 2026. Base: released `8c01dca` (merged by fast-forward). Branch `phase-0-foundations`, local only: nothing pushed. Codex integrates and releases; truces and war costs are Codex's.

## What it adds in play

- **One commander per house.** You appoint an adult of your close family or council (never the ruler, a child, a captive or a ward abroad) from the new **Fleet commander** section on the Realm tab. AI houses put their best kin in command, the lord included (a craven lord never leads himself) and now and then replace a much worse one.
- **Their own Command only.** A commander leads every battle the ruler doesn't lead in person (and every battle when you are attacked). Fleet strength uses `(1 + Command × 0.04) × (1 + their fleet traits)`: no council seat, VIP, items-as-stats or ruler bonuses. While a commander is in post the admiral seat adds nothing to battles; with nobody in command the old ruler/admiral formula is used unchanged. The enemy fights with its commander instead of its lord.
- **Battles happen to them.** Deeds go on the commander's own record (battles won/lost, battles led, wounds), so they can earn war epithets ("the Victorious", "the Unbeaten", "the Bold"). Each battle: death 1.2% (×2 in defeat), capture 8% in defeat (prisoner of the winning house; existing ransom/execution rules apply), wounds 5% (×2 in defeat; scars, sometimes maiming), War Hero 12% on a victory. AI-against-AI battles use half those risks.
- **Families feel it.** A commander's close kin hold the enemy commander (or lord) responsible for a death (−40, fading, not a blood-feud grave grudge), and blame their own lord (−15) if the commander was neither brave nor ambitious. Replacing or relieving a commander stings (−10, −20 if proud).
- **Events:** *The Vanguard* (bold kin ask for the fleet; appoint, make them second-in-command, or refuse), *A Fallen Commander* (urgent; how the house mourns, felt by the family), *A Celebrated Commander* (three or more victories; honour, reward or rein them in).

## Files

| Claude owns | Shared wiring Claude added (Codex to review or move) |
|---|---|
| `src/game/commanders.ts` + `commanders.test.ts` | `war.ts`: commander branch in `playerSide`, commander Command in `enemySide`, `commanderAfterBattle` for both sides in `fightBattle` (results appended to the report's `note`) |
| `src/game/eventsCommanders.ts` + `eventsCommanders.test.ts` | `ai.ts`: `aiCommandersTick(s)` before `tickAiWars`; `leadFactor` on both sides and `commanderAfterBattle` (danger 0.5) in `tickAiWars`, with deaths and captures as news |
| `src/ui/sections/CommanderSection.tsx` | `events.ts`: one registration line. `RealmTab.tsx`: import + mount after the Fleet section |
| `e2e/commanders.spec.ts` | `testkit.ts` (tests only): the every-system bot appoints commanders, so long sims and old-save play exercise them |

## Saved data: no version bump

- `s.flags['commander:<clanId>'] = { due: 99999, data: { id, since } }`, read through `commanderOf`, which ignores anyone no longer fit (dead, captive, too young or old, left the house, ward abroad).
- `s.flags.fallen_commander = { due, data: { id, kin } }` for the urgent event; cleared when it fires.
- On appointment a commander gets a `reputation` record (existing field, existing shape) so deeds can earn names. The epithet yearly tick still only touches house heads.
- SAVE_VERSION stays **6**. If you'd rather have a typed `Clan.commanderId` in v7, migrate it from these flags. Old saves start with nobody in command, which plays exactly as before.

## Checks

- `npm run check`: 563 passed, 2 fixture-writer skips; frozen v1-v6 saves load, play 20 cycles (now appointing commanders) and round-trip.
- Browser: 70 passed at desktop and 390px, including `commanders.spec.ts` (appoint, see the enemy's commander, fight a real battle, record updates). Screens inspected at both widths.
- Balance against `8c01dca`, same seeds: 20 × 150 Builder Sovereign 85% → 80%, Warmonger 100% → 100%; 50 × 100 endings within noise. Passive alone, 200 games: endings 16% → 17%. The balance bots don't appoint commanders, so these measure the AI side only.
- Serial 10k benchmark, alternated: Age Up 126.8 ms vs 126.0 ms.

## Not in this slice

Siege choices; fleets as entities; commanders from outside the family; a commander portrait or line in the battle report modal (only the `note`); enemy commanders shown in `ClanModal` (left alone per the wave 2 contract); commanders as succession claimants (the feelings are there for `succession.ts` to read if wanted).
