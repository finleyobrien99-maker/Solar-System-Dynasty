// Your ships defending other houses of your realm, and worlds standing united
// against outsiders (realmDefence.ts). Reading it never changes the game.
import { unitedUntil } from '../../game/realmDefence';
import { PLANETS } from '../../game/planets';
import { ClanBadge, Section } from '../components';
import { useGame } from '../store';

export function RealmDutiesSection() {
  const { s } = useGame();
  const loans = s.aiWars.flatMap((w) => (w.realmAid ?? []).filter((p) => p.clanId === s.playerClanId && p.sent > 0).map((p) => ({ w, p })));
  const united = PLANETS.map((p) => ({ p, until: unitedUntil(s, p.id) })).filter((x) => x.until);
  if (!loans.length && !united.length) return null;
  return (
    <Section
      title="Realm duties"
      icon="war"
      info="When an outsider attacks a house of your realm, its sovereign must come and every sworn house is asked. You answer your own calls; your ships fight beside the defender, take their own losses and come home when the war ends. A world that keeps losing land to outsiders stands united for a while: then every house of it answers."
    >
      <div className="card flat stack" style={{ overflowWrap: 'anywhere' }}>
        {loans.map(({ w, p }) => (
          <div key={w.id} className="spread wrap">
            <span className="row wrap" style={{ gap: 'var(--space-6px)', minWidth: 0, maxWidth: '100%' }}>
              Defending <ClanBadge clanId={w.defender} /> against <ClanBadge clanId={w.attacker} />
            </span>
            <b>
              {p.ships} of {p.sent} ships
            </b>
            {p.lost !== undefined && <span className={p.lost ? 'bad' : 'muted'}>{p.lost} ships lost</span>}
            {!!p.returned && <span className="muted">{p.returned} ships returned home</span>}
          </div>
        ))}
        {united.map(({ p, until }) => (
          <div key={p.id} className="muted">
            {p.name} stands united against outsiders until {until}.
          </div>
        ))}
      </div>
    </Section>
  );
}
