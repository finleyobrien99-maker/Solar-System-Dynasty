import { AMBITIONS, ambitionChoices, ambitionProgress, chooseAmbition } from '../../game/ambitions';
import { ageOf, ruler } from '../../game/core';
import type { Character } from '../../game/types';
import { Btn, Section } from '../components';
import { useGame } from '../store';

export function AmbitionRecord({ c }: { c: Character }) {
  const a = c.ambition;
  if (!a) return null;
  const def = AMBITIONS[a.kind];
  const progress = Math.min(def.target, ambitionProgress(c));
  return (
    <div className="card flat stack" style={{ gap: 'var(--space-6px)' }}>
      <div className="spread wrap">
        <b>{def.name}</b>
        <span className={a.status === 'fulfilled' ? 'pill green' : a.status === 'failed' ? 'pill red' : 'pill gold'}>
          {a.status === 'active' ? 'Coronation vow' : a.status === 'fulfilled' ? 'Promise kept' : 'Unfulfilled'}
        </span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {def.text}
      </p>
      <progress aria-label="Ambition progress" value={progress} max={def.target} style={{ width: '100%', accentColor: 'var(--gold)' }} />
      <div className="spread wrap">
        <span>
          {progress.toLocaleString()} / {def.target.toLocaleString()}
        </span>
        <span className="dim">
          Chosen in {a.year}
          {a.ended !== undefined ? ' · Ended ' + a.ended : ''}
        </span>
      </div>
      {a.status === 'active' && <span className="muted">Reward: {def.reward} prestige and Fulfilled (+1 Diplomacy).</span>}
    </div>
  );
}
export function AmbitionSection() {
  const { s, act } = useGame();
  const c = ruler(s),
    choices = ambitionChoices(s, c);
  return (
    <Section
      title="What will they remember?"
      icon="crown"
      info="Choose one personal ambition per lifetime. Only your deeds after choosing count. Completing it gives 80–120 prestige and a permanent +1 Diplomacy. Death, retirement or deposition closes an unfinished vow; your heir chooses their own. Peace needs eight consecutive cycles without any war or succession dispute."
    >
      {c.ambition ? (
        <AmbitionRecord c={c} />
      ) : ageOf(s, c) < 16 ? (
        <div className="card flat muted">Your ruler can choose a coronation vow at 16.</div>
      ) : (
        <div className="grid">
          {choices.map((kind) => {
            const def = AMBITIONS[kind];
            return (
              <div className="card flat stack" key={kind} style={{ gap: 'var(--space-8px)' }}>
                <b className="gold">{def.name}</b>
                <p style={{ margin: 0 }}>{def.text}</p>
                <span className="muted">{def.reward} prestige · +1 Diplomacy when fulfilled</span>
                <Btn
                  kind="primary"
                  reason={c.prisonerOf ? 'You must be free to make a vow.' : s.gameOver ? 'Your dynasty has ended.' : null}
                  onClick={() => act((d) => chooseAmbition(d, kind))}
                >
                  Choose this ambition
                </Btn>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
