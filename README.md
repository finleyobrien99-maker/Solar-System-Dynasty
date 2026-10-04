# Solar Dynasty

A dynasty life-sim for the web, in the style of Medieval Life / BitLife crossed with a light Crusader Kings, set across the ten worlds of the solar system.

You lead a house on one planet, from a minor governor up to the Solar Emperor. Every **Age Up** is a cycle (a year): events fire, children are born, rivals scheme, wars rage. When your ruler dies you carry on as their heir.

## Features

- **Ten planetary powers**: Mercury, Venus, Earth, Mars, Ceres, Jupiter, Saturn, Uranus, Neptune and Pluto. Each has its own faction, culture, faith, monarch title and native bonus, with 3-5 rival houses fighting over its regions.
- **Ranks**: Governor → Viceroy → Sovereign (seize a planet's throne-region) → Solar Emperor (rule three throne-worlds and forge the Solar Throne).
- **Starting scenarios**: begin as a Governor, a Viceroy with three regions and two vassals, a planet's Monarch, or a Solar Emperor already ruling three worlds.
- **Character creator**: name, gender, age slider (16-70), looks (skin, hair, eyes, face and more), upbringing, personality, and a starting family (single, married, or married with kids).
- **VIP mode** (a sandbox, like the VIP perks in mobile life sims): build a god-tier ruler with every trait you want, edit anyone's traits, stats, age and name on the fly, an unlimited free Gene-Forge and Gene Vault, and a console for credits, prestige, fleet, immortality and bloodline-wide buffs. Switch it on at the start or any time from the menu. It never helps AI houses.
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
- **67 random events**: galas, grav-jousts, poisoned feasts, masquerades, heretics, haunted wings, void leviathans, xeno-beast hunts, pilgrimages, arena duels and more. Some choices come back years later: lend an old friend money, raise a strange egg, fill the granaries before a blight. Childhood events shape your heirs' personalities.
- **Treasury**: procedurally generated crowns, weapons, armour, flagships and relics that pass down the line.
- **All art is procedural SVG**: portraits (genes, age, rank crowns, implants, scars, psionic glow), planets, house sigils, warships, relics and the solar system and planet region maps.
- **Bulletproof saves**: autosave after every action, compressed, checksummed, with a verified backup per slot, 3 manual slots, and export/import to a file.

## Running it

```bash
npm install
npm run dev       # play at http://localhost:5173
npm run build     # static build in dist/ (works on any static host, e.g. GitHub Pages)
npm test          # long headless simulations, every starting scenario, VIP mode and genetics tests
npm run check     # typecheck, lint, format check and unit tests in one go
npm run typecheck
npm run lint      # ESLint, including the engine-purity rules
npm run e2e       # build, then play every scenario in a real browser (Edge locally, Chrome on CI)
npm run balance   # seeded bot games scored against the ROADMAP §17 balance targets
npm run bench     # Age Up, act() and autosave timings as a dynasty grows to 10k
npm run fixtures  # after bumping SAVE_VERSION: freeze test saves for the new version
```

## Playing online

Every push to `main` builds the game and publishes it to GitHub Pages at
https://finleyobrien99-maker.github.io/Solar-System-Dynasty/ (see `.github/workflows/deploy.yml`).
One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
CI (`.github/workflows/ci.yml`) typechecks, tests and builds every branch.

## On your phone

`mobile/` is an Expo (SDK 57) app that runs the game full-screen. The whole game is
bundled inside it, so it works offline. On top of the web version it adds:

- saves mirrored to the phone's own storage (iOS can wipe web storage for idle apps),
- haptics on Age Up, events, battles, births and deaths,
- the Android back button closes tooltips, modals and setup steps,
- Export save opens the share sheet.

```bash
npm run build:app        # rebuild the game into mobile/game/gameHtml.ts (run after any game change)
cd mobile
npx expo start           # dev: scan the QR code with Expo Go
npx eas-cli build -p android --profile preview   # installable APK (opens in Expo Orbit)
```

The EAS project is `@finfin030/solar-dynasty`. Builds show up on expo.dev and in Expo Orbit.
The folder isn't a git repo, so run EAS commands with `EAS_NO_VCS=1` set.

## Layout

```
src/game/   Pure TypeScript engine (no React): world gen, traits & genetics,
            yearly tick, AI houses, wars, schemes, events, succession, saves.
src/svg/    Procedural SVG art: Portrait, Sigil, PlanetArt, SolarMap,
            PlanetMap (Voronoi regions), Ship, ItemIcon, Icons.
src/ui/     React screens, tabs and modals.
```

Game state is plain JSON driven by a seeded RNG stored in the state, so a save always restores exactly the same future.
