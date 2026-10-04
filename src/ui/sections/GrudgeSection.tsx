import { ch } from '../../game/core';
import { isRival, memorySum, RIVAL_THRESHOLD } from '../../game/memory';
import type { Clan } from '../../game/types';
import { Sigil } from '../../svg/Sigil';
import { Face, Section } from '../components';
import { useGame } from '../store';

export function MemoryList({ clan }: { clan: Clan }) {
  const mems = (clan.memories ?? []).slice().sort((a, b) => b.year - a.year);
  if (!mems.length) return <div className="dim">They have no strong feelings about you yet.</div>;
  return (
    <div className="stack" style={{ gap: 'var(--space-4px)' }}>
      {mems.map((m, i) => (
        <div key={i} className="spread" style={{ fontSize: 'var(--font-size-0_86rem)' }}>
          <span>
            <span className="dim">{m.year}</span> {m.text}
          </span>
          <span className={m.value < 0 ? 'bad' : 'good'} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {m.value > 0 ? '+' : ''}
            {Math.round(m.value)}
          </span>
        </div>
      ))}
      <div className="muted" style={{ fontSize: 'var(--font-size-0_76rem)' }}>
        Memories fade each cycle, favours fastest, murders and executions slowest. They are inherited when the house gets a new head.
      </div>
    </div>
  );
}

export function GrudgeSection() {
  const { s, openClan } = useGame();
  const clans = Object.values(s.clans)
    .filter((c) => !c.isPlayer && (c.memories?.length ?? 0) > 0)
    .sort((a, b) => Math.abs(memorySum(b)) - Math.abs(memorySum(a)))
    .slice(0, 12);
  return (
    <Section
      title="Grudges & favours"
      icon="scheme"
      info={`Houses remember what you did to them, and so do their children. A house whose grudges add up to ${RIVAL_THRESHOLD} or worse becomes a Sworn Rival: rivals send assassins, sabotage your docks, rob your treasury and will declare war from anywhere in the system.`}
    >
      {!clans.length && <div className="empty">Nobody holds anything against you. Yet.</div>}
      <div className="grid">
        {clans.map((k) => {
          const head = ch(s, k.headId);
          const sum = Math.round(memorySum(k));
          const top = (k.memories ?? []).slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
          return (
            <div key={k.id} className="char" onClick={() => openClan(k.id)} role="button" tabIndex={0}>
              <Sigil spec={k.sigil} size={36} />
              {head && <Face c={head} size={44} />}
              <div className="meta">
                <div className="nm">
                  House {k.name} {isRival(k) && <span className="pill red">Sworn rival</span>}
                </div>
                <div className="sub">{top ? `${top.text} (${top.year})` : ''}</div>
                <span className={`pill ${sum < 0 ? 'red' : 'green'}`} style={{ marginTop: 'var(--space-4px)' }}>
                  {sum > 0 ? '+' : ''}
                  {sum} remembered
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
