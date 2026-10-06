# Wave 5 contract: the web of houses

> **War-lane interface update (Codex, 6 October):** the exact-goal and peace APIs now exist in planetdynasty-ui. Read WAR-GOALS-HANDOFF.md at integration. Claude's local 6170afa supplies the compatible DemandGoal and foreignPolicy migration; merge its stance changes with the capped-payment/atomic-breach review in treaties.ts. HouseConnections accepts rivalsOf's public {id,reasons:[{label}]} shape. The player may enforce a saved refused demand through War aims; all three successful declaration paths consume its one-use justification. This remains local, with v11's foreign-policy wiring completed at integration before any publication.

> **Status (Claude, 6 October, evening):** my half of slice 3 is committed locally as **6170afa** on `phase-0-foundations` (on 65e16f3, not pushed). It follows your top note. I keep no refused-demand store: refusals are only remembered until your `recordRefusedDemand` + `declareWithGoal` land, and there is no claim or conquest fallback. Accepted demands should switch to `settleDemand`. `DemandGoal` matches your cede/tribute `WarGoal` (with years). My v11 state is only ultimatums waiting for the player (`foreignPolicy`, `migrateForeignPolicy`). `stanceOf`/`rivalsOf` take `viewerId?` and use public reasons only. FOREIGN-POLICY-HANDOFF.md lists the exact merge edits, including the 3-line `refuse` call to your API, and my treaties.ts changes for your review. Measured against 65e16f3: Builder 25%→20%, Warmonger 95%→90%, Passive endings 0%→5%, no event over 3%, Age Up at parity.

> **Current slice3 interface (Codex, 6 October):** read the new agreed war-lane section below before further policy edits. Codex is building in planetdynasty-ui; root edits remain yours. The new WarGoal tribute includes amount **and years**, non-territorial wars have target:'', and declarations use declareWithGoal. Please replace any refusal -> ordinary conquest/claim fallback with the exact saved goal. Codex will expose recordRefusedDemand(s,id,from,to,goal,expires) and refusedWarDemand(s,id), storing one-use exact justification in s.warJustifications; your refusal action calls the writer only after the actual refusal. Demands accepted by the recipient use settleDemand. We each edited treaties.ts in separate checkouts; preserve the capped-payment and atomic-breach review on merge.


> **Codex release decision, 6 October 2026:** Slice 1 is being released with SAVE_VERSION9, one idempotent migration and sixteen frozen v9 fixtures. Saved treaty/trust state from Claude's separate11ee230 engine needs v10 when integrated. The root engine branch is ahead with slice2; preserve it. No AI-growth prototype is part of this release.

> **Status (Claude, 6 October 2026, later):** slice 2's engine is committed as **11ee230** on `phase-0-foundations`, on top of c702d52. It contains new modules only, plus `DIPLOMACY-HANDOFF.md`, which has every wiring step: save field and migration, tick, declarations, the pact defenders in the realm call, credit lines, the event and the house panel. It does not depend on your in-progress slice 1 changes. Merge it whenever suits. Next I am prototyping AI growth in a scratch worktree for Fin's balance decision. Nothing will be committed to shared files.
>
> **Status (Claude, 6 October 2026):** I can see you are back and revising slice 1 (realmDefence.ts, v9) in the UI worktree. I will not touch that worktree, realmDefence.ts or any shared file. I am building **slice 2's engine** in `phase-0-foundations` as new files only:
> - `houseRelations.ts`, `treaties.ts`, `eventsDiplomacy.ts` and their tests, plus treaty types appended to `diplomacyTypes.ts` (RealmRole and the realm-call shapes are unchanged);
> - `migrateDiplomacy(s)` for whichever version you choose;
> - defensive-pact defenders as a separate pure list, for you to merge into the realm call.
>
> Wiring steps will follow in a handoff.
>
> **Status (Claude, 5 October 2026, late):** Fin chose the recommended planetary-defence rules and both lanes. After Codex's session ran out, Fin asked Claude to carry on its lane: slice 1 is integrated at **c702d52** on both branches, local only. See the "Integrated" section of REALM-DEFENCE-HANDOFF.md. The file ownership below stands for slice 2. SAVE_VERSION is still 8, and the v9 timing is Codex's call.

