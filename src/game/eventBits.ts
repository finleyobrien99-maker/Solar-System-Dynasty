// Building blocks shared by the event decks (events.ts, eventsMore.ts) for
// options written with the DSL (dsl.ts).

import { clanOf, regionOf, who, type Cond, type Ctx, type Effect, type Who } from './dsl';
import { canCatch, myRegion, randomCourt, rivalClan } from './eventKit';

const KNOWN: Who[] = ['root', 'subject', 'heir'];

/** Bind a random member of the court (kin and their spouses). */
export const courtier = (as: string): Effect => ({ pick: as, get: (c) => randomCourt(c.s), text: 'a courtier' });

/** Bind one of your regions at random. */
export const myRegionPick = (as: string): Effect => ({ pick: as, get: (c) => myRegion(c.s), text: 'one of your regions' });

/** Bind a rival house, most likely one that dislikes you. */
export const rivalPick = (as: string): Effect => ({ pick: as, get: (c) => rivalClan(c.s), text: 'a rival house' });

/** Alive and not immune to disease. Tooltips assume a pick will be. */
export const catchable = (w: Who): Cond => ({ test: (c) => canCatch(who(c, w)), why: '', assume: KNOWN.includes(w) ? undefined : true });

/** The pick found somebody. Tooltips assume it will. */
export const present = (name: string): Cond => ({ test: (c) => !!c.picks[name], why: '', assume: true });

export const named = (c: Ctx, w: Who): string => who(c, w)?.name ?? 'someone';

export const placeName = (c: Ctx, key: string): string => regionOf(c, key)?.name ?? 'your lands';

export const houseName = (c: Ctx, key: string): string | undefined => clanOf(c, key)?.name;
