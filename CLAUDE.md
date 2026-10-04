# Solar Dynasty

A space dynasty life-sim (BitLife meets Crusader Kings, set in the solar system). Vite + React + TypeScript, no backend.

**Start here: read [ROADMAP.md](ROADMAP.md).** It has the current state, what's shallow, the full plan, specs, known bugs, the first tickets to pick up, and the working agreement (section 20). Design detail for building each system (tables, numbers, content lists) is in [ROADMAP-DEEP-DIVES.md](ROADMAP-DEEP-DIVES.md).

Quick facts:
- Engine is pure TS in `src/game` (no React). UI changes state only through `act()` in `src/ui/store.tsx`.
- All randomness goes through `src/game/rng.ts`. Region owners change only via `setOwner()`.
- Never break old saves. Changing `GameState`? Bump `SAVE_VERSION` (core.ts), add a `MIGRATIONS` step in `src/game/save.ts`, then run `npm run fixtures`.
- VIP mode (`src/game/vip.ts`) only ever helps the player, never AI houses.
- Check with `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run e2e` for UI changes (look at the app yourself too). `npm run balance` and `npm run bench` measure balance and speed.
- The `mobile/` Expo app embeds the web build. See `mobile/AGENTS.md`.
- The owner is Fin. Keep replies short, plain and British, with a bit of humour.
