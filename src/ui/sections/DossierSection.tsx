// What you know about someone (wave 1 dossiers): facts, rumours, leverage
// and what they have on you, each with where it comes from. Read-only.
import { dossier, hasDossier, type DossierLine } from '../../game/dossier';
import type { Character } from '../../game/types';
import { Section } from '../components';
import { useGame } from '../store';

function Lines({ title, lines, empty }: { title: string; lines: DossierLine[]; empty: string }) {
  const { s, openChar } = useGame();
  return (
    <div className="card flat" style={{ marginBottom: 'var(--space-8px)' }}>
      <h4 style={{ margin: '0 0 var(--space-4px)' }}>{title}</h4>
      {!lines.length && <div className="muted">{empty}</div>}
      <ul style={{ margin: 0, paddingLeft: 'var(--space-16px)' }}>
        {lines.map((l, i) => {
          const who = l.personId ? s.characters[l.personId] : undefined;
          return (
            <li key={i} style={{ marginBottom: 'var(--space-4px)' }}>
              <span className={l.tone === 'neutral' ? undefined : l.tone}>{l.text}</span>{' '}
              <span className="muted" style={{ fontSize: 'var(--font-size-0_78rem)' }}>
                ({l.source})
              </span>
              {who && (
                <button
                  className="btn ghost small"
                  style={{ padding: '0 6px', minHeight: 24, marginLeft: 4 }}
                  aria-label={`Open ${who.name}'s profile`}
                  onClick={() => openChar(who.id)}
                >
                  {who.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DossierSection({ c }: { c: Character }) {
  const { s } = useGame();
  if (!hasDossier(s, c)) return null;
  const d = dossier(s, c.id);
  return (
    <Section
      title="Dossier"
      icon="scheme"
      info={`What your court knows about ${c.name}. Rumours are unproven and say who is spreading them. Secrets nobody has found out never appear here.`}
    >
      <Lines title="Known facts" lines={d.facts} empty="Nothing of note." />
      <Lines title="Rumours (unproven)" lines={d.rumours} empty="No whispers worth repeating." />
      <Lines title="Leverage you hold" lines={d.leverage} empty="Nothing you could use yet." />
      <Lines title="What they have on you" lines={d.againstYou} empty="Nothing that you know of." />
    </Section>
  );
}
