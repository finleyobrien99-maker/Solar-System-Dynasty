// Read-only court facts shared by cards and profiles. Viewing them never advances the game.
import { secretsKnownTo } from '../game/secrets';
import { captiveRansom } from '../game/aiCourt';
import { alive, ch } from '../game/core';
import type { Character, GameState } from '../game/types';

export function captivityInfo(s: GameState, c: Character) {
  const captor = c.prisonerOf && s.clans[c.prisonerOf];
  if (!alive(c) || !captor || captor.isPlayer) return undefined;
  const demand = s.pending.find((p) => p.kind === 'event' && p.eventId === 'kin_ransom' && p.subjectId === c.id && p.data?.clan === captor.id);
  const quote = demand?.kind === 'event' ? demand.data?.amount : undefined;
  const quoted = typeof quote === 'number' && Number.isFinite(quote) && quote > 0;
  return { captor, amount: quoted ? quote : captiveRansom(s, c), quoted };
}

export function knownRomance(s: GameState, a: Character, b: Character): boolean {
  return (
    a.id === s.rulerId ||
    b.id === s.rulerId ||
    secretsKnownTo(s).some((x) => x.kind === 'affair' && ((x.subjectId === a.id && x.otherId === b.id) || (x.subjectId === b.id && x.otherId === a.id)))
  );
}

export function affairInfo(s: GameState, c: Character) {
  const lover = ch(s, c.loverId);
  if (!alive(c) || !alive(lover) || !knownRomance(s, c, lover)) return undefined;
  const evidence = secretsKnownTo(s).filter(
    (x) => x.kind === 'affair' && ((x.subjectId === c.id && x.otherId === lover.id) || (x.subjectId === lover.id && x.otherId === c.id)),
  );
  const married = alive(ch(s, c.spouseId)) || alive(ch(s, lover.spouseId));
  const exposed = evidence.some((x) => x.exposedYear !== undefined);
  return { lover, status: !married ? 'Lovers' : exposed ? 'Exposed affair' : 'Known private affair' };
}
