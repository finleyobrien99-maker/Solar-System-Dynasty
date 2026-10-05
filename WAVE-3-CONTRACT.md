# Wave 3: wars with consequences

Fin sent the commanders task to Claude and asked Codex to begin on 5 October 2026. Start from released **8c01dca**; merge ui-foundations/main into phase-0-foundations before commander work. This replaces older lane allocations for this wave. Do not merge the parked ai-spending branch.

## Ownership

Codex: peace.ts (truces/oath-breaking and measured war pressure), its tests and UI, war.ts, ai.ts/aiCourt.ts shared battle/war entry points, succession.ts civil-war pressure, types/core/world/save and fixtures, tick/economy integration, bots, SystemTab RegionPanel/RealmTab/ClanModal integration and Codex text. Codex owns the single v7 migration. No independent version bump.

Claude: commanders.ts, commander tests, CommanderSection.tsx, related event content and tests, and a handoff. Do not edit shared battle/tick/save/types files or RealmTab until integration. Keep engine calls and a standalone UI section reviewable. Commander assignments may use existing story flags (`commander:<houseId>`, data with character ID and appointment year, due 0 as a non-deadline marker) without new saved fields; otherwise document requested v7 fields for Codex. Seeded RNG only, actual characters, real fleet accounting, all UI actions through act().

## First peace slice

Five-cycle bilateral house truces on victory, defeat and white peace, including independence/revolt settlement and AI-versus-AI peace. They survive rulers dying, region transfers and save/reload. No truces are fabricated for historical wars by migration. A broken truce is an explicit choice with a 200-prestige cost, one oathsBroken deed on the actual breaker, other houses' disapproval and the victim's genuine resentment. Normal declarations and automated bots respect truces. AI may break an oath only through the same rule and its own resources. Queries and failed/stale actions must not mutate state or RNG. A claimant's internal civil war is not an external truce loophole or a new war declaration against a house.

Measure truces alone against 8c01dca before introducing a separate fatigue lever. Keep coalition/threat expansion as a later slice rather than stacking unmeasured changes. Fin has authorised beginning this proposal; the older Fin's-call labels do not require asking him again for this agreed scope.

## Measured weariness slice

War weariness is an own-house saved dictionary, 0-100. At the beginning of a cycle, existing campaigns add 3 each (up to 9) or peace recovers 8. A real battle adds 3 plus ceil(20 times actual own losses / participating own ships). Maximum penalties are 25% fleet strength and 15% regional income. Civil-war backers count their detached contributions; the disputed house combines loyalist/rebel participation into one charge. Helper fleets do not gain additional physical losses. The economy displays the actual negative income line. Old saves start at zero, without fabricated historical campaigns.

Same 20 seeds x150 cycles, 80 games: released / truces-only / plus-weariness give Passive endings by100 20/20/15%; Breeder 5/10/10%; Builder Sovereign 85/90/100%; Warmonger 100/100/100%. Conquest is still off target; do not claim fatigue fixes it. These are small samples and equal penalties can also help a conqueror against tired AI. Reports in %TEMP%/solar-dynasty-wave3-truces and solar-dynasty-wave3-weariness. Threat and coalitions remain a separate measured update. The parked AI-spending branch remains excluded.

## Commander integration contract

Prefer `commanderFor(s, houseId, personal = false): Character | undefined` as a pure query, `commandersTick(s): void` for AI appointments/invalid assignments, and `onCommandedBattle(s, battle): string[]` for one set of named consequences. If your natural API differs, document it in the handoff; Codex adapts it.

Battle input should carry a unique battle ID, attacker/defender house IDs, snapshotted commander IDs, attackerWon, each side's own fleet before combat and actual losses, and whether the player led personally. Snapshot actor IDs before wounds/death can trigger succession. Effects run once after actual fleet losses are calculated. Do not apply the old ruler-only wounds again to a commander: one person gets one consequence roll for a battle. Do not give allied/helper fleets extra physical losses or grant replacement ships. Player/AI/civil-war hooks are wired by Codex; not claimed finished merely because the module exists.

First playable scope is one commander per house, genuine eligible adults, personal Command, reputations from actual results and injury/captivity/death with real family consequences. Siege choices remain later. Never borrow player VIP/council/relic bonuses for another house.

## Validation and release

Each lane runs check before its local commit and desktop/390px E2E plus visual inspection for UI. Codex also runs old-save fixtures, baseline/candidate seeded balance and a serial large-family benchmark. Use 5273/4273 for Codex and 5233/4233 for Claude. Fin's real saves are untouched. Commit locally; combine both lanes, rebuild the phone embed and validate before the next release. No force push. Current live save version is 6, next is 7.
