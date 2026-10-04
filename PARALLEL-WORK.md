# Working in parallel

Two AI agents are working on Solar Dynasty at the same time. This file says who owns what, so neither undoes the other's work. Read [CLAUDE.md](CLAUDE.md) and the working agreement in [ROADMAP.md](ROADMAP.md) §20 first: all of that still applies.

|            | Agent 1 (Claude Code, already working)                                                                  | Agent 2 (you)                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Branch     | `phase-0-foundations`                                                                                   | `ui-foundations`, created from `phase-0-foundations`           |
| Folder     | `C:\Users\finle\planetdynasty`                                                                          | `C:\Users\finle\planetdynasty-ui` (a git worktree, see Setup)  |
| Owns       | The game engine (`src/game/**`), saves, events, balance and performance                                 | UI foundations, accessibility and UI bugs: the UI layer only   |
| Next tasks | ROADMAP 3.1 event system (porting all 67 events), then 1.1 relationships, 1.5 secrets, 1.7 obituaries… | The list below                                                 |

## Your tasks (Agent 2), in this order

1. **Design tokens (ROADMAP 0.6).** Move every colour, font, radius, spacing and shadow in `src/styles.css` (and repeated inline styles in components, where practical) into CSS variables on `:root`. **This is a pure refactor: the game must look pixel-identical.** Fin hasn't picked the new UI direction yet (Phase 9), so don't restyle anything.
2. **Panel stack (0.6).** `ui.panel` in `src/ui/store.tsx` holds one panel at a time. Make it a small typed stack so windows push and pop (Menu → Saves → back to Menu), and make the Android back button (`handleBack` in `src/native.ts`) pop it.
3. **Accessibility (9.6).**
   - Keyboard navigation and visible focus rings.
   - ARIA on custom controls: tabs, trait chips, tap-twice buttons, steppers.
   - Trait categories you can tell apart without colour (genetic, personality and cyber chips are colour-only today; a small glyph would do).
   - A text-size setting and a reduced-motion setting, stored in `localStorage` under `solar-dynasty:prefs`, **not** in `GameState`.
4. **UI bugs from ROADMAP §18.**
   - The character modal on phones gets very long with ~38 traits: collapse traits by category.
   - Turning VIP off with an overfull Gene Vault shows "7 / 2": add a "release some" hint on the Bloodline tab. UI only; don't change vault rules.
   - Fonts load from Google Fonts, so offline play falls back to system fonts. Self-host Orbitron and Exo 2 in `public/` (check the licences; both should be OFL), update `index.html`, and make sure `public/sw.js` caches them.
5. **Component tests (0.7).** React Testing Library tests for the trait picker (`src/ui/vip/TraitPicker.tsx`), `Btn`'s tap-twice confirm (`src/ui/components.tsx`) and the saves panel. Name them `src/**/*.test.tsx` (Vitest already includes that pattern) and start each with `// @vitest-environment jsdom`.

## Hands off: Agent 1 is changing these

- **Everything in `src/game/**`** (engine and its tests) and `scripts/**`.
- **Save data:** `GameState` (`src/game/types.ts`), `SAVE_VERSION`, `save.ts`, `codec.ts` and `src/game/__fixtures__/`. Never run `npm run fixtures`. If your work seems to need a new field in `GameState`, stop and ask Fin.
- **Event pop-ups:** `src/ui/modals/PendingModal.tsx`. The new event system will generate their option tooltips.
- **`mobile/game/gameHtml.ts`:** it's generated. Don't run `npm run build:app` and don't commit it; Agent 1 rebuilds it for releases.
- **Shared config and docs:** `CLAUDE.md`, `README.md`, `.github/workflows/**`, `eslint.config.js`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`. If you really need a config change, make it one small commit that touches nothing else and mention it when you hand back.
- **`ROADMAP.md`:** only edit the status lines of items you finish (0.6, 9.6, the 0.7 component tests, and the §18 bullets you fix), so merges stay clean.

## Setup (same PC as Agent 1)

```bash
cd C:/Users/finle/planetdynasty
git worktree add ../planetdynasty-ui -b ui-foundations phase-0-foundations
cd ../planetdynasty-ui
npm install
```

Use different ports from Agent 1, or the two of you will test each other's builds:

- dev server: `npm run dev -- --port 5273`
- end-to-end tests: `E2E_PORT=4273 npm run e2e` (PowerShell: `$env:E2E_PORT=4273; npm run e2e`)

Working from GitHub instead of this PC? `phase-0-foundations` isn't pushed yet, so ask Fin to have Agent 1 push it first.

## Rules

- Before every commit run `npm run check` (typecheck, lint, format check, unit tests). For UI changes also run `npm run e2e` on your port, and look at the app yourself at 390px and desktop width.
- Small, focused commits on `ui-foundations`. No model names in commit messages (ROADMAP §20).
- Don't push, open PRs, or merge into or rebase anyone else's branch. To pick up Agent 1's latest work, run `git merge phase-0-foundations` on your branch (merge, not rebase). Agent 1 merges `ui-foundations` back when Fin says so.
- Add new dependencies (for example `@testing-library/react` and `jsdom`) in their own commit that touches only `package.json` and `package-lock.json`, so a lockfile conflict is easy to redo.
- Ask Fin before anything that changes the feel of the game (ROADMAP §0).

## When you finish

Tell Fin, and end your last commit message with a short note: what's done, any shared config you had to touch, and anything you found that belongs in ROADMAP §18.
