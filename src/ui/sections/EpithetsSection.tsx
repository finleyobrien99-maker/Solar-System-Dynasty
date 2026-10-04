import { DEED_LABELS, EPITHETS, EPITHET_BY_ID, primaryEpithet, type EpithetCategory } from '../../game/epithetDefs';
import type { Character } from '../../game/types';
import { Section } from '../components';
const CATEGORIES: EpithetCategory[] = ['Character', 'War', 'Rule', 'Family', 'Intrigue', 'Science', 'Prosperity'];
export function EpithetsSection({ c }: { c: Character }) {
  const earned = c.reputation?.earned ?? [],
    primary = primaryEpithet(c.reputation);
  return (
    <Section
      title="Earned epithets"
      icon="crown"
      info="Rulers across the system earn names from their deeds. Every earned name stays in their history. The most notable appears beside their name; equally notable new names take precedence."
    >
      <div className="muted">Rulers earn names through their deeds. Earlier actions in old saves are not counted.</div>
      {!earned.length && <div className="empty">No epithet earned yet. A reputation takes a lifetime of deeds.</div>}
      <div className="grid tight">
        {earned
          .slice()
          .reverse()
          .map((entry) => {
            const def = EPITHET_BY_ID[entry.id];
            if (!def) return null;
            return (
              <div className="card flat" key={entry.id}>
                <div className="spread wrap">
                  <b className={def.tone === 'bad' ? 'bad' : def.tone === 'good' ? 'good' : 'gold'}>{def.name}</b>
                  <span className="muted">Year {entry.year}</span>
                </div>
                {primary?.id === def.id && <div className="gold">Known by this name</div>}
                <p>{entry.why}</p>
                <div className="muted">{def.rule}</div>
              </div>
            );
          })}
      </div>
      <details className="card flat" style={{ marginTop: 'var(--space-8px)' }}>
        <summary>All {EPITHETS.length} epithets and how to earn them</summary>
        {CATEGORIES.map((category) => (
          <div key={category} style={{ marginTop: 'var(--space-14px)' }}>
            <h4>{category}</h4>
            <div className="grid tight">
              {EPITHETS.filter((def) => def.category === category).map((def) => (
                <div key={def.id} className="card flat">
                  <b>
                    {def.name}
                    {earned.some((e) => e.id === def.id) && ' ✓'}
                  </b>
                  <p>{def.rule}</p>
                  {c.reputation && (
                    <div className="muted">
                      {def.needs
                        .map((n) => {
                          const have = c.reputation?.deeds[n.deed] ?? 0;
                          return DEED_LABELS[n.deed] + ': ' + have + (n.min === undefined ? ' (must stay at ' + n.max + ' until earned)' : ' / ' + n.min);
                        })
                        .join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </details>
    </Section>
  );
}
