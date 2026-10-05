import { AmbitionRecord } from './AmbitionSection';
import { alive } from '../../game/core';
import { rulerLegacy } from '../../game/legacy';
import { retiredRuler } from '../../game/life';
import type { Character } from '../../game/types';
import { Section } from '../components';
import { useGame } from '../store';

export function RulerLegacy({ c }: { c: Character }) {
  const { s } = useGame();
  const legacy = rulerLegacy(s, c);
  const finished = !alive(c) || retiredRuler(s, c.id);
  return (
    <Section
      title={finished ? 'A reign remembered' : 'Legacy so far'}
      icon="codex"
      info="The deeds of this person, not the whole dynasty. Reign length comes from the ruler history; rival rulers use their recorded ruling cycles. Deed records in older saves begin with the epithet update."
    >
      <div className="card flat">
        <b className="gold">{legacy.name}</b>
        <p className="muted" style={{ marginTop: 'var(--space-6px)' }}>
          {alive(c) ? 'Age ' + legacy.age : c.born + '–' + c.died + ' · Died aged ' + legacy.age + ' (' + c.deathCause + ')'}
        </p>
        <div className="grid tight">
          {[
            [legacy.rulingYears, 'Cycles ruling'],
            [legacy.children, 'Children'],
            [legacy.grandchildren, 'Grandchildren'],
          ].map(([value, label]) => (
            <div className="card flat" key={label}>
              <b className="gold">{value}</b>
              <div className="muted">{label}</div>
            </div>
          ))}
        </div>
        <AmbitionRecord c={c} />
        <h4 style={{ marginTop: 'var(--space-14px)' }}>Known for</h4>
        {legacy.highlights.length ? (
          <div className="grid tight">
            {legacy.highlights.map((item) => (
              <div className="spread wrap" key={item.deed}>
                <span>{item.label}</span>
                <b>{item.value.toLocaleString()}</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No major deeds recorded. Their place in the family endures.</p>
        )}
        {legacy.recordedSince !== undefined && (
          <p className="dim" style={{ marginTop: 'var(--space-8px)', marginBottom: 0 }}>
            Deeds recorded from year {legacy.recordedSince}.
          </p>
        )}
      </div>
    </Section>
  );
}