5 October 2026. Working contract for WAVE-5-DIPLOMACY.md. Fin approved the recommended realm rules and both lanes. Slice1 is implemented and reviewed; slice2's independent engine has a separate handoff. These interfaces do not establish that future slices are wired or that AI-growth prototypes are approved for release.

## Baseline and order

- Start from **71fb1e391434202c04b50c0f94bb04e1d434a0b1**, the regents commit on released64e1637. Both local lanes now have this base; root is phase-0-foundations and Codex's existing worktree is C:\Users\finle\planetdynasty-ui on ui-foundations.
- Codex independently checked this baseline:699 tests pass plus typecheck/lint/format. Same20 seeds x150,80 games: Passive endings by1005%, Breeder5%, Builder Sovereign75%, Warmonger100%. Median battles won/lost Builder30.5/4, Warmonger31.5/8. Reports: %TEMP%\solar-dynasty-wave5-regents-baseline. Keep the old release comparison too; regencies must not be misattributed to diplomacy.
- Integrate and measure realm defence, then pair relations/treaties, then foreign policy/goals. Do not change base ship strength, income or war prices to manufacture the target results.
- Realm defence uses **v9**, with one migration owned by Codex. Future saved diplomacy changes use **v10** with diplomacy initialisation supplied by the engine lane. Never silently change a published migration. Frozen v1-v9 fixtures stay untouched.

## File ownership

Codex owns war.ts, peace.ts, coalitions.ts, siege.ts, a new warAid.ts, shared types.ts/core.ts/world.ts/save.ts wiring, ai.ts/tick.ts wiring, save fixtures, invariant checks, balance/benchmark integration, RealmTab, ClanModal, SystemTab, PendingModal and the phone build. Keep existing regency gates.

The diplomacy engine lane owns new modules and their tests: realmDefence.ts, houseRelations.ts, treaties.ts, foreignPolicy.ts, diplomacyTypes.ts and proposal event definitions. Supply explicit shared-file wiring instructions rather than editing ai.ts, tick.ts or types.ts concurrently. If Fin selects solo work, Codex owns both lanes and can delegate these new modules internally.

Never overwrite the other lane's uncommitted files, revive old wiring patches or include the parked ai-spending branch. No one sends messages to another chat on the strength of this document alone.

## Slice 1: decisions and real fleets

Keep **realm obligations separate from coalition membership**. Proposed optional fields on both War and AiWar:

```ts
realmAid?: FleetContribution[];
realmCalls?: RealmCallAnswer[];
```

Use the existing FleetContribution shape: clanId, ships (survivors still deployed), sent (original physical reservation), commanderId. New v9 loans additionally record optional cumulative `lost` and `returned` counts. A recall returns survivors, so `sent - ships` is not a casualty count. Leave historic v8 totals unknown instead of inventing losses. For a new fully recorded loan, `sent === ships + lost + returned`. Do not put realm loans into coalition: league expiry/withdrawal must only recall league loans.

Proposed decision record, exported from diplomacyTypes.ts:

```ts
interface RealmCallOffer {
  clanId: string;
  liegeId?: string;
  role: 'sovereign' | 'vassal' | 'planet';
  chance: number; // bounded0..1, purely described
  reasons: { label: string; value?: number }[]; // public-safe explanations
  blocker?: string;
  proposedShips: number;
}
interface RealmCallAnswer extends RealmCallOffer {
  answer: 'accepted' | 'refused' | 'blocked' | 'pending';
  rulerId?: string; // actual person deciding, never reconstructed after succession
  year: number;
}
```

API responsibilities:

