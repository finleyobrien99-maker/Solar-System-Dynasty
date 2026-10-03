# Solar Dynasty: Deep Dives

> Companion to [ROADMAP.md](ROADMAP.md). The roadmap says **what** and **why**. This file gives the **actual design detail** (numbers, tables, full content lists) so a builder can start without inventing everything from scratch.
> Every number here is a **starting point for the balance harness** (ROADMAP §17), not gospel. Change it when the data says so, and record why in the PR.

## Contents

- [A. Genome catalogue](#a-genome-catalogue)
- [B. Lifestyle perk trees](#b-lifestyle-perk-trees)
- [C. Relationships and opinion](#c-relationships-and-opinion)
- [D. Stress](#d-stress)
- [E. Story cycles, fully staged](#e-story-cycles-fully-staged)
- [F. Event pitch catalogue (150 pitches)](#f-event-pitch-catalogue-150-pitches)
- [G. Decisions](#g-decisions)
- [H. Buildings](#h-buildings)
- [I. Goods and markets](#i-goods-and-markets)
- [J. Planet sheets](#j-planet-sheets)
- [K. Fleets, ships and battle maths](#k-fleets-ships-and-battle-maths)
- [L. Faith sheets](#l-faith-sheets)
- [M. Laws](#m-laws)
- [N. AI utility model](#n-ai-utility-model)
- [O. Achievements (60)](#o-achievements-60)
- [P. Endgame crises](#p-endgame-crises)
- [Q. Screen-by-screen UI spec](#q-screen-by-screen-ui-spec)
- [R. Game rules and difficulty](#r-game-rules-and-difficulty)
- [S. Save schema evolution plan](#s-save-schema-evolution-plan)
- [T. Test plan per phase](#t-test-plan-per-phase)
- [U. Writing style guide for content](#u-writing-style-guide-for-content)

---

## A. Genome catalogue

Implements ROADMAP §2.1. Each **locus** holds two alleles, one from each parent.

**Dominance types:**
- `add`: additive. Allele values sum to a score that maps to a ladder rung.
- `dom`: dominant. One copy expresses.
- `rec`: recessive. Two copies are needed to express. One copy makes a hidden *carrier*.

### A.1 Ladder loci (additive)

Expression: `score = a.value + b.value`. Thresholds map the score to a trait (or none).

| Locus | Allele pool (value: weight in a random population) | Score → trait |
|---|---|---|
| `intellect` | −2: 3, −1: 12, 0: 60, +1: 20, +2: 4, +3: 1 | ≤−3 Dim, −2 Slow, −1…+1 none, +2 Quick, +3 Brilliant, ≥+4 Genius |
| `physique` | −1: 15, 0: 65, +1: 17, +2: 3 | ≤−2 Feeble, +2 Strong, ≥+3 Herculean |
| `beauty` | −2: 3, −1: 12, 0: 60, +1: 20, +2: 4, +3: 1 | ≤−3 Hideous, −2 Homely, +2 Comely, +3 Beautiful, ≥+4 Radiant |
| `stature` | −2: 4, −1: 14, 0: 60, +1: 18, +2: 4 | ≤−3 Dwarfish, −2 Short, +2 Tall, ≥+3 Giant |
| `constitution` | −1: 14, 0: 66, +1: 17, +2: 3 | ≤−2 Sickly, +2 Robust, ≥+3 Ironblood |
| `longevity` | −1: 12, 0: 72, +1: 14, +2: 2 | ≤−2 Short-lived, +2 Long-lived, ≥+3 Ageless |
| `psionic` | 0: 96, +1: 3, +2: 0.8, +3: 0.2 | +2 Psionic Spark, +3…+4 Psionic Adept, ≥+5 Psionic Ascendant |

- Two Brilliant parents (each carrying something like +2/+1) have a real chance of Genius (+2+2) and a real chance of none (+1+0). That gives "regression to the mean" for free. It replaces the flat "12% climb a rung".
- **The Vault "lock" on a ladder trait** forces dynasty embryos to the minimum allele pair that expresses it, unless the parents' draw is already better.

### A.2 Single loci

| Locus | Type | Alleles | Expresses | Notes |
|---|---|---|---|---|
| `fertility` | rec (bad) | `F` normal, `f` barren | ff → Barren | Carriers hidden. Inbreeding pairs these up. |
| `fecund` | dom | `Fc` / `n` | Fc_ → Fecund | 6% of the population |
| `generot` | rec | `G` / `g` | gg → Gene-Rot | 8% carriers. Purge = screen embryos. |
| `bones` | rec | `B` / `b` | bb → Brittle Bones | |
| `mind` | rec | `M` / `m` | mm → Lunatic | Carriers get +1 Intrigue (tortured genius flavour) |
| `limb` | rec | `L` / `l` | ll → Twisted Limb | |
| `hemo` | rec | `H` / `h` | hh → Hemophiliac (new) | Injuries become lethal |
| `void` | dom | `V` / `n` | V_ → Void-Adapted | Common in Belt and Kuiper pops |
| `senses` | dom | `K` / `n` | K_ → Keen Senses | |
| `glow` | co-dom | `Gl` / `n` | 1 copy faint glow (+1 Diplomacy), 2 copies → Bioluminescent | Lovely portrait hook |
| `xeno` | dom | `X` / `n` | X_ → Xenoblood | Only from relics, alien events and the Forge |
| `twin` | dom | `T` / `n` | T_ → Twin-Bearer (new) | Raises the twin chance from 2% to 12% |

### A.3 Planetary adaptation loci (new, ROADMAP §2.4)

| Locus | Alleles | Expressed | Effect on an adapted world | Effect elsewhere |
|---|---|---|---|---|
| `gravity` | −2 … +2 additive | ≤−2 Low-G Frame, ≥+2 Heavyworlder | +10 health on matching gravity | −10 health and −1 Command on a mismatched world (Grav-Spine implant negates) |
| `radiation` | dom `R` | Rad-Hardened | Mercury and Jupiter moons: no radiation illness | none |
| `cryo` | dom `C` | Cryo-Tolerant | Neptune, Uranus, Pluto: +5 health, +10 years lifespan in cryo-sleep | −5 health on Mercury and Venus |
| `toxin` | dom `Tx` | Toxin-Proof | Venus: immune to acid lung | none |

Population allele frequencies per planet live in `PLANETS[*].genePool` and drift each generation toward the frequency of the people who actually live there.

### A.4 Mutation

- Per allele per birth: **0.4%** base. +0.3% if a parent is Vat-Born, +1% near a xeno relic or a Forge accident, ×0.5 with the Blood legacy "Stable Line".
- A mutation shifts an additive allele by ±1 (70% down, 30% up, because most mutations are harmful) or flips a single locus.
- Natural Psionic Ascendants should be **astonishingly rare** (about 1 in 50k births unforced). They're the trophy.

### A.5 Inbreeding numbers

- Wright's F (formula in ROADMAP §16.1).
- Effects:
  - The chance a recessive pairs up scales naturally (no extra rule needed). The genotype model *is* the penalty.
  - Plus a flat **−1 health per 0.01 F** and a fertility multiplier of **×(1 − 2F)**.
  - At F ≥ 0.25 (sibling or parent-child), a **Kinwed** stigma: −30 opinion with every faith except the Red Codex.
- Suitor UI: show F rounded to a % with a colour (green < 1%, amber 1–6%, red > 6%).

---

## B. Lifestyle perk trees

Implements ROADMAP §1.3. Six focuses, each with two trees of seven perks. XP per cycle = `10 + focusStat × 2`. Perk *n* in a tree costs `100 × n` XP. Perks are bought in order within a tree, and the last perk of each tree is a trait.

### Diplomacy
- **Envoy tree**
  1. Smooth Talker: +10 opinion with all heads
  2. Marriage Broker: suitor lists +2 options
  3. Guest of Honour: galas +50% prestige
  4. Treaty Writer: treaties cost −25%
  5. Hostage Diplomacy: wards give +20 opinion with their house
  6. The Velvet Glove: vassal demands −50% prestige cost
  7. **Peacemaker** (trait): peace acceptance +20%
- **Court tree**
  1. Gracious Host: court upkeep −20%
  2. Patron of Arts: +1 prestige per cycle per artist courtier
  3. Matchmaker: kin marriages +15 opinion with the spouse's house
  4. Grand Feasts: feasts cure 15 stress
  5. Courtly Web: see all opinions at court
  6. Living Legend: +2 renown per cycle
  7. **Beloved** (trait): +20 opinion everywhere

### Command
- **Admiral tree**
  1. Drill Sergeant: fleet morale +10
  2. Logistician: supply +25%
  3. Void Tactician: one extra tactics card
  4. Boarding Master: boarding phase +20%
  5. Siege Engineer: sieges −1 cycle
  6. Fleet in Being: blockades +50%
  7. **Grand Admiral** (trait): +15% fleet strength
- **Warrior tree**
  1. Duellist: duel wins +15%
  2. Bodyguard: assassination defence +10%
  3. Lead from the Front: personal battle bonus doubled
  4. Scarred Veteran: injuries never maim
  5. Terror of the Void: enemy morale −10
  6. Champion: duels can settle wars
  7. **Blade-Saint** (trait)

### Economy
- **Steward tree**
  1. Tax Assessor: +5% region income
  2. Builder: buildings −15% cost
  3. Quartermaster: fleet upkeep −15%
  4. Market Maker: trade route +10%
  5. Debt Collector: loans repaid with interest
  6. Industrialist: +1 building slot in the capital
  7. **Golden Hand** (trait): +10% all income
- **Magnate tree**
  1. Speculator: see next cycle's market prices
  2. Monopolist: a goods monopoly gives +30% price
  3. Shipping Baron: +1 trade route cap
  4. Usurer: lend to AI houses for hooks
  5. Corporate Charter: found a merchant cadet house
  6. Price Fixer: Diet tariff votes +20 weight
  7. **Tycoon** (trait)

### Intrigue
- **Shadow tree**
  1. Eavesdropper: discover secrets +10%
  2. Poisoner: murder schemes +10%
  3. Network: +1 agent per scheme
  4. Sleeper Cells: plant a sleeper once per ruler
  5. Ghost: scheme discovery −25%
  6. Puppetmaster: hooks become strong
  7. **The Unseen** (trait)
- **Paranoia tree**
  1. Food Taster: poison defence +20%
  2. Loyal Guard: abduction defence +20%
  3. Purge the Disloyal: execution has no tyranny penalty on known plotters
  4. Counter-Spy: enemy agents revealed
  5. Iron Curtain: enemy spies get no secrets
  6. Trust No One: always see plots against you
  7. **Untouchable** (trait)

### Science
- **Scholar tree**
  1. Tutor: kids educated +20% faster
  2. Archivist: research +10%
  3. Astronomer: omens give a choice
  4. Physician: heal 1 illness per cycle at court
  5. Engineer: ship modules −20%
  6. Polymath: +1 all stats
  7. **Sage** (trait)
- **Cybernetic tree**
  1. Steady Augments: augment risk −25%
  2. Implant Cache: augments −20% cost
  3. Neural Mesh: +1 implant slot
  4. Upgrade Cycle: implants gain +1 stat over time
  5. Machine Whisperer: AI administrators never rebel
  6. Digital Ghost: a dead ruler can be consulted (holo-ghost)
  7. **Transhuman** (trait)

### Genetics (unique to Solar Dynasty)
- **Breeder tree**
  1. Eugenic Eye: see hidden carrier alleles in suitors
  2. Pedigree Keeper: offspring predictor shows exact odds
  3. Selective Pairing: dynasty kids get a re-roll on one locus
  4. Line Purifier: purged recessives are 50% less likely in carriers' kids
  5. Bloodwright: +1 vault slot
  6. Founder Effect: cadet branches inherit all vault locks
  7. **Gene-Mother / Gene-Father** (trait)
- **Forge tree**
  1. Steady Hands: splice success +15%
  2. Sequencer: research +20%
  3. Vatmaster: vat heirs +1 gene
  4. Living Archive: clones keep one personality trait
  5. Germline Editor: splices become heritable alleles
  6. Mutagenics: trigger a controlled mutation (risky)
  7. **Architect of Flesh** (trait)

---

## C. Relationships and opinion

Implements ROADMAP §1.1. Opinion of A toward B runs from −100 to 100. It's computed as the sum of the sources below, plus stored relation memories.

| Source | Value | Decay |
|---|---|---|
| Same personality trait (each) | +5 | static |
| Opposite personality trait (each) | −10 | static |
| Parent of / child of | +20 | static |
| Sibling | +10 | static |
| Spouse (base) | +15 | static |
| Spouse with a lover | −40 | −2/cycle |
| Passed over for heir (by the ruler) | −30 | −1/cycle |
| Executed my kin | −75 | −0.5/cycle (Vengeful: no decay) |
| Gift | +5 to +25 | −2/cycle |
| Spent time together (activity) | +5 to +15 | −1/cycle |
| Neglected (child, no interaction for 5 cycles) | −15 | until fixed |
| Gave me a title or region | +30 | −1/cycle |
| Revoked my title | −60 | −1/cycle |
| Shares my faith | +10, different −10 (Zealous ×2) | static |
| Vat-born or clone, if A is Zealous Solar | −20 | static |
| Genetic "beauty" rung of B | +3 per rung | static |
| B is god-tier (VIP or 15+ traits) | Envy: −10 from Ambitious, +10 from Humble | static |

**Relation kinds and thresholds:**
- **friend**: opinion ≥ 50 plus an interaction event.
- **rival**: ≤ −40 plus a conflict event.
- **lover**: an affair event. Being exposed creates a secret.
- **nemesis**: ≤ −80 plus a death or betrayal.
- **mentor/ward**: guardianship.

Max 3 friends and 3 rivals per character, to stay readable.

---

## D. Stress

Implements ROADMAP §1.2. Range 0–300 with three levels (100 / 200 / 300). Hitting a level fires a mental break event that offers coping traits.

| Gain | Amount |
|---|---|
| Acting against personality (Kind executes, Honest lies, Craven duels, Shy hosts a gala) | +20 to +40 |
| Family death (close) | +30 |
| Losing a war | +40 |
| Child dies | +60 |
| Ruling with 3+ wars | +10/cycle |
| Being Paranoid at war | +5/cycle |

| Relief | Amount |
|---|---|
| Activity matching personality | −20 to −40 |
| Coping trait fires | −15/cycle |
| Spouse opinion ≥ 50 | −5/cycle |
| Friend at court | −3/cycle each |
| Retreat activity | −40 |
| VIP "Heal" (also clears stress) | all |

Coping traits: Drunkard, Stim-Addict (exists), Flagellant (faith), Reclusive, Rage-Prone, Comfort Eater, Gambler, Improviser, Journaller. Each has a cost and a stress drain.

---

## E. Story cycles, fully staged

Implements ROADMAP §3.2. Each story is a small state machine. Notation: **Stage** → event; options → next stage or end.

### E.1 The Derelict (Neptune) — 4 to 12 cycles
1. **Signal**: a beacon in Neptune's shadow. Options:
   - send a probe (cheap, 2 cycles)
   - send a crew led by a kinsman (prestige, risk)
   - ignore (end)
2. **Boarding**: a dead crew and a sealed vault. Options:
   - cut it open (→3a)
   - tow it home (→3b, needs fleet ≥ 40)
   - sell its location to Saturn (credits, end)
3. **Outcome**:
   - **3a**: random result. An alien relic (xeno allele source, see A.2), a dormant plague (→ The Long Plague), or a sleeping survivor (a new courtier with unique traits).
   - **3b**: the hull becomes a legendary ship, and the vault opens later via the Forge.
4. **Echo** (10 cycles later): someone else wants it back (a Far Dark cult). Hand it over or war.

### E.2 The Feud — 3 to 30 cycles
Triggered by sworn rival status.
1. Insults at a gala.
2. A duel challenge (accept, use a champion, or refuse at a prestige cost).
3. Assassination attempts escalate. Each cycle there's a 30% chance of a plot either way.
4. Vendetta war: a casus belli for both sides.

Off-ramps at any stage: a marriage between the houses, a public apology (−200 prestige), or killing the head (it escalates if Vengeful heirs exist).

### E.3 Forbidden Love — 2 to 8 cycles
1. Your heir loves the child of a sworn rival.
2. Options:
   - forbid it (the heir's opinion −40, secret meetings continue → 3)
   - allow the betrothal (rival grudge drops by half, your allies are angry)
   - poison the lover (secret: murder)
3. Elopement chance. If they elope, the heir leaves the dynasty and founds a house in exile with a claim on your throne.

### E.4 The Prodigy — 5 to 20 cycles
A low-born genius (Genius, Brilliant) appears at court.
- **Adopt** them as a ward: they join the dynasty, the genes enter the pool, and nobles are scandalised.
- **Marry** them to a kinsman: same, with no scandal but a prestige cost.
- **Employ** them: they become the Chief Scientist with +research.
- **Crush** them (cruel, stress for the Kind).

Later stages: the prodigy's ambition, or loyalty.

### E.5 The Long Plague — 6 to 25 cycles
1. Outbreak on one world (along trade lanes).
2. Spread rolls each cycle along routes and fleets.
3. Options per cycle:
   - quarantine (close routes and lose income)
   - research a cure in the Forge (science race)
   - pray (faith; the Solar faith gets bonuses)
   - blame a minority (stability up, culture down)
4. Cure found or burned out. The world's population and a dynasty member or two are lost. Survivors get Plague-Touched.

### E.6 The Pretender — 3 to 10 cycles
Someone claims to be a dead brother.
- **Test** them (Forge DNA test: easy with a lab, impossible without). The result is real kin, a clone made by a rival, or a fraud.
- **Embrace** them: they become kin with a claim.
- **Expose** them: prestige gain and grudge from their backers.
- **Ignore** them: they gather a faction and a revolt follows.

### E.7 The Leviathan — 10 to 60 cycles (multi-generational)
A void creature in the Belt eats convoys.
- Hunts by successive rulers. Each failed hunt has a chance of a wound or death.
- Killing it gives Beast-Slayer for the whole hunting party, a relic (Leviathan Pearl), and huge renown.
- Alternatively, tame it with psionics (needs a Psionic Adept or better) to get a living warship.

### E.8 The Sleeper Agent — 5 to 30 cycles
A rival implanted a child at your court years ago. Clues drip through events, and your spymaster's Intrigue decides when you notice. If it's undetected when activated: an assassination attempt on the ruler or heir. If it's detected early: turn them into a double agent.

### E.9 Vat Rebellion (requires 10+ living vat-born or clones) — 5 to 15 cycles
1. Vat-born demand rights. Options: grant rights (Synthetic Rights law; Solar faith anger), suppress (stability, stress), or co-opt (a vat-born council seat).
2. If suppressed, a revolt led by your most capable clone, who might be your own clone.

### E.10 Grand Tour — 4 to 10 cycles
Your heir visits all ten worlds. Each stop fires a planet-specific event: marriage offers, a culture trait, risks. On return they're Well-Travelled (+Diplomacy and a culture acceptance bonus).

### E.11 The Founder's Tomb (Earth) — 2 to 6 cycles
Ruins on Earth hold the dynasty founder's sealed tomb. Opening it reveals a hidden genome sample (clone the Founder), a scandalous secret (the founder was a commoner or a clone), or a curse (a story event that tracks you).

### E.12 Succession Crisis — triggered on death with 2+ strong claimants
Claimants form factions in the first cycle, the council splits, and you get a civil war or a negotiated partition. A regency or a cadet backing a rival claimant adds twists.

---

## F. Event pitch catalogue (150 pitches)

One line each: **hook** → *the systems it touches*. Write each as a full event with 2–4 options (DSL, ROADMAP §3.1). Avoid duplicating the existing 67; check `events.ts`/`eventsMore.ts` first.

### Childhood (20)
1. Climbs a reactor tower on a dare → *health, Brave/Craven*
2. Befriends a servant's child → *relations, Kind/Arrogant*
3. Breaks a priceless relic → *items, Honest/Deceitful*
4. Bullied by an older cousin → *relations, stress, Wrathful*
5. Talks to the house AI more than to people → *Shy, Science*
6. Wins a junior grav-ball match → *prestige, Ambitious*
7. Caught reading forbidden Far Dark texts → *faith, Cynical/Zealous*
8. Runs away to the docks for a day → *Intrigue, Brave*
9. Nightmares about the vats (if vat-born) → *stress, identity*
10. Shows a psionic flash → *psionic allele reveal*
11. Tutor plays favourites → *relations, education*
12. Saves a drowning sibling → *relations, Brave*
13. Steals sweets from the kitchens → *Greedy/Generous*
14. First crush at a gala → *relations, Lustful/Chaste*
15. Draws the family sigil wrong and invents a new one → *sigil editor hook*
16. Sick with void fever → *health, physician*
17. Overhears a plot → *secrets, Paranoid*
18. Duel with wooden blades → *Command, scars*
19. Pet xeno-beast escapes → *hunt, Kind*
20. Coming-of-age vigil → *faith, personality lock*

### Romance and marriage (15)
21. Love letters intercepted by your spymaster → *secrets, hooks*
22. Spouse wants a separate palace → *opinion, credits*
23. Wedding gift is a bugged relic → *intrigue*
24. Cold feet the night before → *stress, prestige*
25. A suitor's hidden Gene-Rot carrier status leaks → *genetics, marriage*
26. Spouse's family demands a gene sample as dowry → *Forge, diplomacy*
27. Anniversary gala → *opinion, prestige*
28. Spouse discovers your affair → *secret, opinion*
29. Rival house offers their heir for a truce → *war, marriage*
30. Spouse wants to raise a child in their faith → *faith, kids*
31. Twins! (Twin-Bearer) → *births, succession*
32. Infertility treatments in the Forge → *fertility locus*
33. A widowed in-law needs a home → *court, opinion*
34. Courtly scandal: spouse's portrait painted too intimately → *relations*
35. Marriage contract dispute over a cadet region → *cadets, law*

### Court life (20)
36. The court jester mocks a powerful vassal → *opinion*
37. A poet writes an epic about your ancestor → *prestige, Chronicle*
38. Chef poisons a dish by accident → *health, trust*
39. Councillors deadlocked → *council, stress*
40. Ambassador from Saturn insults your faith → *diplomacy, faith*
41. Duel between two courtiers over a lover → *relations*
42. Treasury audit finds embezzlement → *Economy, hooks*
43. A guest refuses to leave → *credits, opinion*
44. Painter requests a family portrait session → *prestige, portraits*
45. Palace AI starts making requests → *Machine faith, story hook*
46. Servant uprising over pay → *stability, credits*
47. A courtier claims to see the future → *Precog, faith*
48. A drunken heir embarrasses you at a gala → *prestige, relations*
49. Lost in the palace's old wing (haunted wing exists; extend it) → *story*
50. The champion retires → *court positions*
51. A forgotten relative arrives with papers → *Pretender story*
52. The physician wants to test a new drug → *health*
53. A fire in the archives → *science, Chronicle loss*
54. Gift-giving festival → *opinion, credits*
55. A courtier bets on your death → *intrigue, Wrathful*

### Family drama (15)
56. Siblings fight over inheritance → *succession, relations*
57. A parent's memory fails → *care, stress*
58. A bastard asks for recognition → *legitimisation*
59. A child wants to join the clergy → *faith, succession*
60. A child wants to marry a commoner → *marriage, prestige*
61. Cousin demands a region → *cadets*
62. Heir hates the ruler → *succession, faction*
63. Long-lost twin → *Pretender/genetics*
64. A grandparent cursed the family → *faith, story*
65. A family heirloom is stolen by kin → *items, secrets*
66. A child excels at war games → *Command*
67. Divorce custody battle → *divorce consequences*
68. Elder demands euthanasia (or cryo-sleep) → *faith, health*
69. Cadet head snubs your summons → *cadets, opinion*
70. Family reunion on the Grand Tour → *story*

### Health and body (12)
71. Gravity sickness after relocating → *adaptation genes*
72. Implant rejection → *cyber*
73. Outbreak at court → *plague*
74. Miracle cure offered by a sketchy doctor → *health, credits*
75. Chronic pain from an old wound → *stress*
76. Ruler collapses mid-speech → *health, regency*
77. Stims to stay awake during war → *Stim-Addict*
78. Medical scan reveals a hidden carrier → *genome reveal*
79. Experimental life extension → *longevity, Forge*
80. Cryo-sleep for a dying heir → *cryo, succession*
81. A heroic transplant from a clone → *ethics, clones*
82. A plague-immune child → *genetics, cure research*

### Genetics and Forge (20)
83. A mutant child is born → *mutation, faith reaction*
84. A clone believes they're the original → *identity, succession*
85. A gene thief caught in the lab → *intrigue, diplomacy*
86. Lab containment breach → *disaster*
87. A rival offers to trade Genius sequences → *patents*
88. Vat malfunction: twins grown → *births*
89. Gene accords inspectors arrive → *Diet, law*
90. Your scientist wants to splice themselves → *scientist*
91. An embryo shows Psionic Ascendant potential, with risk → *psionic*
92. A clone of a dead ruler remembers things → *Neural Imprinting*
93. Public protest against the vats → *stability, Purity faction*
94. A black-market gene clinic in your capital → *law, credits*
95. Founder's DNA found in the tomb → *story E.11*
96. Bloodline grade reaches S: celebrations and fear → *opinion*
97. Inbred heir shows symptoms → *inbreeding*
98. A vat-born asks to marry into the dynasty → *rights*
99. Splice turns a child's eyes gold → *portrait, cosmetic*
100. Lab animal escapes and becomes a court pet → *companion relic*
101. A neighbouring house copies your vault locks → *espionage*
102. Germline edit goes wrong two generations later → *delayed follow-up*

### War and fleet (15)
103. Mutiny over unpaid wages → *credits, morale*
104. Captured enemy flagship → *legendary ship*
105. A commoner hero turns the battle → *prodigy, prestige*
106. War crimes accusation → *opinion, faith*
107. A pilot refuses to bomb a city → *bombardment, morale*
108. Deserters turn pirate → *pirates*
109. Supply convoy ambushed → *trade, supply*
110. Admiral's affair with an enemy officer → *secrets*
111. Truce broken by a rogue captain → *diplomacy*
112. Prisoner exchange → *ransom*
113. A ship's AI goes rogue mid-battle → *Machine*
114. Heir wants to lead the fleet → *succession risk*
115. Veterans demand land → *regions, cadets*
116. The enemy uses a void storm → *terrain*
117. Funeral of a fallen admiral → *prestige, relations*

### Intrigue (10)
118. Poisoned cup at your own table → *defence*
119. A double agent offers a deal → *hooks*
120. A forged will → *succession*
121. Blackmail letters arrive → *secrets*
122. A missing spymaster → *council*
123. Secret society recruits your heir → *faction*
124. Bribe for a Diet vote → *Diet*
125. Assassin caught: interrogate or execute → *grudges*
126. A rival's ledger falls into your hands → *Economy, hooks*
127. An anonymous warning → *Paranoid*

### Faith (10)
128. A miracle at a holy site → *faith, pilgrimage*
129. Heresy trial of a councillor → *faith, council*
130. A prophet in the slums → *heresy spawn*
131. The religious head asks for a crusade → *holy war*
132. A temple asks for funding → *credits*
133. Relic of a saint discovered → *items*
134. Your clone is denied last rites → *faith, clones*
135. Conversion of a vassal → *culture*
136. Excommunication threat → *faith head*
137. Faith schism splits your court → *schism*

### Economy (8)
138. Helium-3 price crash → *markets*
139. Strike at the shipyards → *pops*
140. A merchant offers a monopoly → *trade*
141. Smugglers in your spaceport → *law*
142. A bank collapses on Ceres → *credits*
143. Asteroid mining claim dispute → *regions*
144. Tax revolt → *stability*
145. Bumper harvest in hydroponics → *food*

### Space phenomena (5)
146. A comet omen splits the court → *faith, prestige*
147. A solar flare knocks out comms → *light-lag, war*
148. An alien signal repeats your house name → *endgame seed*
149. A rogue planet passes the Kuiper Belt → *colonisation*
150. An eclipse festival on Earth → *culture*

---

## G. Decisions

Implements ROADMAP §3.3. Each decision has requirements, a cost, an effect, and a tooltip that lists unmet requirements.

| Decision | Requirements | Cost | Effect |
|---|---|---|---|
| Abdicate | Adult heir | — | Heir takes over now. The old ruler becomes an elder councillor. |
| Move Capital | Own the region | 500 credits, 100 prestige | Capital bonuses move. Stability −10 at the old capital for 5 cycles. |
| Hold a Grand Tournament | Rank ≥ 2 | 800 credits | Prestige +150, duels, marriage offers |
| Commission a Monument | Rank ≥ 2 | 1,500 credits | +2 prestige per cycle forever, Chronicle entry |
| Adopt a Ward | — | 50 prestige | A child from another house joins as ward (relations) |
| Form the Jovian League | Hold Jupiter's capital + 2 moons | 1,000 prestige | Title "Archon of Jupiter", Jovian vassals +20 opinion |
| Restore the Old Earth Senate | Hold Earth's capital, Diplomacy ≥ 15 | 2,000 prestige | The Diet meets on Earth, +votes |
| Machine Ascendancy | Machine faith, ruler Full Conversion | 3,000 faith | Faith becomes the Ascended Machine; AI administrators are loyal |
| Found a New Faith | Faith ≥ 2,000, piety trait | 2,000 faith | Reformation (ROADMAP §7.2) |
| Unite Mars | Hold every Mars region | 500 prestige | Title "Iron Sovereign", +Command for Mars-born kin |
| Declare the Gene Accords Void | Bloodline grade A+ | Every Solar house −30 | Free Forge in your realm, casus belli against you |
| Build a Dyson Swarm | Golden Age era, hold Mercury | 50k credits over 20 cycles | Endgame megaproject, +100% income |
| Purge the Vat-Born | 10+ vat-born | Stability −20 | Solar faith +, Synthetic Rights revolt likely |
| Grant Synthetic Rights | 10+ vat-born | Solar faith −30 | Vat-born loyalty +, a new council seat |
| Cryo-Sleep the Ruler | Cryo vault | — | Ruler sleeps N cycles (ages 1/10 speed), a regency runs |
| Upload the Ruler | Digital Ghost perk | 2,000 credits | On death the ruler becomes a Holo-Ghost advisor |
| Grand Tour | Heir 16–25 | 500 credits | Story E.10 |
| Open the Founder's Tomb | Hold an Earth region | 300 credits | Story E.11 |
| Hunt the Leviathan | Fleet ≥ 60 | 400 credits | Story E.7 |
| Legitimise a Bastard Line | Bastard with kids | 300 prestige | All descendants legitimised |
| Found a Merchant House | Tycoon or Corporate Charter | 1,500 credits | A merchant cadet controlling trade routes |
| Declare a Crusade | Faith head is your puppet, faith ≥ 1,000 | 1,000 faith | System holy war |
| Pardon All Prisoners | — | Prestige −50 | Opinion +15 with their houses, stress relief for the Kind |
| Partition the Realm | 3+ sovereign planets | — | Gift worlds to kids as cadet kingdoms (gavelkind-style) |
| Bring Back Old Earth | Return of Old Earth crisis active | special | See P.5 |

---

## H. Buildings

Implements ROADMAP §4.2. Slots per region: `2 + floor(dev / 3)`, and the capital gets +1. The table's cost column is the build cost in credits; build time is in cycles.

| Building | Cost | Time | Upkeep | Effect | Notes |
|---|---|---|---|---|---|
| Shipyard | 300 | 3 | 10 | Ship cost −15%, recruit here | Fleet origin point |
| Drydock (needs Shipyard) | 600 | 4 | 20 | Dreadnoughts and carriers buildable | |
| Mine | 200 | 2 | 5 | +metals | |
| Refinery | 350 | 3 | 10 | Metals → munitions | |
| Hydroponics | 150 | 2 | 5 | +food | |
| Spaceport | 400 | 3 | 15 | +1 trade route cap, +10% route value | |
| Academy | 450 | 4 | 15 | Education tier +1 for kids raised here | |
| Gene Lab | 600 | 4 | 25 | Forge research +25%, unlocks splicing here | 1 per planet without the Breeder tree |
| Vat Hall (needs Gene Lab) | 900 | 5 | 40 | Vat heirs and clones | |
| Temple | 300 | 3 | 10 | +faith, stability +5 | |
| Cathedral (needs Temple) | 900 | 6 | 25 | +faith, holy site bonus doubled | |
| Fortress | 500 | 4 | 20 | Siege time ×2, garrison +50% | |
| Shield Generator | 800 | 5 | 30 | Immune to bombardment | |
| Barracks | 250 | 2 | 10 | +troops | |
| Palace | 1,000 | 6 | 40 | Court size +5, prestige +2 per cycle | Capital only |
| Arcology | 700 | 5 | 20 | Pop cap +50% | |
| Observatory | 350 | 3 | 10 | +science, omen choices | |
| Market Hall | 400 | 3 | 10 | Region prices ±10% in your favour | |
| Cryo-Vault | 600 | 4 | 15 | Store genomes; clone the dead without a vat-hall sample | Pluto/Neptune bonus |
| Solar Collector Array | 500 | 4 | 0 | +credits (Mercury ×3) | Mercury unique tier |
| Cloud City | 800 | 6 | 20 | +pop, +luxuries | Venus only |
| Helium Skimmer | 700 | 5 | 15 | +helium-3 | Jupiter, Saturn, Uranus, Neptune |
| Ring Mine | 600 | 5 | 15 | +exotics | Saturn only |
| Terraforming Engine | 5,000 | 30 | 50 | Changes the planet's habitability over decades | Mars, Venus |

---

## I. Goods and markets

Implements ROADMAP §4.3. Each planet keeps a price per good: `price = base × clamp(demand / supply, 0.4, 3)`. Trade routes move up to `capacity` units per cycle from cheap to expensive markets, and the route owner earns the spread minus tariffs.

| Good | Base | Main producers | Main consumers |
|---|---|---|---|
| Metals | 10 | Mercury, Mars, Ceres | Shipyards, buildings |
| Volatiles (water, gas) | 8 | Ceres, Europa, Enceladus | Pops, hydroponics |
| Food | 6 | Earth, Venus cloud farms, hydroponics | Pops |
| Helium-3 | 25 | Jupiter, Saturn, Uranus, Neptune | Fleets (fuel), reactors |
| Munitions | 20 | Mars | War |
| Luxuries | 30 | Venus, Earth | Nobles, galas |
| Biomatter | 18 | Earth, Titan | Gene Labs, medicine |
| Exotics | 60 | Saturn rings, Pluto | Forge, relics, advanced ships |
| Data Cores | 40 | Saturn, Earth | Research, AI governance |

Shortages trigger events once supply is below 50% of demand for 2+ cycles: famine (food), fuel crisis (helium-3), and work stoppage (metals).

---

## J. Planet sheets

Implements ROADMAP §4.4 and §11.4.

| Planet | Gravity (g) | Hazard | Holdings to add | Adaptation | Culture tradition | Holy site | Unique |
|---|---|---|---|---|---|---|---|
| Mercury | 0.38 | Sunside fire, radiation | Terminator Ring cities, Caloris | Radiation | Dawn Walkers (+faith on pilgrimages) | The Dawn Gate (Solar) | Solar Collector Array |
| Venus | 0.90 | Acid, pressure | Cloud cities Aphrodite, Ishtar | Toxin | Velvet Court (+Diplomacy at galas) | Veil of Ishtar (Veiled) | Cloud City |
| Earth | 1.00 | Ruins, sunken coasts | Luna, Old Cities | — | Old Blood (+prestige for long lineages) | The First Tomb | Senate decision |
| Mars | 0.38 | Dust storms | Phobos, Deimos, Valles, Tharsis | Gravity (low) | Iron Discipline (+Command) | Olympus Forge (Red Codex) | Terraforming |
| Ceres | 0.03 | Pirates | Vesta, Pallas, Belt stations | Void | Bazaar Born (+trade) | — | Market bonus |
| Jupiter | 2.5 (cloud) | Radiation, storms | Io, Europa, Ganymede, Callisto | Radiation, gravity (high) | Storm Lords (+fleet) | Great Red Eye (Machine) | Helium Skimmer, Jovian League |
| Saturn | 1.07 (cloud) | Ring debris | Titan, Enceladus, Rhea, Iapetus | Cryo | Ring Scholars (+Science) | Library of Titan | Ring Mine |
| Uranus | 0.89 | Sideways seasons | Miranda, Titania, Oberon | Cryo | Tilted Monks (+stress relief) | Sideways Monastery | Ice-giant monasteries |
| Neptune | 1.14 | Diamond rain, supersonic winds | Triton, Nereid | Cryo | Deep Divers (+health) | Triton Geysers (Abyssal) | Cryo-Vault bonus |
| Pluto | 0.06 | The Long Night | Charon, Kuiper outposts | Cryo, void | Long-Night Patience (+Intrigue) | The Far Dark Gate | Gene Cryo-Vault, endgame Signal |

Each new holding (moon or station) is a region with its own buildings and adaptation needs.

---

## K. Fleets, ships and battle maths

Implements ROADMAP §5.

| Class | Cost | Upkeep | Attack | HP | Speed | Role |
|---|---|---|---|---|---|---|
| Corvette | 15 | 0.3 | 2 | 4 | 3 | Screening, pirate hunting |
| Frigate | 30 | 0.6 | 4 | 8 | 2 | Line ship |
| Cruiser | 80 | 1.5 | 10 | 20 | 2 | Backbone |
| Dreadnought | 250 | 4 | 30 | 70 | 1 | Siege, terror |
| Carrier | 200 | 3.5 | 18 (long range ×2) | 40 | 1 | Long-range phase |
| Troopship | 40 | 0.8 | 0 | 10 | 2 | Carries 10 troops |

**Battle per phase:**
- `damage = Σ attack × phaseMult × (1 + 0.04 × commanderCommand) × moraleMult × terrainMult × tacticsMult`. Losses are applied by HP proportion, small ships first.
- Phase multipliers:
  - Long range: carriers ×2, corvettes ×0.5.
  - Closing: cruisers ×1.3.
  - Boarding: troops count, plus a commander duel chance.
- Morale breaks below 25%, and the side retreats.

**Terrain:** Asteroid field (corvettes +50%, dreadnoughts −30%), gas-giant atmosphere (no carriers), sun-glare near Mercury (long range −50%), Kuiper dark (defender +20%).

**Migration:** the old `s.fleet` count becomes frigates (`fleet × 0.5`), cruisers (`fleet × 0.15`) and corvettes (the rest).

---

## L. Faith sheets

Implements ROADMAP §7.

| Faith | Head title | Gene-forging | Cybernetics | Cloning the dead | Marriage | Holy war name | Likely heresies |
|---|---|---|---|---|---|---|---|
| Solar Orthodoxy | The Heliarch | Condemns | Tolerates | Abomination | Monogamy, no kin | The Dawn Crusade | Sunless Reform (allows forge) |
| The Veiled | The Masked One | Tolerates (in secret) | Accepts | Accepts if hidden | Political, divorce easy | The Unveiling | Revealed Path |
| Red Codex | The Iron Abbot | Tolerates for warriors | Embraces combat implants | Honours fallen warriors | Kin marriage allowed | The Red March | Pacifist Codex |
| Machine Synod | The Prime Logic | Embraces | Sacred | Holy: continuity | Contract-based | The Great Compile | Organic Heresy |
| Abyssal Choir | The Drowned Voice | Condemns | Condemns | Taboo | Ritual bonds | The Deep Hymn | Surface Choir |
| Far Dark | The Watcher | Tolerates | Tolerates | Seeks it (memory) | Any | The Silence | Signal Cult (endgame) |

Each faith also needs:
- 3 to 5 **tenets** with mechanical effects.
- A **virtue/sin** pair list (traits that give or cost faith opinion).
- A **ritual activity**.
- **2 holy sites**.

---

## M. Laws

Implements ROADMAP §4.6.

| Law | Levels | Trade-off |
|---|---|---|
| Crown Authority | Low → Absolute (4) | Higher means more vassal obedience and the right to revoke titles, but vassals like you less |
| Tax Law | Light / Standard / Heavy | Income vs stability and vassal opinion |
| Levy Law | Volunteer / Standard / Conscription | Troops vs pop happiness |
| Gene Law | Forbidden / Licensed / Free / Mandated | Forge access vs faith and Diet backlash. "Mandated" forces embryo screening on nobles: huge bloodline gains and huge unrest. |
| Cyber Law | Restricted / Open / Augmented Court | Augment costs and faith |
| AI Governance | None / Advisors / Administrators | Income +10/+25% vs Solar anger and Machine Awakening risk |
| Synthetic Rights | None / Protected / Equal | Vat-born loyalty vs Purity faction |
| Succession | exists | — |
| Gender | exists | — |

---

## N. AI utility model

Implements ROADMAP §8.1.

```
for each AI house each cycle (time-sliced: ~1/3 of houses per cycle):
  options = [declareWar(target), seekAlliance(target), arrangeMarriage(kin, target), scheme(type, target),
             build(region, building), recruit, develop, openRoute, pressClaim, demandVassalage, revolt, idle]
  score(option) = goalWeight[goal] × baseValue(option) × personality(option) × risk(option)
  pick the top option with softmax(temperature by difficulty)
```

**Goals** come from the head's traits plus the house situation:
- Expand (Ambitious, high fleet)
- Secure Succession (no adult heir)
- Revenge (rival exists)
- Prosper (Greedy, Diligent)
- Purify Blood (bloodline-minded; uses its own vault in Standard mode)
- Convert (Zealous)
- Survive (weak, threatened)

**Personality multipliers, for example:**
- Wrathful: war ×1.5
- Craven: war ×0.4, alliance ×1.5
- Deceitful: scheme ×1.6
- Honest: scheme ×0.4
- Just: revoke ×0.3

**Memory:** the AI remembers broken promises (ROADMAP §6.4 treaties) and weights trust per house.

**Performance:** AI work per cycle must stay under 20ms at 300 houses. Cache target lists per planet.

---

## O. Achievements (60)

VIP runs earn a separate "VIP" variant, so standard achievements stay meaningful.

| # | Name | Condition |
|---|---|---|
| 1 | Humble Beginnings | Survive 10 cycles as a Governor |
| 2 | Viceroy | Become a Viceroy |
| 3 | Crowned | Become a planet's monarch |
| 4 | Sun King | Forge the Solar Throne |
| 5 | Ten Generations | 10 rulers of your blood |
| 6 | Twenty Generations | 20 rulers |
| 7 | All Ten Worlds | Living dynasty members on all ten planets |
| 8 | Dynasty of 100 | 100 living members |
| 9 | Dynasty of 1,000 | 1,000 living members |
| 10 | Natural Ascendant | Psionic Ascendant born without the Forge |
| 11 | Pure Line | 5 rulers in a row with no bad genetic traits |
| 12 | S-Rank Blood | Bloodline grade S |
| 13 | The Clone Wars | Fight a war led by a clone against a clone |
| 14 | Founder Reborn | Clone the dynasty founder |
| 15 | Vat Dynasty | 3 vat-born rulers in a row |
| 16 | Kinslayer's Crown | Take the throne by killing a sibling |
| 17 | Married Into It | Become a monarch through marriage inheritance |
| 18 | Never Lost | Win 25 battles without a loss |
| 19 | Admiral of the Void | Win a battle with a dreadnought fleet |
| 20 | Pirate King | Hold Ceres with a pirate start |
| 21 | Last of the Line | Survive with 1 member for 10 cycles |
| 22 | Phoenix | Recover from landless to monarch |
| 23 | Puppetmaster | Hold strong hooks on 5 heads |
| 24 | Untouchable | Survive 10 assassination attempts |
| 25 | Shadow Hand | 20 successful murder schemes |
| 26 | Beloved | 10 vassals at +80 opinion |
| 27 | Tyrant | Execute 20 prisoners |
| 28 | Merciful | Release 20 prisoners |
| 29 | Tycoon | 100k credits |
| 30 | Monopoly | Control all helium-3 production |
| 31 | Builder | Construct 50 buildings |
| 32 | Terraformer | Finish a terraforming project |
| 33 | Dyson | Finish the Dyson Swarm |
| 34 | Prophet | Found a new faith |
| 35 | Crusader | Win a holy war |
| 36 | Heretic | Get excommunicated |
| 37 | Pilgrim | Visit every holy site |
| 38 | Machine Ascendant | Declare the Machine Ascendancy |
| 39 | Leviathan Slayer | Kill the Leviathan |
| 40 | Leviathan Tamer | Tame the Leviathan |
| 41 | The Derelict | Finish the Derelict story with the relic |
| 42 | Plague Doctor | Cure the Long Plague |
| 43 | Grand Tourist | Finish the Grand Tour |
| 44 | Old Earth | Restore the Senate |
| 45 | Jovian | Form the Jovian League |
| 46 | Answer the Signal | Finish The Signal crisis |
| 47 | Machine Peace | Survive the Machine Awakening without war |
| 48 | Sun Saver | Survive the Sun Flickers |
| 49 | Gene Plague Survivor | Keep the dynasty alive through the Gene Plague |
| 50 | Centenarian | A ruler lives to 100 |
| 51 | Methuselah | A ruler lives to 150 |
| 52 | Child Ruler | Rule through a 10-cycle regency |
| 53 | Twins | Twins become co-heirs (with a partition) |
| 54 | Hostage Diplomacy | 3 wards at once |
| 55 | Diet Master | Win 10 Diet votes |
| 56 | Accords Breaker | Void the Gene Accords |
| 57 | Synthetic Liberator | Grant Equal synthetic rights |
| 58 | Purist | Purge the vat-born (dark achievement) |
| 59 | Chronicler | A 50-chapter Chronicle |
| 60 | The Long Game | Play 500 cycles in one run |

---

## P. Endgame crises

Implements ROADMAP §10.4. Each crisis triggers after cycle 150 (game rule) with a 1% per cycle chance, rising with its trigger condition. Max one active at a time.

1. **The Signal from Beyond Pluto.** Trigger: Far Dark holy site controlled, or an exotics boom.
   - Stage 1: a repeating message.
   - Stage 2: cults rise (Far Dark heresy).
   - Stage 3: something arrives in the Kuiper Belt, either a fleet or a gift.
   - Resolution: decode it (a science race), fight it (a system coalition), or join it (transformation of your dynasty, a new species trait).
2. **The Machine Awakening.** Trigger: AI Governance = Administrators in 3+ realms. Administrators seize regions and spread through data cores. Resolution: a purge war, negotiation (Machine Synod mediation), or merging (the Transhuman path).
3. **The Sun Flickers.** Trigger: random late game. Solar output drops and inner worlds freeze. Resolution: the Dyson Swarm (a mega-project), a mass migration outward (Plutonian and Neptunian worlds boom), or faith (the Solar Orthodoxy's great rite).
4. **The Gene Plague.** Trigger: system-wide average bloodline grade ≥ B, or the Gene Accords voided. A pathogen targets engineered genomes, so the more forged your line, the deadlier it is. Resolution: Germline Reversion (lose some genes), find natural-born carriers of immunity (marry outside your bloodline: delicious), or a Forge cure race.
5. **The Return of Old Earth.** Trigger: Earth's capital held by the same house for 50 cycles. A long-lost Earth government ship returns, claiming authority over all. Resolution: submit (become a vassal of a new empire), fight, or marry into it.

---

## Q. Screen-by-screen UI spec

Implements ROADMAP §9. Write it against design tokens so concept A, B or C can skin it.

1. **Life (home):**
   - The ruler header: portrait, name, title, age, 4 resources with deltas.
   - The year feed: cards for this cycle's events, births, deaths and battles. Tapping a name opens the person.
   - The sticky **Age Up** button.
   - A "To do" strip: pending decisions, idle council seats, a heir without education.
2. **Person:**
   - Hero portrait, relation to the ruler, opinion (with a breakdown tooltip), and traits grouped by category and collapsible.
   - Genome tab: loci, alleles if revealed, carrier warnings.
   - Relations tab, a life log, actions (context-aware), and the VIP editor if on.
3. **Family:** the household, heir line, kids' education, matchmaking queue, cadet houses.
4. **Bloodline lab:**
   - Grade, diversity and inbreeding at a glance.
   - The vault, ladders, the offspring predictor and Forge projects.
   - Bloodline projects (§2.7) and legacy trees.
5. **Realm:** regions list and map, buildings queue, laws, council and court, factions.
6. **System map:** fleets, trade lanes, plague overlay, holy sites, conjunction windows, Diet button.
7. **War room:** wars, fleets and orders, battle reports, peace offers.
8. **Intrigue:** schemes in progress, known secrets and hooks, threats against you.
9. **Chronicle and Codex:** history, glossary, Codex pages (Starts and VIP exist).
10. **Moments** (full-screen interstitials): birth, death obituary, coronation, battle result, crisis start. One tap to dismiss, and a "skip moments" setting.

Phone layout rules: one column under 600px, bottom nav max 5 items (Life, Family, Blood, Realm, More), 44px tap targets, and all modals as full-height sheets with a back gesture (the Expo app's back button pops the panel stack).

---

## R. Game rules and difficulty

| Rule | Options | Default |
|---|---|---|
| Difficulty | Story / Standard / Brutal | Standard |
| AI aggression | Low / Normal / High | Normal |
| Event frequency | Calm / Normal / Chaotic | Normal |
| Mutation rate | ×0.5 / ×1 / ×3 | ×1 |
| Dynasty growth | Sprawling / Tight (exists) | Sprawling |
| Plague severity | Off / Mild / Deadly | Mild |
| Gene-Forge | Off / Normal / Free (VIP) | Normal |
| Endgame crises | Off / After 150 / After 300 | After 150 |
| VIP mode | Off / On (exists) | Off |
| Light-lag orders | Off / On | Off |

| Difficulty | Player income | AI income | AI aggression | Event harshness |
|---|---|---|---|---|
| Story | ×1.25 | ×0.8 | ×0.6 | Softer |
| Standard | ×1 | ×1 | ×1 | Normal |
| Brutal | ×0.85 | ×1.2 | ×1.4 | Harsher, more plagues |

---

## S. Save schema evolution plan

Bump `SAVE_VERSION` per row, each with a migration and a fixture save (ROADMAP §0.1).

| Version | Phase | Change | Migration |
|---|---|---|---|
| 2 | 0 | `archive`, RNG stream counters | Move dead non-notables into the archive, init counters |
| 3 | 1 | `relations`, `stress`, `lifestyle`, `secrets`, `hooks` | Empty structures, stress 0 |
| 4 | 2 | `genome` on every character, `genePool` per planet | Derive genotypes from traits (§A) |
| 5 | 3 | `stories`, `flags`, `ambitions`, DSL event ids | Map old event ids to new |
| 6 | 4 | `pops`, `buildings`, `markets`, new holdings | Seed pops from dev, empty buildings, add moon regions owned by the planet capital's owner |
| 7 | 5 | `fleets`, `troops` | Convert `s.fleet` and `clan.fleet` (§K) |
| 8 | 6–7 | `factions`, `treaties`, `diet`, faith doctrines, cultures | Defaults per planet |
| 9 | 8–10 | AI goals, achievements, game rules | Defaults |

Rule: a migration must be **idempotent** and **tested from every older fixture**, not just the previous version.

---

## T. Test plan per phase

| Phase | Must-have tests |
|---|---|
| 0 | Fixture saves migrate and play 20 cycles. The bench stays within budget. The balance harness runs in CI. |
| 1 | Neglect → hostile heir. Stress break fires at 100. A secret is discovered and a hook spent. The obituary is generated. |
| 2 | Inheritance odds within 2% over 10k births. F matches hand-computed pedigrees. The vault lock forces a phenotype. Carriers are hidden until revealed. |
| 3 | The DSL `describeEffects` matches `applyEffects` deltas for every event. Every story reaches every ending in a seeded run. Decisions show the reasons they're locked. |
| 4 | Markets converge (no NaN or infinite prices). Building queues complete. Pops never go negative. |
| 5 | Fleets travel the right number of cycles for the orbital distance. Battles are deterministic per seed. Sieges complete. Peace deals transfer what they say. |
| 6–7 | Schemes progress and discovery rolls fire. Faction revolts trigger. The Diet tallies votes correctly. Schisms split pops. |
| 8 | AI stays under 20ms per cycle at 300 houses. AI never uses VIP functions (assert `isVip` is never consulted for AI benefit). |
| 9 | Playwright: every screen at 390px and 1280px with no console errors and no horizontal scroll. Axe accessibility check passes. |
| 10 | Each crisis resolves by each path in seeded runs. Achievements unlock from crafted states. |

---

## U. Writing style guide for content

- Second person for events ("Your heir…"). First person for the Life feed ("I married Jonar."), as BitLife does.
- Short. An event's body is 1 to 3 sentences. Options are under 8 words.
- Funny where it fits, grim where it should be. Never both in the same line.
- Every option says what it costs (the DSL tooltip does the numbers, but the text should hint: "Pay the ransom", "Let them rot").
- Use the setting: credits not gold, ships not armies, worlds not kingdoms, cycles not years (the UI says "cycle" and "year" interchangeably; pick "cycle" in mechanics, "year" in prose).
- British spelling in UI text (colour, honour, armour), since that's Fin's game.
- Names: use each planet's syllable sets in `planets.ts`. No real-world famous names.
- Don't copy text, names or art from Medieval Life, BitLife or Crusader Kings. Inspired by, never lifted.
