// Before you declare (WAVE-5-DIPLOMACY.md slice 1): who would come to the
// defender's aid, and why. Reading it never rolls dice or changes anything.
import { realmCallPreview, realmOf, unitedUntil } from '../../game/realmDefence';
import { PLANET_BY_ID } from '../../game/planets';
import type { CasusBelli } from '../../game/types';
import { ClanBadge } from '../components';
import { useGame } from '../store';

const ROLE = { sovereign: 'Sovereign', vassal: 'Sworn house', planet: 'Same world', pact: 'Treaty partner' } as const;

export function RealmForecast({ regionId, defenderId, cb = 'conquest' }: { regionId: string; defenderId: string; cb?: CasusBelli }) {
  const { s } = useGame();
  const offers = realmCallPreview(s, s.playerClanId, defenderId, regionId, cb);
  const defender = s.clans[defenderId];
  if (!defender) return null;
  if (!offers.length)
    return realmOf(s, defenderId) === realmOf(s, s.playerClanId) ? (
      <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
        A quarrel inside your own realm: nobody else will be called.
      </div>
    ) : null;
  const expected = Math.round(offers.reduce((n, o) => n + o.chance * o.proposedShips, 0));
  const world = PLANET_BY_ID[s.regions[regionId]?.planetId ?? '']?.name;
  const united = s.regions[regionId] && unitedUntil(s, s.regions[regionId].planetId);
  return (
    <div className="card flat stack" aria-label={`Who will defend House ${defender.name}`} style={{ gap: 'var(--space-6px)', overflowWrap: 'anywhere' }}>
      <b>Who will defend House {defender.name}</b>
      <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
        Expect about {expected} more ships beside their own {defender.fleet}.{united ? ` ${world} stands united against outsiders until ${united}.` : ''}
      </div>
      {offers.map((o) => (
        <div key={o.clanId} className="stack" style={{ gap: 'var(--space-2px)' }}>
          <div className="spread wrap">
            <span style={{ minWidth: 0, maxWidth: '100%' }}>
              <ClanBadge clanId={o.clanId} /> <span className="muted">{ROLE[o.role]}</span>
            </span>
            <span className={o.blocker ? 'muted' : o.chance >= 1 ? 'bad' : o.chance >= 0.5 ? 'gold' : 'good'}>
              {o.blocker
                ? 'Cannot come'
                : o.chance >= 1
                  ? `Will come with ${o.proposedShips}`
                  : `${Math.round(o.chance * 100)}% likely, ${o.proposedShips} ships`}
            </span>
          </div>
          <div className="dim" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
            {o.reasons.map((r) => (r.value !== undefined ? `${r.label} (${r.value > 0 ? '+' : ''}${r.value})` : r.label)).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  );
}
