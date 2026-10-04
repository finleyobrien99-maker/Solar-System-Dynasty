import { useState } from 'react';
import { alive, ch, childrenOf, dynastyMembers, isBloodlineClan } from '../../game/core';
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
  const { s, openChar } = useGame();
  const kids = childrenOf(s, c)
    .filter((k) => isBloodlineClan(s, k.clanId))
    .sort((a, b) => a.born - b.born);
  const cadet = c.clanId !== s.playerClanId ? s.clans[c.clanId] : undefined;
  const [open, setOpen] = useState(depth < 2 || onRulerPath(s, c));
  const spouse = ch(s, c.spouseId);
  const wasRuler = s.dynasty.rulers.some((r) => r.id === c.id);
  return (
    <li>
      <span
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openChar(c.id);
          }
        }}
        className={`node ${c.id === s.rulerId || wasRuler ? 'ruler' : ''}`}
        onClick={() => {
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
            {cadet ? ` · House ${cadet.name}` : ''}
          </span>
        </span>
      </span>
      {kids.length > 0 && (
        <button
          aria-label={`${open ? 'Collapse' : 'Expand'} descendants of ${c.name}`}
          aria-expanded={open}
          className="btn ghost small"
          style={{ marginLeft: 'var(--space-6px)' }}
          onClick={() => setOpen((o) => !o)}
        >
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
      <div className="card flat" style={{ marginBottom: 'var(--space-10px)' }}>
        <h4>Rulers of the house</h4>
        <div className="row wrap" style={{ gap: 'var(--space-6px)' }}>
          {s.dynasty.rulers.map((r, i) => (
            <button
              key={r.id + i}
              className="pill gold"
              onClick={() => {
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
