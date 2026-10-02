import { useState } from 'react';
import { alive, ch, childrenOf, dynastyMembers } from '../../game/core';
import type { Character } from '../../game/types';
import { Face, Modal } from '../components';
import { useGame } from '../store';

function onRulerPath(s: ReturnType<typeof useGame>['s'], c: Character): boolean {
  let cur: Character | undefined = s.characters[s.rulerId];
  while (cur) {
    if (cur.id === c.id) return true;
    const parent: Character | undefined = ch(s, cur.fatherId)?.clanId === s.playerClanId ? ch(s, cur.fatherId) : ch(s, cur.motherId);
    cur = parent && parent.clanId === s.playerClanId ? parent : undefined;
  }
  return false;
}

function Node({ c, depth }: { c: Character; depth: number }) {
  const { s, openChar, setUi } = useGame();
  const kids = childrenOf(s, c)
    .filter((k) => k.clanId === s.playerClanId)
    .sort((a, b) => a.born - b.born);
  const [open, setOpen] = useState(depth < 2 || onRulerPath(s, c));
  const spouse = ch(s, c.spouseId);
  const wasRuler = s.dynasty.rulers.some((r) => r.id === c.id);
  return (
    <li>
      <span
        className={`node ${c.id === s.rulerId || wasRuler ? 'ruler' : ''}`}
        onClick={() => {
          setUi({ panel: null });
          openChar(c.id);
        }}
      >
        <Face c={c} size={38} />
        <span>
          <b style={{ color: alive(c) ? undefined : 'var(--muted)' }}>
            {wasRuler && '♛ '}
            {c.name}
          </b>
          <span className="spouse">
            {' '}
            {c.born}–{c.died ?? ''}
            {spouse ? ` · m. ${spouse.name}` : ''}
            {c.marriedIn ? ' (wed out)' : ''}
          </span>
        </span>
      </span>
      {kids.length > 0 && (
        <button className="btn ghost small" style={{ marginLeft: 6 }} onClick={() => setOpen((o) => !o)}>
          {open ? '−' : `+${kids.length}`}
        </button>
      )}
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Node key={k.id} c={k} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TreeModal() {
  const { s, setUi, openChar } = useGame();
  const founder = s.characters[s.dynasty.founderId];
  // Roots: the founder, plus any dynasty member whose parents aren't in the dynasty (e.g. adopted kin).
  const roots = dynastyMembers(s, true).filter((c) => {
    const f = ch(s, c.fatherId);
    const m = ch(s, c.motherId);
    return !(f?.clanId === s.playerClanId) && !(m?.clanId === s.playerClanId);
  });
  if (founder && !roots.some((r) => r.id === founder.id)) roots.unshift(founder);
  return (
    <Modal title="Dynasty Tree" onClose={() => setUi({ panel: null })} wide icon="family">
      <div className="card flat" style={{ marginBottom: 10 }}>
        <h4>Rulers of the house</h4>
        <div className="row wrap" style={{ gap: 6 }}>
          {s.dynasty.rulers.map((r, i) => (
            <button
              key={r.id + i}
              className="pill gold"
              onClick={() => {
                setUi({ panel: null });
                openChar(r.id);
              }}
            >
              {i + 1}. {r.name} ({r.from}–{r.to ?? 'now'})
            </button>
          ))}
        </div>
      </div>
      <div className="tree">
        <ul style={{ borderLeft: 0, paddingLeft: 0 }}>
          {roots.map((r) => (
            <Node key={r.id} c={r} depth={0} />
          ))}
        </ul>
      </div>
    </Modal>
  );
}
