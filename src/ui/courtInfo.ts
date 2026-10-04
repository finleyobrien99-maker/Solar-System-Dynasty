// Read-only court facts shared by cards and profiles. Viewing them never advances the game.
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

export function affairInfo(s: GameState, c: Character) {
  const lover = ch(s, c.loverId);
  if (!alive(c) || !alive(lover)) return undefined;
  let married = false,
    exposed = false;
  for (const [partner, other] of [
    [c, lover],
    [lover, c],
  ]) {
    const spouse = ch(s, partner.spouseId);
    if (!alive(spouse) || spouse.spouseId !== partner.id) continue;
    married = true;
    // A recorded discovery of this pair, or the player's spouse learning they have a lover.
    exposed ||=
      (s.relations[spouse.id]?.[other.id]?.feelings ?? []).some((f) => f.key === 'seduced:' + partner.id) ||
      (s.relations[spouse.id]?.[partner.id]?.feelings ?? []).some((f) => f.key === 'lover' && f.value < 0);
  }
  return { lover, status: !married ? 'Lovers' : exposed ? 'Exposed affair' : 'No discovery recorded' };
}
