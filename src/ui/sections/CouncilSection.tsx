import { effStats, fullName, relationTo } from '../../game/core';
import { appoint, candidates, councillor, councilStat, dismiss, ROLE_KEYS, ROLES } from '../../game/council';
import { STAT_NAMES } from '../../game/traits';
import type { CouncilRole } from '../../game/types';
import { Btn, Face, Section } from '../components';
import { useGame } from '../store';

function Seat({ role }: { role: CouncilRole }) {
  const { s, act, openChar } = useGame();
  const def = ROLES[role];
  const c = councillor(s, role);
  const pool = candidates(s, role).slice(0, 25);
  const v = councilStat(s, role);
  return (
    <div className="card flat stack" style={{ gap: 'var(--space-8px)', padding: 'var(--space-12px)' }}>
      <div className="spread">
        <b>{def.name}</b>
        <span className="pill">{STAT_NAMES[def.stat]}</span>
      </div>
      {c ? (
        <div className="row" style={{ cursor: 'pointer' }} onClick={() => openChar(c.id)}>
          <Face c={c} size={44} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{fullName(s, c)}</div>
            <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)' }}>
              {relationTo(s, c) || 'Kin'} · {STAT_NAMES[def.stat]} {effStats(s, c)[def.stat]}
            </div>
          </div>
        </div>
      ) : (
        <div className="dim" style={{ fontSize: 'var(--font-size-0_85rem)' }}>
          Seat empty. {def.desc}
        </div>
      )}
      <div className="good" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
        {c ? def.effect(v) : def.desc}
      </div>
      <div className="row wrap" style={{ gap: 'var(--space-6px)' }}>
        <select
          id={`council-${role}`}
          aria-label={`Appoint ${def.name}`}
          value=""
          onChange={(e) => e.target.value && act((d) => appoint(d, role, e.target.value))}
          style={{ flex: 1, minWidth: 0 }}
        >
          <option value="">{c ? 'Replace with…' : 'Appoint…'}</option>
          {pool.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({STAT_NAMES[def.stat].slice(0, 3)} {effStats(s, p)[def.stat]})
            </option>
          ))}
        </select>
        {c && (
          <Btn small kind="ghost" onClick={() => act((d) => dismiss(d, role))}>
            Dismiss
          </Btn>
        )}
      </div>
    </div>
  );
}

export function CouncilSection() {
  return (
    <Section
      title="Council"
      icon="users"
      info="Fill five seats from your family: your bloodline (cadet branches included) and their spouses. Each seat uses one stat and boosts part of the realm. Councillors slowly get better at their jobs while they serve."
    >
      <div className="grid tight">
        {ROLE_KEYS.map((r) => (
          <Seat key={r} role={r} />
        ))}
      </div>
    </Section>
  );
}