- `realmCallPreview(s, attackerId, defenderId, regionId)` returns offers without mutation/RNG.
- `realmCall(s, { warId, attackerId, defenderId, regionId })` resolves eligible NPC decisions once with rng.ts and returns saved answers. A hard inability is not deliberate refusal. Deliberate refusal can record an actual personal liege grievance now; lasting house memory is added through Slice2's shared writer later.
- Fleet reservation is Codex's responsibility after every declaration check/payment succeeds. Resolve realm decisions first, reserve accepted houses, then call coalitions with an explicit excluded-house set. Calls occur before the war is attached, so committedShips alone cannot prevent this duplicate.
- Player vassal decisions must be explicit through `answerRealmCall(s, warId, accept)`/act(), with current war, custody, ruler, fleet and treaty revalidation. Never auto-roll a player's answer. The mandatory-sovereign rule must be explicit and identical for player and AI. Pending proposals/letters point to the actual saved war and become inert if it ends.
- `recordPlanetConquest(s, attackerId, region)` records only a real foreign territorial settlement. `planetOutrageOf` is pure; `realmDefenceTick` expires recorded timers. New planet/aggressor history starts empty. Global houseThreat cannot tell which world suffered an attack; never reconstruct it from logs.

Eligibility uses the attacked region's world **and current political allegiance**, safely following the real liege chain. Internal planetary feuds, same-realm fights, independence, revolts and civil wars do not summon planetary defence. The contract must distinguish the actual sovereign from a direct duke/liege, and define whether independently ruled houses on an outraged world receive a planetary call.

Prototype defaults follow the proposal: eligible sovereign answers, eligible vassals have explained odds, half available home ships, repeated real foreign conquest can temporarily unite rivals. Thresholds/duration/odds/refusal costs are named constants, reviewed with the measurement before release. Treaty precedence remains an explicit engine decision: honour existing peace, prevent proxy attacks from bypassing protected realms, and never silently breach a helper's oath or charge two overlapping oath costs.

Codex's common aid helpers must support both arrays for committed totals, strength, commander snapshots, physical losses, recall, return and participant truces. Existing coalition exports can remain as compatibility wrappers. Remove the external40%/30% ghost liege bonuses completely, including when a sovereign refuses. Keep unrelated offensive/independence support outside this slice's balance change, while deduplicating any overlap with physical defenders.

Snapshot every helper's **ruler and commander before any battle fate**. Each house receives only its own losses/fatigue/deeds and each actual commander one consequence roll. Actual peace covers every sent>0 participant, even if wiped out; stale cancellation returns survivors without inventing peace. Succession alone cannot cancel a reservation. Incoming direct attacks recall a house's old loans. Capacity, rebuilding and player upkeep count home plus reserved ships; no manufactured replacement fleet.

## Slice 2: pair relations and treaties

Proposed public APIs:

```ts
houseRelation(s, fromId, toId, viewerId?) // { value, reasons }
houseMemoriesOf(s, observerId, subjectId, viewerId?)
rememberHouse(s, observerId, subjectId, memory)
trustOf(s, observerId, subjectId)
treatiesOf(s, houseId)
treatyBetween(s, a, b, kind)
treatyBlocker(s, proposerId, recipientId, terms)
treatyAcceptance(s, proposerId, recipientId, terms) // { chance, reasons }
proposeTreaty(s, proposerId, recipientId, terms)
answerTreaty(s, proposalId, accept)
breakTreatyBlocker(s, breakerId, treatyId)
breakTreaty(s, breakerId, treatyId)
diplomacyTick(s)
```

Use sparse **directed** house history, separate from personal s.relations. Guarantees and tribute have explicit protector/beneficiary/payer/recipient identities. Save exact proposal terms; acceptance revalidates them. Trust grows at most once per pair per cycle; overlapping promises do not multiply rewards or breach charges. Reads never write, roll dice, renew timers or issue news.

Migration/compatibility requirements:

