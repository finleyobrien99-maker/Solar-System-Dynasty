import { truceOf, OATH_BREAK_COST, TRUCE_CYCLES } from '../../game/peace';
import { ClanBadge, Section } from '../components';
import { useGame } from '../store';

export function TrucesSection({ clanId }: { clanId?: string }) {
  const { s } = useGame();
  const id = clanId ?? s.playerClanId;
  const oaths = s.truces.filter((t) => (t.a === id || t.b === id) && !!truceOf(s, t.a, t.b));
  if (clanId && !oaths.length) return null;
  return (
    <Section
      title="Peace oaths"
      icon="peace"
      info={`Actual victory, defeat or white peace creates a ${TRUCE_CYCLES}-cycle bilateral truce. It belongs to the houses and survives succession. Normal wars and independence declarations respect it. Explicitly breaking it costs ${OATH_BREAK_COST} prestige plus the war's normal cost, earns one broken-oath deed, lowers other houses' opinion by 10, and leaves the victim a lasting grudge. AI uses its own prestige; wrathful or deceitful rulers who truly hate their opponent may break one too. A claim or blood feud does not erase an oath.`}
    >
      {!oaths.length && <div className="empty">Your house has no current truces.</div>}
      <div className="grid">
        {oaths.map((t) => {
          const other = t.a === id ? t.b : t.a;
          return (
            <div className="card flat stack" key={other}>
              <ClanBadge clanId={other} />
              <span className="muted">
                Peace sworn in {t.started} · Until {t.until}
              </span>
              <span className="good">
                {t.until - s.year} {t.until - s.year === 1 ? 'cycle' : 'cycles'} remaining
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
