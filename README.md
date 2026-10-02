# Solar Dynasty

A dynasty life-sim for the web, in the style of Medieval Life / BitLife crossed with a light Crusader Kings, set across the ten worlds of the solar system.

You lead a minor house on one planet. Every **Age Up** is a cycle (a year): events fire, children are born, rivals scheme, wars rage. When your ruler dies you carry on as their heir.

## Features

- **Ten planetary powers**: Mercury, Venus, Earth, Mars, Ceres, Jupiter, Saturn, Uranus, Neptune and Pluto. Each has its own faction, culture, faith, monarch title and native bonus, with 3-5 rival houses fighting over its regions.
- **Ranks**: Governor → Viceroy → Sovereign (seize a planet's throne-region) → Solar Emperor (rule three throne-worlds and forge the Solar Throne).
- **Deep trait system**: around 90 traits across genetic ladders (Dim → Genius, Feeble → Herculean, Homely → Radiant, psionics…), personality, education, acquired traits and cybernetics. Every trait explains itself on hover or tap.
- **Gene Vault**: lock genetic or personality traits so every child born into your dynasty inherits them, forever, or purge bad genes so they never pass on. Breed for a gene, lock it, build the perfect bloodline.
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

## Layout

```
src/game/   Pure TypeScript engine (no React): world gen, traits & genetics,
            yearly tick, AI houses, wars, schemes, events, succession, saves.
src/svg/    Procedural SVG art: Portrait, Sigil, PlanetArt, SolarMap,
            PlanetMap (Voronoi regions), Ship, ItemIcon, Icons.
src/ui/     React screens, tabs and modals.
```

Game state is plain JSON driven by a seeded RNG stored in the state, so a save always restores exactly the same future.