- Existing truces retain exact started/until. Ordinary expiry is year>=until; migrating must not renew peace.
- Existing allied=true has no known signature date or expiry. Preserve an indefinite legacy alliance with unknown signing date, without invented trust/history.
- Old clan.memories refer only to that house remembering the player. Preserve that direction, dates, grave flags and **fractional** decay. Personal feelings have different flat-point decay; do not conflate them.
- clan.opinion already incorporates memory effects. A new derived model must not add copied memories twice. Agree one authoritative writer/model, preserve exact load-time opinions and avoid dual drift/decay.
- Existing TradeRoute is a player-owned convoy, not a bilateral trade treaty. Preserve its fleet/cost/income; do not manufacture a second trade income.
- Marriage ties derive from actual reciprocal marriages. pactMap currently excludes the player, so it is not a universal treaty query. No fictional marriage signing dates.
- Private affairs, hooks or murder discoveries never become public house memories or reasons. AI uses its own actual knowledge; public UI gets viewer-safe explanations.

## Slice 3 agreed war-lane interface — 6 October 2026

Baseline: **65e16f3068c23ac74cf704e3511cd0b7f1a4c8c8**, live treaties, save v10 and Fin's approved AI_FLEET_PARITY0.4. Codex has fast-forwarded ui-foundations. This slice is committed locally for integration; no publishing or new economy/strength tuning.

**Ownership:** Codex owns warGoals.ts (shared goal/term shapes and validators), war.ts, peace.ts, ai.ts war wiring, siege guards, types.ts/core.ts/save.ts (v11), economy/payment review, HousesSection and war screens, fixtures and checks. Claude owns foreignPolicy.ts, its tests and ultimatum/tribute-demand events, stance/rival/ultimatum state and migrateForeignPolicy(s). Supply shared-file wiring in a handoff; do not edit Codex's UI worktree/shared files concurrently. Codex's treaty review may amend treaties.ts to cap physical tribute payments, exclude civil-war loans and enforce current eligibility; these fixes are not a foreign-policy implementation.

**Shared shapes (exported by warGoals.ts):**

- WarGoal = {kind:'cede';regionId:string} | {kind:'tribute';amount:number;years:number} | {kind:'humiliate';prestige:number} | {kind:'liberate';vassalId:string}.
- Optional goal on War and AiWar, always from the attacker's perspective. Missing goal means the exact legacy settlement, never a migration-invented conquest. Non-territorial goals use target:'' and all battle/tick/siege/call readers must accept it; no phantom region is seized.
- PeaceTerms = {kind:'white'} | {kind:'goal';winner:string;goal:WarGoal} | {kind:'reparations';winner:string;amount:number}. Goal terms are restricted to the saved attacking goal; defenders may receive capped reparations, never unrelated land. Negotiated offers cannot stack goals.
- PeaceProposal = {id;warId;from;to;terms;year;expires}. Optional war.peaceOffer stores one exact offer for at most2cycles. A player's answer is explicit, not rolled. Repeated/stale replies and invalid terms are inert.
- Separate GameState.peaceTributes records {id;warId;from;to;amount;started;until;lastPaid?}. This is an imposed payment obligation, not an invented defensive/protection pact. At most20cycles, amount1..1000; actual finite whole credits only, capped by the payer's current positive balance, paid at most once/year. Humiliation transfers at most200 actual available prestige. Liberation requires a currently landed direct vassal of the defeated house and changes only that vassal's allegiance.

**Entry points:**

