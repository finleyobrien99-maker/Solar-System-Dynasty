# Solar Dynasty

A dynasty life-sim for the web, in the style of Medieval Life / BitLife crossed with a light Crusader Kings, set across the ten worlds of the solar system.

You lead a minor house on one planet. Every **Age Up** is a cycle (a year): events fire, children are born, rivals scheme, wars rage. When your ruler dies you carry on as their heir.

## Features

- **Ten planetary powers**: Mercury, Venus, Earth, Mars, Ceres, Jupiter, Saturn, Uranus, Neptune and Pluto. Each has its own faction, culture, faith, monarch title and native bonus, with 3-5 rival houses fighting over its regions.
- **Ranks**: Governor → Viceroy → Sovereign (seize a planet's throne-region) → Solar Emperor (rule three throne-worlds and forge the Solar Throne).
- **Deep trait system**: around 90 traits across genetic ladders (Dim → Genius, Feeble → Herculean, Homely → Radiant, psionics…), personality, education, acquired traits and cybernetics. Every trait explains itself on hover or tap.
- **Gene Vault**: lock genetic or personality traits so every child born into your dynasty inherits them, forever, or purge bad genes so they never pass on. Breed for a gene, lock it, build the perfect bloodline.
- **Gene-Forge**: research genes nobody in your family carries, splice them into living kin, grow designer heirs in vats, and clone your ancestors (even dead ones). The Machine Synod loves it; the Solar Orthodoxy calls it heresy.
- **Cadet branches**: grant a kinsman a region and they found an offshoot house of your bloodline: sworn to you, sharing your gene locks, fighting in your wars. If the main line dies out, a cadet branch takes the crown.
- **Court council**: Envoy, Admiral, Treasurer, Spymaster and Chief Scientist seats filled from your family, each boosting a different part of the realm.
- **Grudges and rivals**: houses remember murders, executions, stolen land, insults and kindnesses, and pass those memories down the generations. Sworn rivals send assassins, sabotage your docks, rob you and come for you in war.
- **Trade routes**: convoys between worlds, each with its own exports (Martian munitions, Jovian helium-3, Plutonian cryo-crystals…), with pirate raids if your fleet is too small to scare them off.
- **Dynasty growth choice** at the start of each run: *Sprawling* (uncapped) or *Tight family* (capped). With auto-matchmaking, kin find spouses across the system and spread your blood into other houses.
- **Family**: matchmaking with visible genes, betrothals, tutors and schooling, affairs and unsanctioned heirs, succession laws (primogeniture, ultimogeniture, meritocracy, designated) and gender laws, full family tree.
- **War**: casus belli (claims, holy war, blood feud, naked conquest, independence), fleet battles, allies and vassals joining in, leading in person.
- **Intrigue**: assassin drones, sabotage, blackmail, forged claims, seduction; arresting vassals, executions and ransoms.
- **44 random events**, galas, xeno-beast hunts, pilgrimages, arena duels and more.
- **Treasury**: procedurally generated crowns, weapons, armour, flagships and relics that pass down the line.
- **All art is procedural SVG**: portraits (genes, age, rank crowns, implants, scars, psionic glow), planets, house sigils, warships, relics and the solar system and planet region maps.
- **Bulletproof saves**: autosave after every action, compressed, checksummed, with a verified backup per slot, 3 manual slots, and export/import to a file.

## Running it

```bash
npm install
npm run dev       # play at http://localhost:5173
npm run build     # static build in dist/ (works on any static host, e.g. GitHub Pages)
npm test          # long headless simulations of both growth modes + genetics tests
npm run typecheck
```

## Playing online

Every push to `main` builds the game and publishes it to GitHub Pages at
https://finleyobrien99-maker.github.io/Solar-System-Dynasty/ (see `.github/workflows/deploy.yml`).
One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
CI (`.github/workflows/ci.yml`) typechecks, tests and builds every branch.

## Layout

```
src/game/   Pure TypeScript engine (no React): world gen, traits & genetics,
            yearly tick, AI houses, wars, schemes, events, succession, saves.
src/svg/    Procedural SVG art: Portrait, Sigil, PlanetArt, SolarMap,
            PlanetMap (Voronoi regions), Ship, ItemIcon, Icons.
src/ui/     React screens, tabs and modals.
```

Game state is plain JSON driven by a seeded RNG stored in the state, so a save always restores exactly the same future.
