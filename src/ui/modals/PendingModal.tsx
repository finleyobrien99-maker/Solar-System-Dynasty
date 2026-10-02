// Shows whatever is at the front of the pending queue: an event with choices,
// a notice, a battle report or a succession.

import { useEffect } from 'react';
import { ageOf, ch, clanTitle, fullName } from '../../game/core';
import { buildCtx, EVENT_BY_ID, resolveEvent } from '../../game/events';
import { TRAITS } from '../../game/traits';
import type { BattleReport, Pending } from '../../game/types';
import { haptic } from '../../native';
import { Icon } from '../../svg/Icons';
import { Ship } from '../../svg/Ship';
import { Btn, Face, Modal, TraitList, WarBar } from '../components';
import { useGame } from '../store';

function dismiss(uid: string) {
  return (d: { pending: Pending[] }) => {
    d.pending = d.pending.filter((p) => p.uid !== uid);
  };
}

function EventView({ p }: { p: Extract<Pending, { kind: 'event' }> }) {
  const { s, act } = useGame();
  const def = EVENT_BY_ID[p.eventId];
  if (!def) {
    return (
      <Modal title="Nothing happens" onClose={() => act(dismiss(p.uid))}>
        <Btn kind="primary" block onClick={() => act(dismiss(p.uid))}>Continue</Btn>
      </Modal>
    );
  }
  const ctx = buildCtx(s, p);
  const subject = ctx.subject;
  return (
    <Modal title={def.title} icon={def.icon}>
      <div className="row top" style={{ gap: 14 }}>
        {subject && <Face c={subject} size={96} />}
        <p style={{ fontSize: '1rem' }}>{def.text(ctx)}</p>
      </div>
      <div className="stack" style={{ marginTop: 12, gap: 8 }}>
        {def.choices.map((c, i) => {
          if (c.show && !c.show(ctx)) return null;
          const ok = !c.available || c.available(ctx);
          return (
            <button key={i} className={`btn choice ${i === 0 ? 'primary' : ''}`} disabled={!ok} onClick={() => act((d) => resolveEvent(d, p.uid, i))}>
              <span>{c.label}</span>
              {c.hint && <span className="hint">{c.hint}{!ok ? ' (cannot afford)' : ''}</span>}
            </button>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 10 }}>
        Year {s.year} · {s.pending.length > 1 ? `${s.pending.length - 1} more waiting` : 'last one this cycle'}
      </div>
    </Modal>
  );
}

function NoticeView({ p }: { p: Extract<Pending, { kind: 'notice' }> }) {
  const { s, act } = useGame();
  const who = ch(s, p.portraitId);
  return (
    <Modal title={p.title} icon={p.icon ?? 'info'} onClose={() => act(dismiss(p.uid))}>
      <div className="row top" style={{ gap: 14 }}>
        {who && <Face c={who} size={96} />}
        <p style={{ fontSize: '1rem' }} className={p.tone === 'bad' ? 'bad' : undefined}>
          {p.text}
        </p>
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn kind="primary" block onClick={() => act(dismiss(p.uid))}>
          Continue
        </Btn>
      </div>
    </Modal>
  );
}

function Fleet({ n, color, flip, seed }: { n: number; color: string; flip?: boolean; seed: number }) {
  const count = Math.max(1, Math.min(6, Math.ceil(n / 20)));
  return (
    <div className="fleet-row">
      {Array.from({ length: count }, (_, i) => (
        <Ship key={i} seed={seed + i * 7} color={color} size={i === 0 ? 90 : 58} flip={flip} />
      ))}
    </div>
  );
}

function BattleView({ p }: { p: { uid: string; report: BattleReport } }) {
  const { s, act } = useGame();
  const r = p.report;
  const enemy = s.clans[r.enemy];
  const me = s.clans[s.playerClanId];
  return (
    <Modal title={r.won ? 'Victory in Battle' : 'Defeat in Battle'} icon={r.won ? 'win' : 'lose'} onClose={() => act(dismiss(p.uid))}>
      <div className="battle">
        <div className="side">
          <Fleet n={r.playerShips} color={me.color} seed={7} />
          <b>House {me.name}</b>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {r.playerShips} ships · strength {r.playerStrength}
          </div>
          <div className="bad">-{r.playerLosses} ships</div>
        </div>
        <div className="vs">VS</div>
        <div className="side">
          <Fleet n={r.enemyShips} color={enemy?.color ?? '#888'} seed={99} flip />
          <b>House {enemy?.name}</b>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {r.enemyShips} ships · strength {r.enemyStrength}
          </div>
          <div className="bad">-{r.enemyLosses} ships</div>
        </div>
      </div>
      <p className={r.won ? 'good' : 'bad'} style={{ textAlign: 'center', fontWeight: 700 }}>
        {r.won ? 'The enemy line breaks!' : 'Your fleet is driven back.'} War score {r.scoreChange > 0 ? '+' : ''}
        {r.scoreChange} → {r.newScore}
      </p>
      <WarBar score={r.newScore} />
      {r.personal && <p className="muted" style={{ marginTop: 8 }}>You led the fleet in person.</p>}
      {r.note && <p className="gold">{r.note}</p>}
      <div style={{ marginTop: 12 }}>
        <Btn kind="primary" block onClick={() => act(dismiss(p.uid))}>
          Continue
        </Btn>
      </div>
    </Modal>
  );
}

function SuccessionView({ p }: { p: Extract<Pending, { kind: 'succession' }> }) {
  const { s, act } = useGame();
  const dead = s.characters[p.deadId];
  const heir = s.characters[p.heirId];
  if (!heir) {
    return (
      <Modal title="Succession" onClose={() => act(dismiss(p.uid))}>
        <Btn kind="primary" block onClick={() => act(dismiss(p.uid))}>Continue</Btn>
      </Modal>
    );
  }
  const locked = heir.traits.filter((t) => s.dynasty.locked.includes(t));
  return (
    <Modal title="The Ruler is Dead. Long Live the Ruler!" icon="crown">
      <div className="row" style={{ justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
        {dead && (
          <div style={{ textAlign: 'center' }}>
            <Face c={dead} size={110} />
            <div className="muted">{dead.name}</div>
            <div className="dim" style={{ fontSize: '0.78rem' }}>
              {dead.born}–{dead.died} · {dead.deathCause}
            </div>
          </div>
        )}
        <Icon name="arrow" size={28} />
        <div style={{ textAlign: 'center' }}>
          <Face c={heir} size={130} />
          <div className="gold" style={{ fontWeight: 700 }}>{fullName(s, heir)}</div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {clanTitle(s, s.playerClanId, heir.gender)} · age {ageOf(s, heir)}
          </div>
        </div>
      </div>
      <p style={{ marginTop: 12 }}>
        You now play as <b>{heir.name}</b>. Titles, treasury, wars and claims all pass to them. Vassals are wary of a new ruler.
        {ageOf(s, heir) < 16 && <span className="bad"> {heir.name} is a minor: a regency council rules until they turn 16 (no wars, schemes or activities).</span>}
      </p>
      {locked.length > 0 && <p className="gold">Bloodline traits carried on: {locked.map((t) => TRAITS[t]?.name).join(', ')}.</p>}
      <TraitList c={heir} s={s} />
      <div style={{ marginTop: 14 }}>
        <Btn kind="primary" block onClick={() => act(dismiss(p.uid))}>
          Take the throne
        </Btn>
      </div>
    </Modal>
  );
}

function feel(p: Pending): void {
  if (p.kind === 'battle') haptic(p.report.won ? 'success' : 'error');
  else if (p.kind === 'succession') haptic('heavy');
  else if (p.kind === 'notice') haptic(p.tone === 'bad' ? 'warning' : p.tone === 'good' ? 'success' : 'light');
  else haptic('light');
}

export function PendingModal() {
  const { s } = useGame();
  const p = s.pending[0];
  const uid = p?.uid;
  useEffect(() => {
    if (p) feel(p);
    // Only when a new item reaches the front of the queue.
  }, [uid]);
  if (!p) return null;
  switch (p.kind) {
    case 'event':
      return <EventView key={p.uid} p={p} />;
    case 'notice':
      return <NoticeView key={p.uid} p={p} />;
    case 'battle':
      return <BattleView key={p.uid} p={p} />;
    case 'succession':
      return <SuccessionView key={p.uid} p={p} />;
  }
}