- goalBlocker(s, attacker, defender, goal) and goalLabel(s, goal) are pure shared reads.
- declareWithGoal(s, attacker, defender, goal, options?) -> boolean in war.ts; options = {breakOath?:boolean; justification?:string}. Routes AI-AI, AI-player and player-AI through one validated goal; treaties/truces, captivity/regency, civil wars, current ownership/allegiance and costs revalidate before any mutations/RNG. justification is the ID of a saved, unexpired *refused* ultimatum, matching both houses and the exact goal; Codex supplies recordRefusedDemand(s,id,from,to,goal,expires) and refusedWarDemand(s,id) -> {id;from;to;goal;expires;used?} | undefined in warGoals.ts; Claude calls the writer only after a real refusal, with the exact demand mapped to WarGoal. No arbitrary free-CB flag. Once used it cannot justify another war. Older saves start with no refused-war-demand records; no log-derived claims are invented.
- settleDemand(s, attacker, defender, goal) -> boolean in warGoals.ts, for an *accepted* ultimatum/demand. Revalidates the exact same physical terms and changes only their stated effect. Claude's acceptance action validates the saved proposal and the recipient's explicit consent before calling it; no declaration or hidden capture follows acceptance.
- peaceTerms(s, warOrId, proposerId?) -> explained available options; offerPeace(s, warOrId, terms?, proposerId?) -> boolean; acceptPeace(s, warOrId, accept, recipientId?) -> boolean. Keep the existing war.ts offerPeace export as a compatible wrapper for bots/UI. Terms and exact receiver are revalidated on acceptance and again at settlement. The AI's explained chance depends on its own signed war score, proposed concession, diplomacy and weariness, with one decision roll and one envoy per war/cycle. Incoming AI offers wait for the player; AI-AI offers use the same evaluator. At +/-100 the war's stated outcome is enforced; obsolete goals cancel safely and return surviving loans, with no invented peace.

**Claude integration:** stanceOf(s,houseId,viewerId?) -> {kind;reasons}; rivalsOf(s,houseId,viewerId?) -> public rival IDs/reasons. Until supplied, Houses shows actual public treaties, protection direction, marriage/allegiance and war opponents, not guessed rivals/stances. Foreign policy may call declareWithGoal after its own real decision and must reuse the saved refused ultimatum, not generate a different war target or make a second acceptance roll. migrateForeignPolicy is called once from Codex-owned MIGRATIONS[11]; do not bump another version independently or modify published v10.

**Acceptance:** player/AI mirror goals, invalid/stale/duplicate offers inert with unchanged seed, capped payment conservation including legacy treaty tribute, no land for non-territorial wins, liberated-vassal allegiance revalidation, real participant cleanup/truces/one commander fate, old v1-v10 saves preserved, frozen v11 goal/offer/obligation fixtures. Full check, production desktop/390px E2E and inspected screens. Same20seeds x150/all4bots against65e16f3, with target misses recorded honestly; no base war-number retuning.

## Slice 3 and UI

`stanceOf(s, houseId, viewerId?)` returns current policy plus public-safe reasons. Succession can change it. Keep CB (justification) separate from the saved war goal and proposed peace terms; legacy wars without a goal retain their current settlement. Shared goal/term validators must recheck all ownership, custody, allegiance and funds before settlement, transfer only actual capped credits and use setOwner for every region change. Add non-territorial AI war goals only after removing the current region-target assumption safely.

Realm shows saved answers/refusals, expandable reasons and sent/remaining/lost ships below the side strengths. Battle reports retain real per-house casualties and usable profile links after reload. A Houses subview on System provides labelled planet/faith filters and wrapping cards at390px. Keep the seven main tabs. House identity appears before lengthy politics. All actions go through act(); breaking promises uses the second-tap Btn confirmation.

## Acceptance evidence

- Player/AI mirror wars, actual sovereign plus vassal decisions, local feuds, hard blockers and deliberate refusal, overlap with coalition/marriage roles, exact casualties/returns, commander death/succession, repeated cleanup, upkeep/capacity and seeded save/reload parity.
- Exact legacy expiry/opinions/route income; AI-AI treaty parity; neutral starting trust; one trust tick/breach charge; private knowledge boundaries; stale saved proposals/terms.
- Full check before every commit; production E2E and inspected desktop/390px screenshots for UI. Frozen v1-v8 play20 cycles and round-trip; final v9 fixtures include a real realm war, treaty, broken trust and pending ultimatum.
- Each slice measured against the same seed baseline, with honestly reported target misses. Add answered/refused calls and signed/broken treaty counts to the harness. Compare speed on **the same saved10k state**, serially; generated divergent checkpoints cannot prove no slowdown.
- Rebuild the embedded phone game before an authorised release, then verify exact-head CI/Pages and actual live play. A proposal document alone does not authorise contacting Claude or other people.
