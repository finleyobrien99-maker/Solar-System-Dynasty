# Solar Dynasty: The Roadmap

> **Written for the next AI (or human) who picks this up.** Read this before you touch anything.
> The game works and is live, but it's shallow: lots of systems, each only an inch deep.
> This document is the plan to make it as deep as Crusader Kings and as sticky as BitLife.
>
> **Building something?** The full design detail (genome tables, perk trees, story cycles, 150 event pitches, buildings, goods, planets, ships, faiths, laws, AI maths, achievements, crises, UI spec, save versions, test plan) is in [ROADMAP-DEEP-DIVES.md](ROADMAP-DEEP-DIVES.md).

Live build: https://finleyobrien99-maker.github.io/Solar-System-Dynasty/ (deploys on every push to `main`).

---

## Contents

0. [How to use this document](#0-how-to-use-this-document)
1. [Where the game is right now](#1-where-the-game-is-right-now)
2. [Why it feels shallow (honest diagnosis)](#2-why-it-feels-shallow-honest-diagnosis)
3. [Design pillars](#3-design-pillars)
4. [Phase 0: Foundations and tech debt](#phase-0-foundations-and-tech-debt)
5. [Phase 1: Characters become people](#phase-1-characters-become-people)
6. [Phase 2: Genetics and dynasty (the unique selling point)](#phase-2-genetics-and-dynasty-the-unique-selling-point)
7. [Phase 3: The narrative engine](#phase-3-the-narrative-engine)
8. [Phase 4: Realm, economy and planets](#phase-4-realm-economy-and-planets)
9. [Phase 5: War 2.0](#phase-5-war-20)
10. [Phase 6: Intrigue, politics and diplomacy](#phase-6-intrigue-politics-and-diplomacy)
11. [Phase 7: Faith and culture](#phase-7-faith-and-culture)
12. [Phase 8: AI that plays the game](#phase-8-ai-that-plays-the-game)
13. [Phase 9: UI/UX overhaul](#phase-9-uiux-overhaul)
14. [Phase 10: Replayability, modes and endgame](#phase-10-replayability-modes-and-endgame)
15. [Phase 11: Content backlog (ready-to-build lists)](#phase-11-content-backlog-ready-to-build-lists)
16. [Technical specs for the big systems](#16-technical-specs-for-the-big-systems)
17. [Balance targets and the balance harness](#17-balance-targets-and-the-balance-harness)
18. [Known bugs, rough edges and debt](#18-known-bugs-rough-edges-and-debt)
19. [Suggested order of work and the first 15 tickets](#19-suggested-order-of-work-and-the-first-15-tickets)
20. [Working agreement for AI contributors](#20-working-agreement-for-ai-contributors)

---

## 0. How to use this document

- **Priorities:** `P0` = do before anything else in its phase, `P1` = core of the phase, `P2` = makes it great, `P3` = nice to have.
- **Size:** `S` (< 1 session), `M` (1 to 2 sessions), `L` (3 to 5), `XL` (needs splitting into its own mini-roadmap).
- Every item tries to say **why**, **what**, **where** (files), and **done when** (acceptance). If an item is vague, sharpen it before building.
- Phases are thematic, not strictly sequential. Section 19 gives the actual recommended order.
- Tick items off by editing this file in the same PR that ships them (`- [x]`). Add new ideas at the end of the right phase, not in random places.
- The owner is **Fin**. Fin likes short, plain, funny British replies (swearing is fine) and makes the design calls. Ask Fin before anything that changes the feel of the game (UI direction, removing features, big balance swings). Don't ask about things you can decide with tests.

---

## 1. Where the game is right now

### Stack and shape

- Vite + React 19 + TypeScript, no backend. Saves live in `localStorage` (compressed with lz-string, checksummed, `.bak` per slot, export/import).
- **PWA**: manifest, icons, a service worker for offline play and Add to Home Screen on iPhone.
- **`mobile/`**: an Expo app that bundles the built game (`npm run build:app` via `scripts/embed-game.mjs`) with native save backup, haptics, the Android back button and a share-sheet export. It has its own `AGENTS.md`/`CLAUDE.md`.
- CI (`.github/workflows/ci.yml`): typecheck, vitest, build on every push and PR. Deploy (`deploy.yml`): GitHub Pages on push to `main`.

### Engine (src/game, pure TypeScript, no React)

| File | What it owns |
|---|---|
| `types.ts` | The whole `GameState` (plain JSON, must round-trip through `JSON.stringify`). |
| `rng.ts` | Seeded mulberry32 stored in `state.seed`. **All randomness must go through it.** |
| `core.ts` | Lookups, `effStats`, ranks and titles, the cached region index (**always change owners with `setOwner`**), `isVip`. |
| `world.ts` | World generation, starting scenarios (Governor/Viceroy/Monarch/Emperor), `startGame` (age, family, VIP options). |
| `character.ts`, `traits.ts`, `genetics.ts` | Character creation, about 90 traits, inheritance, Gene Vault (lock/purge). |
| `forge.ts` | Gene-Forge: research, splice, vat heirs, clones, faith stances. |
| `life.ts` | Health, death, births (host-house rule, capped/uncapped growth), growing up, matchmaking, succession. |
| `family.ts` | Suitors, marriage, education, cyber augments, laws, legitimisation. |
| `council.ts`, `cadets.ts`, `memory.ts`, `trade.ts` | Council seats, cadet branches, grudges/rivals, trade routes. |
| `war.ts`, `intrigue.ts`, `realm.ts`, `activities.ts`, `items.ts`, `economy.ts` | War, schemes, realm actions, activities, items, income lines. |
| `events.ts`, `eventsMore.ts`, `eventKit.ts` | 67 events, including delayed follow-ups and childhood events. |
| `ai.ts` | AI marriages, opinion drift, AI wars, rival plots, revolts, pruning. |
| `vip.ts` | VIP sandbox: trait/stat/age editor, god-tier presets, console actions. |
| `tick.ts` | `ageUp()`: the order every yearly system runs in. |
| `save.ts` | The save system and `migrate()`. |

Tests: `sim.test.ts` (long seeded sims, capped and uncapped), `features.test.ts`, `vip.test.ts`, and `events.test.ts` (fires every choice of every event).

### UI (src/ui, src/svg)

- `store.tsx`: `act(fn)` clones state, mutates the clone, swaps it in, and autosaves. **UI never mutates state any other way.**
- Tabs: Life, Family, Bloodline, Realm, System, Actions, Treasury. Modals: event, character (with VIP editor), clan, codex, suitors, tree, saves, menu, VIP console.
- `src/svg/`: everything is procedural SVG (portraits, sigils, planets, Voronoi region maps, solar map with orbits, ships, items, icons).

### UI direction is undecided

Fin isn't keen on the current UI. Three concept artboards were made (private claude.ai artifacts owned by Fin; you may not be able to open them):

- **A, Holo-Command**: dark sci-fi command deck, glowing panels, dense data.
- **B, Heraldic Court**: navy and gold, serif type, an illuminated chronicle in space ("The Book of Blood").
- **C, Pocket Life**: light, chunky, friendly BitLife cards with a first-person feed and a big yellow Age button.

**Ask Fin which one (or which mix) before Phase 9.**

---

## 2. Why it feels shallow (honest diagnosis)

This is the "puddle" list. Every phase below exists to fix one or more of these.

1. **Characters are stat blocks, not people.** Nobody has a relationship with anybody except via a clan-wide opinion number. Your spouse doesn't love or hate you. Your kids don't resent you. Nobody has friends.
2. **Choices don't echo.** Most events are one-shot. A handful of follow-ups exist, but there's no long-running story, no consequences you can trace back, and no history.
3. **The economy is one number.** Regions produce credits from `dev`. No population, buildings, goods, shortages, or reasons to care about *which* region you hold.
4. **War is a progress bar.** One roll per battle and a score. No fleets in space, no travel, no sieges, no commanders who matter, no terrain.
5. **Planets are wallpaper.** Each has a bonus and some names. Gravity, atmosphere, distance, moons and orbital position do nothing.
6. **Genetics is a sticker book.** Traits are tags you collect. No genotype, recessive genes, inbreeding cost, or trade-offs, so "build the perfect bloodline" is solved too fast (especially with the Forge).
7. **The AI doesn't want anything.** AI houses drift, marry and occasionally attack. They have no goals, plans, personalities or memory beyond grudges.
8. **Faith and culture are currencies.** Faith is spent like money. No doctrines, holy sites, schisms, or cultural identity.
9. **There's no reason to keep playing at year 150.** No ambitions, no endgame, no crises, no legacy score, no "one more generation" hook.
10. **The UI is a spreadsheet with tabs.** Lots of information and little drama. Age-ups don't feel like moments.

---

## 3. Design pillars

Hold every feature up to these. If it doesn't serve at least two, it waits.

1. **Every cycle tells a story.** Age Up should produce at least one line you'd read out to a mate. (BitLife's whole magic.)
2. **Blood is the long game.** Decisions should matter three generations later. Genes, grudges, debts, claims, legends.
3. **Systems talk to each other.** A new system must read from or write to at least two existing ones (e.g. plague touches health, economy, faith and AI aggression).
4. **The solar system is real.** Distances, orbits, gravity and light-lag are mechanics, not flavour.
5. **Explain everything.** Every number has a tooltip saying where it came from. Reviewers of the inspiration game hated confusion.
6. **Saves are sacred.** Never ship a change that can break an old save. Migrations for everything.
7. **Phone first.** Most players will tap with a thumb on a 390px screen.
8. **Fiction, not endorsement.** The "perfect bloodline" fantasy is a villain fantasy in a sci-fi setting. The world should react to it (backlash, rebellions, rival ideologies) so it plays like a story with consequences, not a lecture and not a celebration.

---

## Phase 0: Foundations and tech debt

Do these first. Everything after this phase gets cheaper because of them.

### 0.1 Save migrations framework `P0` `S`
- **Status: done.** `MIGRATIONS` and `migrate()` in `save.ts`; saves from a newer build are refused with a clear message (the phone app embeds an older build, so this happens). Frozen v1 saves for every scenario, plus VIP and a finished game, live in `src/game/__fixtures__/`. `save.test.ts` loads each, plays 20 cycles, round-trips it and checks every migration is idempotent. After a version bump, `npm run fixtures` adds saves for the new version and never touches old ones.
- **Why:** every later phase changes `GameState`. Right now `migrate()` just `??=` fills defaults and `SAVE_VERSION` is still 1.
- **What:** `MIGRATIONS: Record<number, (s: any) => void>` applied in order from the save's version to `SAVE_VERSION`. Bump the version per schema change. Keep a folder of fixture saves (`src/game/__fixtures__/save-v1.json`, …) and a test that loads every fixture, migrates it, runs 20 cycles and saves again.
- **Done when:** a v1 save from today's live build loads after every future PR (CI enforces it).

### 0.2 Content as data `P0` `M`
- **Why:** events, traits, planets, items, activities and schemes are TypeScript literals mixed with logic. Content is about to grow 10×.
- **What:** keep the logic in TS, but move pure data (names, descriptions, weights, numbers) into typed data modules under `src/content/` grouped by domain. Event effects stay as typed functions, but put them behind the event DSL (see 3.1).
- **Done when:** adding a trait or event never requires touching engine files.

### 0.3 RNG streams `P1` `S`
- **What:** derive independent streams per subsystem (`rngFor(s, 'births')`) from the main seed plus a counter, so adding a random call in one system doesn't reshuffle every other system. That keeps balance tests and seed-sharing stable.

### 0.4 Performance budget for huge dynasties `P0` `M`
- **Why:** uncapped growth is a selling point (Fin wants the bloodline everywhere). A 2,000-member tick was about 50ms after earlier optimisation, but saves and lookups will grow.
- **What:**
  - **Archive the dead.** Move dead non-notable characters into a compact `archive` (id, name, born, died, parents, clanId, genetic traits) that the tree and clone screens can still read.
  - Index characters by clan and by "alive" (WeakMap cache like the region index).
  - Time-slice AI work over cycles.
  - Add `npm run bench`, which reports tick time and save size at 500 / 2k / 10k members.
- **Done when:** a 10k-member dynasty ages up in under 100ms on a mid phone and saves stay under 2MB compressed.
- **Status: first pass done.** `npm run bench` grows a dynasty as fast as it will go (the Breeder bot plus forced marriages) and times the real `writeSave` against an in-memory localStorage. Desktop, Oct 2026, same seeded game before and after:

  | Living dynasty | All characters | Age Up | act() copy per click | Autosave | Saved |
  |---|---|---|---|---|---|
  | 504 | 1,071 | 6.9 → 4.5 ms | 3.6 ms | 69 → 16 ms | 97 KB |
  | 2,064 | 3,515 | 24 → 15 ms | 12 ms | 226 → 47 ms | 287 KB |
  | 10,054 | 16,314 | 145 → 95 ms | 82 ms | 1,721 → 233 ms | 1.2 MB |

  - **Autosave:** compression was 85% of it. Storage saves now use deflate (`fflate`, `codec.ts`, envelope `z: 'df'`), about 10× faster than lz-string. Old lz-string saves still load, and exports stay lz-string base64 so older builds can import them. Every write is still read back and verified; a save this session already verified isn't re-checked before it's rotated into the backup.
  - **Age Up:** `currentHeir` no longer ranks the whole dynasty to find one heir (lazy succession groups). Health skips stat maths for the healthy. Trait sums don't allocate. AI succession only scans for kin when the old head left no children in the house.
  - All of it is behaviour-preserving: fingerprints of the full state after 150 seeded cycles (every bot, three seeds, plus the 10k dynasty) were identical before and after.
  - **Still to do, in order:** (1) the per-click `structuredClone` in `act()` (82 ms at 10k); (2) an index of characters by house, which means a `setClan()` rule like `setOwner()` (houses change in `createCharacter`, `cadets.ts` twice and the suitor-adoption event), worth about a fifth of an Age Up; (3) the archive for the dead (only ~37% of characters, so it comes last).

### 0.5 Balance harness `P0` `M`
See section 17. Headless runner, bot strategies, CSV/JSON output, a summary table in CI artefacts.
- **Status: done.** `npm run balance` (`scripts/balance.ts`, engine side in `src/game/balance.ts`) plays seeded Governor starts with four bots from `src/game/bots.ts` (Passive, Builder, Warmonger, Breeder) and scores them against the section 17 targets. It writes `runs.csv`, `series.csv`, `runs.json` and `summary.md` to `balance-report/`. CI runs 8 seeds × 200 cycles per push and posts the summary on the run page. Schemer and VIP "God" bots still to add. First findings are in section 18.

### 0.6 UI foundations `P1` `M`
- **Status: error boundary and bundle split done.** `src/ui/ErrorBoundary.tsx` offers Try again, Export save, Go back one save and Back to title. React now ships in its own chunk (warning gone). Screens are deliberately **not** lazy-loaded: the offline service worker only caches files once fetched, so a lazy screen never opened online would fail offline. Revisit only with a precaching service worker. Tokens and the panel stack still to do.
- Design tokens (CSS variables) for colour, type, radius, spacing and shadow, so any of the three UI concepts can be skinned in.
- An error boundary that catches render crashes and offers "Export save" and "Reload from backup".
- Panel routing (`ui.panel`) is ad hoc. Make it a small typed stack so modals can push and pop (back button support for the Expo app).
- Code-split the bundle (Vite warns the main chunk is over 500kB). Lazy-load Codex, Tree and the solar map.

### 0.7 Test and tooling upgrades `P1` `S`
- **Status: ESLint and Prettier done, both in CI** (`npm run lint`, `npm run format:check`). `eslint.config.js` also enforces engine purity and no `Math.random` in `src/game`. Prettier is width 160; `styles.css` and the markdown docs are left hand-laid-out, and one-line-per-entry data tables carry `// prettier-ignore` (see `TRAITS`). **Playwright smoke done and in CI** (`npm run e2e`, `e2e/smoke.spec.ts`): every scenario at 1280px and 390px plays 20 cycles and opens every tab and window, failing on console errors, the crash screen or sideways scrolling. It drives an installed browser (Edge locally, Chrome on CI), so nothing is downloaded. RTL component tests still to do.
- ESLint + Prettier (the repo has neither), run in CI.
- Playwright e2e smoke in CI: new game in each scenario, age 20 cycles, open every tab and modal, assert no console errors. (Chromium is available in CI images; use the installed one.)
- React Testing Library for a few components (trait picker, Btn tap-twice confirm, save modal).

### 0.8 Telemetry-free analytics for playtesting `P3` `S`
- An opt-in local "run report" exported with the save (cycles played, rank reached, causes of death, events seen), useful when Fin sends a save over.

---

## Phase 1: Characters become people

The BitLife half. Goal: you care about specific people, not stats.

### 1.1 Personal relationships `P0` `L`
- **What:** a sparse opinion matrix between characters (`relations: Record<charId, Record<charId, Relation>>`, only for pairs that have interacted). `Relation = { opinion: number; kind?: 'friend'|'rival'|'lover'|'nemesis'|'mentor'|'ward'|'crush'; since: number; memories: string[] }`.
- **Sources of opinion:** shared traits (+), opposite traits (−), events, gifts, schemes, family ties, neglect (ruler never spends time with a child), being passed over in succession, executions of kin.
- **Effects:** spouses with low opinion have affairs, refuse children or plot. Kids who hate you become disloyal heirs or found hostile cadet branches. Friends give bonuses and lovers spawn events. Nemeses spawn feud storylines.
- **UI:** a relationships list on the character modal; "Spend time with…" actions (dinner, sparring, stargazing) on the Life tab.
- **Done when:** a test shows that ignoring a child for 10 cycles makes them hostile and that it changes succession-crisis odds.

### 1.2 Stress and mental state `P1` `M`
- CK3-style stress gauge, raised by acting against personality (a Kind ruler executing someone), wars, deaths in the family and overwork. Levels add a break event with coping traits (Drunkard, Flagellant, Reclusive, Rage-Prone, Stim-Addict already exists).
- Stress relief activities depend on personality (Gregarious → feasts, Shy → observatory).

### 1.3 Lifestyles and perk trees `P1` `L`
- Each adult picks a focus: Diplomacy, Command, Economy, Intrigue or Science, plus a sixth one, **Genetics**, unique to this game. Focus earns XP each cycle.
- Each focus has 2 or 3 small trees of about 8 perks. Example Genetics perks:
  - **Eugenic Eye**: see hidden recessive genes on suitors.
  - **Steady Hands**: splice success +15%.
  - **Bloodwright**: one extra vault slot.
  - **Living Archive**: clones keep one personality trait.
- Perks give ruler-unique power and a reason to care who rules.

### 1.4 Childhood that matters `P1` `M`
Childhood events already exist (shaping personality). Deepen them:
- Stages: infant (0–2), child (3–9), youth (10–15). Each has 3 to 6 milestone events.
- Guardian or tutor is a *character* (not just a tier). Their traits bleed into the child, and their relationship with the child persists.
- Childhood friends and rivals become adult relations.
- Personality is "locked in" at 16, with a summary card ("Kravan grew up Brave, Paranoid and Ambitious, thanks to his spymaster tutor and his sister's bullying").

### 1.5 Secrets and hooks `P0` `L`
- Secrets: affairs, illegitimate children, murders, heresy, a secret clone, gene crimes (illegal splices), debts, cowardice in battle.
- Secrets can be **discovered** via schemes, spymasters and events. A discovered secret creates a **hook** (weak or strong) that can be spent to force favours: marriage, a vote, a gift, joining a war.
- The player also has secrets the AI can find, which is how you get blackmailed.
- This is the glue between intrigue, family and events.

### 1.6 Health 2.0 `P1` `M`
- A disease catalogue with real behaviour. Each disease has incubation, contagion, lethality, cure chance and treatments:
  - Martian Dust Lung
  - Titan Rot
  - Void Fever
  - Gravity Sickness (when moving between worlds)
  - Neural Lace Rejection
  - Gene-Rot crisis
- **Epidemics** spread along trade routes and fleet movements (great system crossover).
- Injuries from duels, battles, hunts and assassination attempts, with lasting effects (Scarred, Maimed, Blind, Brain-Damaged).
- A court physician position (see 6.3) with skill and personality. Bad doctors kill people.

### 1.7 Life log, obituaries and epitaphs `P1` `S`
- Each character keeps a short log of their own notable moments (born, married, battles, scandals, children, titles).
- On death, show a BitLife-style **obituary card**: life summary, "Known for…", epithet, and ratings (Happiness, Glory, Family, Infamy).
- Epithets earned by behaviour: "the Cruel", "the Builder", "the Twice-Cloned", "Gene-Mother", "the Unready", "Voidborn".
- Regnal numbers: "Vesna II Kravos".

### 1.8 Names and appearance `P2` `M`
- Better name generator per culture (some names are too short, like "Dra"), with naming traditions (name a child after a grandparent) and nicknames.
- Portraits:
  - visible ageing stages
  - clothing by culture and rank
  - genetic traits shown on the body (Giant = taller frame, Bioluminescent glow, Void-Adapted pale skin)
  - cybernetics drawn on (some already are)
  - pregnancy
  - illness pallor
  - scars by location

### 1.9 Romance and marriage depth `P2` `M`
- Courtship as a short storyline rather than an instant pick: meet, gifts, scandal risk.
- Marriage types: political matrilineal or patrilineal, consort, polycule? (check with Fin), and gene-contract marriages (one heir for a gene sample, then annulment).
- Divorce has consequences: grudges with the ex's house, custody of kids, lost alliance.

---

## Phase 2: Genetics and dynasty (the unique selling point)

This is the bit no other game does. Make it *deep*.

### 2.1 Real genotype model `P0` `XL` (split it)
- **Why:** the trait-tag model has no hidden information, no surprises and no carriers. Real genetics gives drama ("both parents are Brilliant, so why is the baby Slow?").
- **What:** every heritable trait group becomes a **locus** with two alleles per character (one from each parent). Alleles have dominance (dominant, recessive, co-dominant/additive for ladders). The **phenotype** (the visible trait) is computed from the genotype. Ladders like intellect become additive: the sum of allele values maps to Dim…Genius.
- **Carriers:** characters can carry a recessive Gene-Rot allele without showing it. The vault's "purge" now means "screen out carriers", which matters.
- **Migration:** convert each existing trait into a plausible genotype (`Genius` → two high alleles). Characters without a trait in a group get two neutral alleles.
- **Mutation:** a small chance per allele per birth. Psionic and xeno alleles come from mutation, relics, or alien contact.
- **Done when:** the inheritance odds shown in the UI match 10k simulated births within 2%.
- See section 16.1 for the data model.

### 2.2 Inbreeding and genetic diversity `P0` `M`
- Compute a consanguinity coefficient (Wright's F) from the family tree, with caching. High F raises the chance that recessive bad alleles pair up (Gene-Rot, Sickly, Barren, Lunatic, Brittle Bones).
- This is the natural brake on "marry your cousin to keep Genius". Make it visible: the suitor list shows a **Kinship** warning and the predicted risk.
- Add a "Bloodline diversity" stat to the Bloodline tab.

### 2.3 Offspring predictor `P1` `M`
- In the suitor modal and on any couple: a panel showing each locus's odds for their children (Punnett-square style, or a simple bar per outcome).
- The Genetics lifestyle perk "Eugenic Eye" reveals hidden carrier alleles; without it, you see phenotypes only and the odds are fuzzier.

### 2.4 Planetary adaptation genes `P1` `M`
- New loci tied to worlds: high-gravity build (Jupiter-born moons), low-gravity frame (Ceres, Pluto), radiation hardening (Mercury), cryo-tolerance (Neptune, Pluto), toxin resistance (Venus).
- Characters living off their adapted world take health and stat penalties, which ties genetics to the map and to war (your Plutonian troops struggle on Venus).
- Adaptation alleles drift in populations over generations.

### 2.5 Dynasty legacies (renown) `P1` `L`
- Split **dynasty renown** from personal prestige. Renown is earned by everyone of the blood (titles held, wars won, notable births).
- Spend it on dynasty-wide **legacy trees** of 5 tiers each:
  - Blood (genetic stability and mutation control)
  - Warfare
  - Intrigue
  - Kinship (cadet loyalty, marriage reach)
  - Ascension (forge efficiency, clone quality)
  - Faith
- A **dynasty head vs house head** split: cadet branches have their own heads, and the dynasty head can call on them (or be challenged by them).

### 2.6 Cadet branch politics `P1` `M`
- Cadets have ambitions: they can demand independence, claim the main title, intermarry with your enemies, or start their own gene programmes that diverge from yours.
- A cadet that breaks away keeps your genes but stops sharing your locks (a fork of the bloodline).
- **Done when:** a test shows a mistreated cadet with high strength declaring independence.

### 2.7 Bloodline projects `P1` `M`
- Multi-generational goals with rewards, chosen from the Bloodline tab. Examples:
  - "Breed a natural (un-spliced) Psionic Ascendant"
  - "Seven generations of Genius rulers"
  - "A living descendant on all ten worlds"
  - "Purge Gene-Rot from every carrier"
  - "Clone the Founder"
- Rewards: legacy points, unique traits ("Pure Line", "Ancient Blood"), events.

### 2.8 Gene-Forge 2.0 `P1` `L`
- A research **tech tree** (not just a list): Sequencing I–III, CRISPR-Lattice, Embryo Screening, Vat Gestation, Neural Imprinting (clones keep memories?), Xeno-Splicing, and Germline Editing (changes alleles, not just phenotype).
- **Labs as buildings** on regions (see 4.2). Scientists are characters; their traits matter (a Reckless scientist works faster and fails worse).
- **Failure modes** become stories: mutant children, escaped organisms, a clone who thinks they're the original, a vat-born rebellion.
- **Gene patents and theft:** sell sequenced genes to other houses, or steal theirs with spy schemes. Gene-sharing pacts become a diplomatic tool.
- VIP mode keeps "unlimited and free" for the player only (Fin's explicit ask). Never give VIP perks to the AI.

### 2.9 The world reacts to gene-crafting `P1` `M`
- **Purity movements** and **Synthetic Rights** factions form inside realms with lots of vat-born or clones.
- Other houses' opinion of you depends on their faith and culture stance (some admire a "perfect" house, most fear it).
- A system-wide **Gene Accords** vote in the Solar Diet (see 6.5) can ban practices. Breaking the accords gives casus belli against you.
- Vat-born and clones can become a caste with their own events, rights and revolts.

### 2.10 Pedigree and family tree overhaul `P2` `L`
- The tree view:
  - zoom and pan
  - collapse branches
  - a genetics overlay (colour by allele or trait)
  - a path highlight ("how is this person related to me?")
  - shows cadet houses
  - search
  - copes with 10k members
- Export the tree as an SVG or PNG image to share.

---

## Phase 3: The narrative engine

Content is the cheapest depth there is. This phase builds the machine and then feeds it.

### 3.1 Event DSL v2 `P0` `L`
- **What:** a typed declarative schema (see section 16.2):
  - **triggers**: conditions on scopes
  - **scopes**: root, spouse, heir, liege, rival, random courtier, planet, region…
  - **weight modifiers**
  - **options**: conditions, AI weight and effects, with tooltip text auto-generated from the effects
  - **follow-ups** with delays
  - **flags**, and **localisation keys**
- The current `eventKit.ts` and the delayed follow-ups are a start. Fold them in.
- An effect preview auto-generates option tooltips like "+50 credits, Spouse opinion −15, 20% chance: Wounded" (Pillar 5).
- **Done when:** all 67 existing events are ported and `events.test.ts` still fires every option.

### 3.2 Story cycles `P0` `L`
- Long-running storylines that live in state (`stories: Story[]`) with their own stage, actors and timers, and fire events over years. Examples:
  - **The Derelict**: a ghost ship found near Neptune. Explore, salvage, awaken something, alien relic or plague.
  - **The Feud**: escalates from insults to duels to assassinations to war unless someone breaks it.
  - **The Forbidden Love**: your heir and the daughter of your sworn rival.
  - **The Prodigy**: a commoner genius at court. Adopt, marry into the dynasty, or crush them.
  - **The Long Plague**: spreads world to world, with cures researched in the Forge.
  - **The Pretender**: someone claims to be your dead brother. Is it a clone?
  - **The Leviathan**: a void creature in the Belt, hunted across generations.
  - **The Sleeper Agent**: an implanted spy in your court since childhood.
- Aim for 25 story cycles by the end of the phase.

### 3.3 Decisions `P1` `M`
- Player-initiated, conditional, usually big. A Decisions panel lists what's available and what's locked (and why). Examples:
  - **Form the Jovian League** (hold Jupiter plus 2 moons)
  - **Restore the Old Earth Senate**
  - **Declare the Machine Ascendancy** (requires the Machine faith and a fully cybernetic ruler)
  - **Found a New Faith**
  - **Move the Capital**
  - **Build a Dyson Swarm** (endgame)
  - **Adopt a Ward**
  - **Abdicate**, a must-have given immortal VIP rulers
  - **Hold a Grand Tournament**
  - **Commission a Monument**

### 3.4 Ambitions per ruler `P1` `M`
- When a ruler takes the throne, pick 1 of 3 ambitions suited to their traits ("Unite Mars", "Sire five children", "Become a War Hero", "Sequence Ageless", "Destroy House Dragunov"). Success gives prestige, renown and a lasting trait. Failure at death shows in the obituary.

### 3.5 The Chronicle `P2` `M`
- An auto-written dynasty history book, chapter per ruler, generated from logs and story outcomes, e.g. "In 2518 Vesna Kravos sent Branur Dragunov to the block, and House Dragunov never forgot." Viewable in the Codex and exportable as text or HTML. Fits the Heraldic Court UI concept beautifully.

### 3.6 Event content targets `P1` `XL` (ongoing)
- Target **400+ events** by the end of the roadmap. Category quotas (current count in brackets, roughly):

| Category | Target | Example seeds |
|---|---|---|
| Childhood and youth | 40 | First flight, bullied by a cousin, sneaks onto a warship, imaginary friend is a real AI |
| Romance and marriage | 35 | Arranged-marriage cold feet, love letters intercepted, wedding sabotage |
| Court life | 50 | Drunken councillor, portrait commission, poet's satire, guest overstays |
| Family drama | 40 | Sibling rivalry, disinheritance threats, a long-lost twin, a parent's dementia |
| Health and body | 30 | Implant malfunction, gravity sickness, plague outbreak, miracle cure |
| Genetics and Forge | 35 | Mutant birth, clone identity crisis, gene thief caught, vat-born uprising |
| War and fleet | 40 | Mutiny, a captured flagship, a hero commoner, a war-crime accusation |
| Intrigue | 35 | Poisoned cup, a double agent, a forged will, blackmail letters |
| Faith | 30 | Miracles, heresy trials, pilgrim crisis, a prophet in the slums |
| Economy and trade | 25 | Market crash, helium-3 boom, pirate tariffs, strike at the shipyards |
| Planet-specific | 50 (5 per world) | Venus acid storms, Mercury sunside fires, Pluto's long night festival |
| Space phenomena | 20 | Comet omen, solar flare, alien signal, derelict beacon |
| Endgame and crises | 15 | See 10.4 |

- **Every event needs:** at least two meaningful options, at least one option that touches another system, and an icon or art seed. Childhood events must have personality consequences.

---

## Phase 4: Realm, economy and planets

### 4.1 Population (pops) `P1` `L`
- Each region gets population blocks: class (nobles, citizens, workers, spacers, vat-born), culture, faith, happiness, size.
- Pops produce goods and taxes, demand goods, riot when unhappy, migrate along trade routes, and can be converted.
- Keep it light. This is a dynasty game, not Victoria. 3 to 6 pop blocks per region, max.

### 4.2 Buildings `P0` `L`
- 3 to 6 building slots per region (more with dev). Buildings take cycles to construct and cost goods and credits:
  - Shipyard
  - Mine/Refinery
  - Hydroponics
  - Academy (education tier bonus)
  - Gene Lab (Forge research)
  - Temple
  - Fortress/Shield Generator
  - Spaceport (trade cap)
  - Barracks
  - Palace (court size)
  - Arcology (pop cap)
  - Observatory (science, omens)
- Planet-specific buildings: Venus cloud cities, Mercury solar collectors, Jovian helium skimmers, the Saturnian ring mines, Plutonian cryo-vaults (store gene samples and clone the dead even without a living sample).
- **Done when:** which region you conquer matters (some have the only gene lab slot on the planet).

### 4.3 Goods and markets `P1` `L`
- 6 to 10 goods: metals, volatiles, food, helium-3, exotics, munitions, luxuries, biomatter, and data cores.
- Each planet has a market with supply and demand prices. Trade routes (already in) carry real goods with capacity. Shortages cause events (famine, fuel crisis). Blockades starve worlds.

### 4.4 Real planets `P1` `M`
- Planet properties: gravity, atmosphere, temperature, radiation, day length, hazards.
- These feed into health (adaptation genes, 2.4), building options, war (landing difficulty) and events.
- **Moons and minor bodies as regions or holdings:** the Galilean moons (Io, Europa, Ganymede, Callisto), Titan, Enceladus, Triton, Charon, Phobos/Deimos, plus Belt and Kuiper outposts and space stations at Lagrange points.
- **Colonisation:** claim empty bodies with an outpost ship, then grow them into regions.

### 4.5 Orbits matter `P2` `M`
- The solar map already animates orbits. Make the positions mechanical: travel time between worlds depends on the current orbital distance. Conjunction windows make some invasions or trade cheap for a few cycles; opposition makes them slow.
- Light-lag for diplomacy and orders on the outer worlds (orders to Pluto arrive a cycle late) is optional, but very on-theme.

### 4.6 Laws and governance `P1` `M`
- **Realm laws:**
  - crown authority (how much vassals obey)
  - tax law
  - levy law
  - gene law (what's legal in your realm)
  - AI governance (machine administrators: efficient but the Solar faith hates them)
  - succession law (exists) and gender law (exists)
- **Vassal contracts:** per-vassal negotiated tax and levy levels and special rights.

### 4.7 Stability, unrest and disasters `P1` `M`
- Per-region stability drives revolt odds, from pop happiness, faith/culture mismatch, garrison, and the ruler's Diplomacy and Just/Cruel traits.
- Disasters, each with a story cycle:
  - Asteroid strike
  - Reactor meltdown
  - Solar storm
  - Dome breach
  - Rogue AI
  - Crop blight (blight already exists)
  - Earthquake on Mars

### 4.8 Eras and technology `P2` `L`
- System-wide eras (The Collapse → Reclamation → Expansion → Golden Age → Twilight), advanced by collective progress, with era-specific events, ships and buildings.
- Per-culture innovations unlock buildings, laws and ships.

---

## Phase 5: War 2.0

### 5.1 Fleets as entities `P0` `XL`
- Replace the single `fleet` number with fleets:
  - ship counts by class (corvette, frigate, cruiser, dreadnought, carrier, troopship)
  - a commander character
  - a location on the solar map
  - an order: move, blockade, siege, patrol or escort
  - supply and morale
- Moving takes cycles (orbit-aware, see 4.5). You can have several fleets.
- **Migration:** the existing `s.fleet` number becomes one home fleet of mixed frigates. AI clan `fleet` numbers become AI fleets lazily (only when at war) to keep the tick cheap.

### 5.2 Ground war and sieges `P1` `L`
- Regions need **troops** to capture. Troopships carry them, garrisons and fortresses defend, and a siege takes cycles.
- Orbital bombardment speeds sieges but costs prestige and faith, kills pops, and gives other houses a casus belli against you.
- Blockades cut trade and starve worlds (see 4.3).

### 5.3 Battle resolution v2 `P1` `M`
- Three phases: long range (carriers and missiles), closing (cruisers), boarding (marines and commander's Command). Terrain modifiers: asteroid fields, gas-giant atmospheres, sun-glare near Mercury, the Kuiper dark.
- Commander **tactics cards** drawn from traits and perks (Brave gives "Ramming Speed", Patient gives "Bait and Wait"); the player picks one if leading personally.
- Animated SVG battle report (ship silhouettes from `Ship.tsx`, losses ticking down).
- Captured commanders become prisoners and ransom material.

### 5.4 War goals, war score and peace `P1` `M`
- War score from battles, occupations, blockades and holding the war goal. A peace deal menu:
  - regions
  - credits
  - hostages/wards
  - **gene samples** (unique to this game)
  - vassalisation
  - truce length
  - an enforced marriage
- **Threat:** big expansion builds system-wide fear, and coalitions form against aggressive houses. Marriage alliances auto-call allies.

### 5.5 Ship design and legendary ships `P2` `M`
- Simple designer: hull plus 3 to 5 module slots. Flagships have names and histories. They gain veterancy and legends ("The *Iron Widow*, flagship of three Kravos rulers"). Legendary ships can be relics in the Treasury.

### 5.6 Mercenaries, pirates and holy orders `P2` `M`
- Mercenary companies as hireable factions with their own leaders. Pirate clans in the Belt are real actors that raid routes (which already exist as a risk roll). Holy orders tied to faiths fight holy wars for free.

---

## Phase 6: Intrigue, politics and diplomacy

### 6.1 Schemes as storylines `P0` `M`
- Turn schemes into multi-cycle progress bars with **agents** (recruited characters), secrecy, discovery and success odds. Counter-intelligence comes from your spymaster. Discovery creates secrets and hooks (1.5).
- Scheme types:
  - murder, abduct, seduce, befriend, sway
  - fabricate a claim
  - steal a gene sample
  - sabotage a forge
  - plant a sleeper
  - incite a revolt

### 6.2 Factions inside your realm `P1` `M`
- Vassals form factions (Claimant, Independence, Liberty / lower crown authority, Purity / anti-forge, Synthetic Rights). Each faction shows its strength, members and demand. Ignore it and they revolt.

### 6.3 More court positions `P1` `S`
- Beyond the council:
  - court physician
  - champion
  - chief geneticist (separate from the Chief Scientist, or merged and renamed)
  - chaplain
  - master of ships
  - court jester (event fodder)
  - ambassador posts placed *at other courts* (opinion and spying)
- Each has salary, skill and events.

### 6.4 Diplomacy menu `P1` `M`
- Treaties: non-aggression, trade pact, defensive pact, gene-sharing pact, wardship/hostage exchange, marriage alliance. Embassies. Opinion reasons are broken down in tooltips ("+20 married your sister, −40 executed Branur").

### 6.5 The Solar Diet `P2` `L`
- A system-wide assembly where the big houses vote every N cycles on laws: Gene Accords, trade tariffs, piracy, the Emperor's powers, and recognising a claimant. You lobby with hooks, gifts and threats. Holding the Solar Throne makes you its president, or the Diet's target.

### 6.6 Claims, pretenders and regencies `P1` `M`
- Claims system: inherited claims, pressed and unpressed, weak and strong. Pretenders appear on succession. Child rulers get a **regency council** with a regent who may not give power back.
- Information fog: you don't know rivals' exact fleet size or secrets without spies.

---

## Phase 7: Faith and culture

### 7.1 Faith doctrines `P1` `L`
- Each of the 6 faiths (Solar, Veiled, Red, Machine, Abyssal, Far Dark) gets 3 to 5 tenets and doctrines covering:
  - marriage
  - gene stance (exists)
  - cybernetics stance
  - war
  - clergy
  - death rites (cloning the dead: holy or abomination?)
- **Holy sites** per planet: control them for bonuses, and pilgrimage to specific sites.
- **A religious head** (character) who can excommunicate you, call holy wars, or be your puppet.

### 7.2 Heresies, schisms and reformation `P2` `L`
- Heresies spawn in unhappy pops or from events, can spread, and can split a faith.
- A **reformation decision** lets the player found a new faith from tenets (e.g. "Church of the Forge", where gene-crafting is sacred). The AI can do it too.

### 7.3 Culture `P1` `M`
- Each planet's people form a culture with traditions (Martian Iron Discipline, Venusian Cloud Courtliness, Plutonian Long-Night Patience), language and ethos. Acceptance between cultures, and hybrid cultures when the dynasty spreads (Fin wants the blood everywhere, so hybrid cultures should be a natural result of sprawl).

---

## Phase 8: AI that plays the game

### 8.1 Utility AI with goals `P0` `L`
- AI houses get **personalities** (from the head's traits) and **goals** (expand, secure succession, breed a trait, revenge, get rich, convert others). Each cycle they score options (war, marry, scheme, build, trade, ally) with utility functions. They use the *same rules* as the player (no hidden cheats except difficulty multipliers).

### 8.2 AI dynastic strategy `P1` `M`
- AI houses marry for alliances and genes, use their own Gene Vault in Standard mode (it makes rivals feel alive; VIP never helps them), press claims for their kids, and react to your bloodline's reputation.

### 8.3 AI memory and personality consistency `P1` `S`
- Grudges exist. Add favours, debts and personal relations from 1.1 so AI heads behave consistently with their history and traits.

### 8.4 Difficulty levels `P2` `S`
- Story / Standard / Brutal: AI aggression, event harshness, income multipliers. VIP stays separate from difficulty.

---

## Phase 9: UI/UX overhaul

### 9.1 Pick a direction with Fin `P0` `S`
- Show the three concepts (A Holo-Command, B Heraldic Court, C Pocket Life). Build tokens for the winner (0.6). Re-skin screen by screen behind a setting so the old UI keeps working until the new one is complete.

### 9.2 A life feed as the home screen `P1` `L`
- BitLife's magic is the scrolling first-person feed per year and the big Age button. Make the Life screen a feed:
  - this cycle's events as cards
  - portraits inline
  - tappable names and houses
  - collapsible history by year
- Everything else (realm, war, genes) lives in drawers or tabs off it.

### 9.3 Moments `P1` `M`
- Age Up should feel like an event: a short transition, a year card ("2519: The year of the Dragunov Feud"), birth and death fanfares, coronation screens, a battle report animation, and an obituary card (1.7).

### 9.4 Onboarding and explanation `P0` `M`
- A guided first 10 cycles (optional): highlight the Age Up button, the first marriage, the first heir, the Gene Vault.
- Contextual "?" hints. Every number keeps its tooltip breakdown (Pillar 5).
- A glossary in the Codex.

### 9.5 Maps that matter `P1` `L`
- Solar map: fleets (5.1), trade lanes (exist), plague spread, holy sites, borders, and conjunction windows.
- Planet map: regions with buildings, unrest and pops.
- Pinch-zoom and pan on phones.

### 9.6 Accessibility `P1` `S`
- Keyboard navigation, focus rings, ARIA on custom controls, colourblind-safe trait colours (currently genetic/personality/cyber are colour-only), text size setting, reduced-motion setting.

### 9.7 Sound and haptics `P3` `M`
- Optional ambient music (Web Audio, generated or small loops), UI blips, and haptics in the Expo app (already partly wired).

### 9.8 Settings screen `P1` `S`
- Autosave behaviour, confirmations, auto-age-up speed, difficulty (8.4), text size, theme, reset tutorial, and VIP sub-toggles.

---

## Phase 10: Replayability, modes and endgame

### 10.1 Game rules screen `P1` `S`
- Like CK3's game rules, at new game: AI aggression, event frequency, mutation rate, dynasty growth (exists), plague severity, Forge availability, VIP (exists), starting era.

### 10.2 More start scenarios `P2` `M`
- Exists: Governor/Viceroy/Monarch/Emperor plus age, family and VIP. Add:
  - **Exile** (landless, start at rank 0 with a claim)
  - **Last of the Line** (no family, sickly)
  - **Clone Dynasty** (the founder is a clone of a legend)
  - **Pirate Lord** (Belt outpost)
  - **Born Heir** (start as a child under regency, which players asked Medieval Life for)
- Era start dates: 2500 Collapse, 2650 Golden Age, 2800 Twilight.

### 10.3 Achievements and hall of fame `P2` `M`
- About 60 achievements, e.g.:
  - "Ten Generations"
  - "All Ten Worlds"
  - "Natural Ascendant"
  - "Kinslayer's Crown"
  - "Married Your Way to the Throne"
  - "The Clone Wars"
  - "Never Lost a Battle"
  - "Dynasty of 1,000"
- A local hall of fame of finished dynasties with a legacy score (titles, renown, genes, length).
- VIP runs are tracked separately.

### 10.4 Endgame crises `P1` `L`
- Late-game system threats that give a reason to play past 150 cycles:
  - **The Signal from Beyond Pluto** (ties into the Far Dark faith)
  - **The Machine Awakening** (AI administrators rebel)
  - **The Sun Flickers** (forces a Dyson project or migration)
  - **The Gene Plague** (targets engineered genomes, so the perfect bloodline is suddenly the most vulnerable; delicious irony)
  - **The Return of Old Earth**
- Each is a multi-stage story cycle that forces cooperation or conquest.

### 10.5 Victory and legacy `P2` `S`
- Not a hard win screen (dynasty games never end) but optional milestones (Solar Throne for 100 years, all worlds descended from you) that roll a "Legacy" ending card and let you continue.

### 10.6 Seeds, daily challenge and mod packs `P3` `M`
- Shareable world seeds. A daily challenge seed with fixed rules. **JSON content packs** (events, traits, items, names) loaded via import. That depends on 0.2 and 3.1.

---

## Phase 11: Content backlog (ready-to-build lists)

### 11.1 New traits (40 ideas)

| Trait | Category | Mechanic idea |
|---|---|---|
| Eidetic | genetic | +2 Science, perfect recall in intrigue events |
| Night-Eyed | genetic | Bonus in Kuiper and Pluto battles |
| Synesthete | genetic | +Diplomacy, chance of art events |
| Hemophiliac | genetic (recessive) | Injuries become lethal |
| Twin-Bearer | genetic | Higher twin chance (add twins) |
| Long-Gestation | genetic | Fewer but stronger kids |
| Chimeric | genetic | Carries two alleles sets, wild inheritance |
| Voidborn | genetic | Born in space, low-g adapted, −health on planets |
| Heavyworlder | genetic | High-g adapted, +Command, −Diplomacy |
| Iridescent | genetic | +prestige, exotic eyes on portrait |
| Telepath (Latent) | genetic | Psionic allele carrier, awakens by event |
| Precog | genetic | Sees one event outcome per cycle |
| Stoic | personality | Stress resistant |
| Vengeful | personality | Grudges never decay |
| Sentimental | personality | Opinion bonuses with family |
| Fickle | personality | Random opinion swings |
| Visionary | personality | Decisions cheaper |
| Pragmatic | personality | No stress from cruel acts |
| Romantic | personality | Better courtship, scandal risk |
| Gluttonous / Temperate | personality pair | Health vs stress |
| Reckless / Cautious | personality pair | Splice speed vs failure, battle variance |
| Pious / Profane | personality pair | Faith gain vs heresy chance |
| Duelist (exists) → Blade-Saint | acquired | Upgrade path |
| Ace Pilot | acquired | Personal combat in battles |
| Survivor | acquired | Survived an assassination: +defence |
| Plague-Touched | acquired | Immune to one disease |
| Kingmaker | acquired | Put someone else on a throne |
| Oathbreaker | acquired | Broke a treaty: −opinion everywhere |
| Gene-Thief | acquired | Stole a sequence |
| Twice-Born | acquired | Revived after clinical death |
| Exile | acquired | Lost all lands once |
| Ward of House X | acquired | Raised at another court |
| Holo-Ghost | cyber | Uploaded mind consulting the court after death |
| Dermal Armour | cyber | Defence vs assassination |
| Grav-Spine | cyber | Negates gravity mismatch |
| Memory Vault | cyber | Clones of them keep skills |
| Hive-Link | cyber | Council shares stats, Machine faith only |
| Pheromone Gland | cyber | +Diplomacy, Seduce bonus |
| Overclocked Cortex | cyber | +Science, shorter life |
| Neural Kill-Switch | cyber | A failsafe someone else might control |

### 11.2 New activities (20)
Grav-ball tournament, zero-g ballet, asteroid racing, deep-space hunt (Leviathan), ancestral tomb visit on Earth, gene gala (show off heirs), forge open day, solar sail regatta, ring-surfing on Saturn, storm diving on Jupiter, Venus cloud masquerade, Mercury dawn pilgrimage, Plutonian long-night vigil, war games, poetry duel, hunting party on Titan, theatre premiere, chess with an AI, cryo-sleep retreat (skip cycles, age slower), a "grand tour" of all ten worlds (multi-cycle story cycle).

### 11.3 Items and relics
- Relic slots exist. Add set bonuses, relic histories (who owned it, deeds done), cursed relics, alien artefacts (xeno-allele sources), gene vials as items (tradeable samples), and the founder's crown as a dynasty-defining relic.

### 11.4 Planet flavour packs (per world, ~5 events, 2 buildings, 1 decision, 1 holy site, 1 culture tradition)
- **Mercury**: sunside fire storms, terminator cities, solar-collector barons.
- **Venus**: cloud cities, acid rain, the courtly masquerade culture.
- **Earth**: old ruins, the sunken cities, the Senate decision.
- **Mars**: dust storms, iron discipline, terraforming politics.
- **Ceres**: the bazaar, belt pirates, water wars.
- **Jupiter**: helium skimmers, radiation, Galilean moon politics.
- **Saturn**: ring mines, Titan's methane lakes, scholars.
- **Uranus**: the sideways world, ice-giant monasteries.
- **Neptune**: diamond rain, Triton cryo-volcano cults.
- **Pluto**: the long night, the Far Dark cult, gene cryo-vaults.

---

## 16. Technical specs for the big systems

These are starting points. Refine them, but keep everything plain JSON and keep the engine pure.

### 16.1 Genotype (Phase 2.1)

```ts
// src/game/genome.ts
export interface Allele { id: string; value: number; dominance: 'dom' | 'rec' | 'add' }
export interface Locus { id: string; name: string; alleles: Record<string, Allele>; express(a: Allele, b: Allele): string | null } // returns a trait id or null
export type Genome = Record<string /* locusId */, [string, string] /* allele ids */>;

// Character gains:
//   genome: Genome
//   traits: string[]  // phenotype cache = genetic traits derived from genome + non-genetic traits
// Rule: never write genetic traits directly any more; call setGenome() which recomputes phenotype.

// Vault semantics with genotypes:
//   lock(trait)  => every dynasty child is forced to an allele pair that expresses the trait
//   purge(trait) => alleles that can express the trait are screened out of dynasty embryos
// Keep VIP editor working: toggling a genetic trait rewrites the genome to the canonical pair for it.
```

- Inbreeding: `F(child) = Σ over common ancestors A of (1/2)^(n1+n2+1) × (1 + F(A))`, computed over the archive with memoisation and capped at 8 generations for speed.

### 16.2 Event DSL v2 (Phase 3.1)

```ts
export interface EventDef {
  id: string;
  title: LocKey; text: LocKey; icon: IconName; art?: ArtSeed;
  category: EventCategory;
  scopes: Record<string, ScopeQuery>;          // e.g. { lover: { kind: 'relation', of: 'root', relation: 'lover' } }
  trigger: Condition[];                          // all must hold
  weight: { base: number; modifiers: WeightMod[] };
  cooldown?: number; once?: boolean; flagsSet?: string[];
  options: OptionDef[];
}
export interface OptionDef {
  text: LocKey; when?: Condition[]; aiWeight?: number;
  effects: Effect[];                              // typed, serialisable: { op: 'credits', n: -50 } | { op: 'opinion', from: 'spouse', to: 'root', n: -15 } | { op: 'chance', p: 0.2, then: Effect[] } | { op: 'story', id: 'feud', stage: 2 } | ...
  followUp?: { event: string; delay: [min: number, max: number] };
}
// describeEffects(effects) -> tooltip text (auto, Pillar 5)
// applyEffects(s, ctx, effects) -> pure state mutation
```

### 16.3 Relations (Phase 1.1)

```ts
export interface Relation { opinion: number; kind?: RelationKind; since: number; tags?: string[] }
// GameState.relations: Record<string, Record<string, Relation>>   (sparse, a->b only, prune when either dies + 10y)
// opinionOf(s, a, b) = baseline(traits, family, clan opinion) + relations[a]?.[b]?.opinion + decaying memories
```

### 16.4 Fleets (Phase 5.1)

```ts
export type ShipClass = 'corvette' | 'frigate' | 'cruiser' | 'dreadnought' | 'carrier' | 'troopship';
export interface Fleet {
  id: string; owner: string; name: string; commanderId?: string;
  ships: Partial<Record<ShipClass, number>>;
  at: { kind: 'planet' | 'transit'; planetId?: string; from?: string; to?: string; eta?: number };
  order: 'idle' | 'move' | 'blockade' | 'siege' | 'patrol' | 'escort';
  morale: number; supply: number; veterancy: number;
}
```

### 16.5 Story cycles (Phase 3.2)

```ts
export interface Story { id: string; def: string; stage: number; actors: Record<string, string>; nextAt: number; vars: Record<string, number | string>; startedYear: number }
// storyTick(s): for each story where nextAt <= year, fire the def's stage event; options advance or end the story.
```

### 16.6 Tick order

`tick.ts` runs systems in a fixed order. When adding systems, document where they go and why. Suggested final order:

1. economy
2. pops
3. buildings
4. health/plague
5. births
6. growth/childhood
7. relations decay
8. stress
9. memory
10. council and court
11. forge
12. stories
13. AI (utility)
14. fleets move
15. battles and sieges
16. trade/markets
17. stability/revolts
18. Diet votes
19. events
20. cleanup/archive

---

## 17. Balance targets and the balance harness

### Harness (`npm run balance`)
- Runs N seeded games headlessly with bot strategies (Passive, Builder, Warmonger, Breeder, Schemer, plus the VIP "God" bot as a sanity check) for M cycles.
- Outputs JSON and CSV: rank over time, credits, fleet, dynasty size, causes of death, ruler lifespans, events fired, bloodline grade, wars won/lost, and game-overs and their causes.
- CI uploads the summary as an artefact. A PR that moves a key metric over 20% must say why in the description.

### Targets (Standard mode, Governor start)
- Game-over (dynasty extinct) within 100 cycles: **5 to 15%** of Passive runs, under 5% of Breeder runs.
- Reaching Sovereign (rank 3) by cycle 150: about **30%** Builder, **50%** Warmonger.
- The Solar Throne by cycle 250: about **10%** of skilled bot runs.
- Bloodline grade: C typical at 50 cycles, A achievable by a Breeder at 150, S only with the Forge plus discipline.
- Credits shouldn't inflate: median credits at cycle 200 under 20× the cycle-20 median.
- Uncapped dynasty size at 200 cycles: hundreds to low thousands, with tick time inside the 0.4 budget.
- At least **one memorable event per cycle** on average, and no single event over 3% of all fired events.

---

## 18. Known bugs, rough edges and debt

- [ ] **VIP off with an overfull vault:** turning VIP off leaves `locked + purged` above `slots`. It works (new locks are blocked) but the UI shows "7 / 2". Show a "release some" hint, or grandfather them.
- [ ] **Immortal VIP rulers block succession forever.** Needs the Abdicate decision (3.3).
- [ ] **Suitors live outside `s.characters`** (in `s.suitors`). The editor handles it via `findChar`, but anything new that looks up characters must remember this.
- [x] **Bundle size** over 500kB (Vite warning). React split into its own chunk (0.6).
- [x] **No ESLint/Prettier** (0.7). Both run in CI.
- [ ] **Single `fleet` number for the player**, separate `clan.fleet` for the AI (will be replaced by 5.1).
- [ ] **Trait colours alone** distinguish categories (accessibility, 9.6).
- [ ] **The character modal on phones** gets very long with god-tier characters (about 38 trait chips push the VIP editor far down). Collapse traits by category.
- [ ] **The name generator** sometimes makes very short names ("Dra") (1.8).
- [ ] **Event repetition** at long play lengths. The 67 events are still a small pool (3.6).
- [ ] **AI marriages and births** are the hottest code path in huge dynasties. Profile again after Phase 1 (relations will add cost).
- [ ] **Fonts load from Google Fonts.** Offline PWA play falls back to system fonts. Consider self-hosting Orbitron and Exo 2 in `public/`.
- [ ] **Clan opinion is a single number** shared by every member of a house (replaced by 1.1 and 6.4).
- [ ] **Balance: war is far too easy** (harness, 10 seeds × 250 cycles, Oct 2026). Builder and Warmonger bots win a median of about 31 battles and lose none. Every Warmonger takes a throne by cycle 9–32 and the Solar Throne by cycle 37–62; 63% of skilled runs are Solar Emperor by 250 (target ~10%). AI fleets never keep up and nothing pushes back on a snowballing house (see 5.4 threat and coalitions, 8.1 AI). Fin's call on the fix.
- [ ] **Balance: credits inflate ~170×** from cycle 20 to 200 (target under 20×). Conquerors end on ~560k credits with nothing left to buy. Needs sinks or upkeep (4.2 buildings, 4.3 markets, fleet upkeep).
- [ ] **Balance: the world barely bites.** 94% of dynasty deaths are old age; assassination and battle deaths are under 1%. Median bloodline grade at 50 cycles is D (target C).
- [ ] **Monarch scenario:** the AI royal house's original household is deleted and replaced by the player's family. That's fine, but the deposed royals in the Emperor scenario keep their heads alive, and no story cycle uses them yet (great hook for 3.2).

---

## 19. Suggested order of work and the first 15 tickets

**Order:** Phase 0 → 3.1 (DSL) → 1.1 (relations) + 1.5 (secrets) → 2.1 + 2.2 (genotype and inbreeding) → 3.2 (story cycles) → 4.2 (buildings) → 5.1 (fleets) → 6.1 (schemes) → 8.1 (AI) → 9 (UI, after Fin picks) → the rest, interleaved with content (3.6) every sprint.

Why this order: the DSL, relations, secrets and genotype are the multipliers. Every event and system written after them is deeper for free. Fleets and buildings are big but self-contained. The UI should be redone once the screens it needs to show actually exist.

### First 15 tickets (ready to start)

1. ✅ `0.1` Save migration framework, plus fixture saves (a v1 save from the live build) and a CI test. **S**
2. ✅ `0.7` ESLint + Prettier, with the whole repo formatted in one isolated commit. **S**
3. ✅ `0.6` Error boundary with "Export save" and "Reload backup". **S**
4. ✅ `0.5` Balance harness MVP with 3 bots and a CSV of rank, credits and dynasty size. **M**
5. 🟡 `0.4` Character archive for the dead, and a bench script. **M** (bench done; see 0.4 for why the autosave probably comes before the archive)
6. `3.1` Event DSL types plus `applyEffects` and `describeEffects`, then port 10 events and prove the tooltips. **M**
7. `3.1` Port the remaining 57 events and delete the old path. **M**
8. `1.1` Relations data model, decay, baseline opinion, and the UI list on the character modal. **M**
9. `1.1` 15 relationship events (friendship, rivalry, romance) using the DSL. **M**
10. `1.7` Obituary card on death, epithets and regnal numbers. **S**
11. `3.3` Decisions panel MVP with Abdicate, Move Capital and Hold a Tournament. **S**
12. `1.5` Secrets and hooks MVP (affair and murder secrets, discovery by spymaster, spending a hook to force a marriage). **M**
13. `2.2` Consanguinity coefficient with the Kinship warning in suitors. Works before the full genotype by approximating with trait-groups. **S**
14. `3.4` Ruler ambitions (pick 1 of 3 at coronation, with rewards). **S**
15. `3.6` 30 new events across childhood, court and planet-specific categories. **M**

---

## 20. Working agreement for AI contributors

- **Keep the engine pure.** `src/game` never imports React or touches the DOM. UI changes state only through `act()`.
- **All randomness through `rng.ts`** with the state's seed. No `Math.random()` in the engine (the new-game screen's reroll buttons are the only exception, and they only pick seeds).
- **Region owners only change via `setOwner`.** The cache depends on it.
- **Migrations for every schema change** (0.1). Never break an existing save.
- **VIP never helps the AI.** Every VIP check goes through `isVip(s)` and only affects the player's house.
- **Every number explains itself.** New mechanics need tooltip text and a Codex entry.
- **Verify before you push:** `npm run typecheck`, `npm test`, `npm run build`, and drive the real app in a browser (Playwright plus the installed Chromium) for any UI change, at 390px and desktop width. Look at the screenshots.
- **Native `confirm()` and `alert()` don't work** in some embeds (artifact viewers, some webviews). Use the `Btn` `confirm` prop (tap twice).
- **The `mobile/` Expo app embeds the web build.** If you change the build output or storage, rebuild with `npm run build:app` and read `mobile/AGENTS.md`.
- **Git:** work on the branch you're given and keep commits focused. Don't put model names in commits or PRs. Don't open or merge PRs unless Fin asks.
- **Update this roadmap in the same PR** as the work (tick boxes, add discoveries to section 18).
- **Talk to Fin like a mate:** short, plain English, British slang, a bit of humour. Lead with what changed and what Fin needs to do (if anything).
