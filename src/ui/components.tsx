// Shared building blocks. Tooltips are everywhere on purpose: every number,
// trait and button explains itself.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ageOf, alive, charTitle, clanRank, effStats, fullName, maxHealth, relationTo } from '../game/core';
import { costText, type Cost } from '../game/genetics';
import { healthLabel } from '../game/life';
import { STAT_HELP, STAT_NAMES, TRAITS, traitEffectText } from '../game/traits';
import { STAT_KEYS, type Character, type GameState } from '../game/types';
import { Icon } from '../svg/Icons';
import { Portrait } from '../svg/Portrait';
import { Sigil } from '../svg/Sigil';
import { useGame } from './store';

// ── Tooltip ───────────────────────────────────────────────────────────────

export function Tip({ text, children, className }: { text: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = tip.current?.offsetWidth ?? 240;
    const h = tip.current?.offsetHeight ?? 60;
    const below = r.top < h + 16;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
    const top = below ? r.bottom + 8 : r.top - h - 8;
    setPos({ left, top, below });
  }, [open]);

  return (
    <span
      ref={anchor}
      className={`tip-anchor ${className ?? ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      tabIndex={0}
    >
      {children}
      {open &&
        createPortal(
          <div ref={tip} className="tip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}

export function InfoDot({ text }: { text: ReactNode }) {
  return (
    <Tip text={text} className="info-dot">
      <Icon name="info" size={15} />
    </Tip>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────

export function Btn({
  children,
  onClick,
  disabled,
  reason,
  kind,
  small,
  block,
  icon,
  showReason,
  title,
  confirm,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  reason?: string | null;
  kind?: 'primary' | 'danger' | 'good' | 'ghost';
  small?: boolean;
  block?: boolean;
  icon?: string;
  showReason?: boolean;
  title?: string;
  /** Ask for a second tap before running onClick (browser confirm dialogs are unreliable). */
  confirm?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  const isDisabled = disabled || !!reason;
  const handle = () => {
    if (confirm && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onClick?.();
  };
  return (
    <span style={block ? { display: 'block', width: '100%' } : { display: 'inline-block' }}>
      <button
        type="button"
        className={`btn ${kind ?? ''} ${small ? 'small' : ''} ${block ? 'block' : ''}`}
        disabled={isDisabled}
        onClick={handle}
        title={reason ?? title}
        aria-live={confirm ? 'polite' : undefined}
      >
        {icon && <Icon name={icon} size={small ? 14 : 16} />}
        {armed ? confirm : children}
      </button>
      {showReason && reason && <span className="reason">{reason}</span>}
    </span>
  );
}

export function CostTag({ cost }: { cost: Cost }) {
  const parts: ReactNode[] = [];
  if (cost.credits) parts.push(<span key="c" className="pill gold"><Icon name="credits" size={12} />{cost.credits}</span>);
  if (cost.prestige) parts.push(<span key="p" className="pill" style={{ color: '#ffb4f0' }}><Icon name="prestige" size={12} />{cost.prestige}</span>);
  if (cost.faith) parts.push(<span key="f" className="pill" style={{ color: '#ffb36b' }}><Icon name="faith" size={12} />{cost.faith}</span>);
  if (!parts.length) parts.push(<span key="free" className="pill green">free</span>);
  return <span className="row wrap" style={{ gap: 4 }}>{parts}</span>;
}

export { costText };

// ── Modal ─────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide, icon }: { title: ReactNode; onClose?: () => void; children: ReactNode; wide?: boolean; icon?: string }) {
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="row">
            {icon && (
              <div className="event-icon" style={{ width: 40, height: 40 }}>
                <Icon name={icon} size={22} />
              </div>
            )}
            <h2>{title}</h2>
          </div>
          {onClose && (
            <button className="close-x" onClick={onClose} aria-label="Close">
              <Icon name="close" size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Traits ────────────────────────────────────────────────────────────────

const CAT_HELP: Record<string, string> = {
  genetic: 'Genetic: in the blood. Passed to children by chance. Can be LOCKED in the Gene Vault so every dynasty child gets it.',
  personality: 'Personality: who they are. Sometimes passed on by upbringing. Can be locked via conditioning in the Gene Vault.',
  education: 'Education: earned at 16 from their schooling. Never inherited.',
  acquired: 'Acquired: picked up during life. Never inherited.',
  cyber: 'Cybernetic: an implant. Never inherited.',
};

export function TraitChip({ id, s }: { id: string; s?: GameState }) {
  const t = TRAITS[id];
  if (!t) return null;
  const locked = s?.dynasty.locked.includes(id);
  const purged = s?.dynasty.purged.includes(id);
  const tone = t.good === true ? 'good-t' : t.good === false ? 'bad' : '';
  return (
    <Tip
      text={
        <div>
          <b>{t.name}</b>
          <div>{t.desc}</div>
          <div style={{ marginTop: 4, color: '#9fe6b8' }}>{traitEffectText(t)}</div>
          <div style={{ marginTop: 4, color: '#9aa6c8', fontSize: '0.76rem' }}>{CAT_HELP[t.cat]}</div>
          {locked && <div className="gold">Locked in your bloodline: every dynasty child is born with it.</div>}
          {purged && <div className="bad">Purged from your bloodline: dynasty children will never inherit it.</div>}
        </div>
      }
    >
      <span className={`trait ${t.cat} ${tone}`}>
        {locked && (
          <span className="lockmark">
            <Icon name="lock" size={11} />
          </span>
        )}
        {purged && (
          <span className="purgemark">
            <Icon name="purge" size={11} />
          </span>
        )}
        {t.name}
      </span>
    </Tip>
  );
}

const CAT_ORDER = ['genetic', 'personality', 'education', 'cyber', 'acquired'];

export function TraitList({ c, s, max }: { c: Character; s?: GameState; max?: number }) {
  const sorted = c.traits.slice().sort((a, b) => CAT_ORDER.indexOf(TRAITS[a]?.cat ?? '') - CAT_ORDER.indexOf(TRAITS[b]?.cat ?? ''));
  const shown = max ? sorted.slice(0, max) : sorted;
  return (
    <div className="traits">
      {shown.map((t) => (
        <TraitChip key={t} id={t} s={s} />
      ))}
      {max && sorted.length > max && <span className="pill">+{sorted.length - max}</span>}
      {!sorted.length && <span className="dim">No traits</span>}
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────

const STAT_ICON: Record<string, string> = { dip: 'dip', cmd: 'cmd', eco: 'eco', int: 'int', sci: 'sci' };

export function StatBlock({ s, c }: { s: GameState; c: Character }) {
  const st = effStats(s, c);
  return (
    <div className="stats">
      {STAT_KEYS.map((k) => (
        <Tip key={k} text={<><b>{STAT_NAMES[k]}: {st[k]}</b><div>{STAT_HELP[k]}</div><div className="muted">Base {c.base[k]}, the rest comes from traits{c.id === s.rulerId ? ', items and your homeworld' : ''}.</div></>}>
          <div className="stat" style={{ width: '100%' }}>
            <div className="v">{st[k]}</div>
            <div className="k">
              <Icon name={STAT_ICON[k]} size={11} />
              {k}
            </div>
          </div>
        </Tip>
      ))}
    </div>
  );
}

export function HealthBar({ s, c }: { s: GameState; c: Character }) {
  const mh = maxHealth(s, c);
  const pct = Math.max(0, Math.min(100, (c.health / 100) * 100));
  const cls = c.health < 30 ? 'danger' : c.health < 60 ? 'warn' : '';
  return (
    <Tip text={<><b>Health {Math.round(c.health)}</b> ({healthLabel(c.health)})<div>Health drifts toward a maximum of {mh}, which falls with age. Below 30 the risk of death climbs fast. Rest, gene therapy, Robust genes and Nano-Immune implants all help.</div></>}>
      <div style={{ width: '100%' }}>
        <div className="spread" style={{ fontSize: '0.75rem' }}>
          <span className="muted row" style={{ gap: 4 }}><Icon name="health" size={12} /> Health</span>
          <span>{healthLabel(c.health)}</span>
        </div>
        <div className={`bar ${cls}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Tip>
  );
}

// ── Characters ────────────────────────────────────────────────────────────

export function charRank(s: GameState, c: Character): number {
  const clan = s.clans[c.clanId];
  return clan && clan.headId === c.id && alive(c) ? clanRank(s, clan.id) : 0;
}

export function Face({ c, size = 56 }: { c: Character; size?: number }) {
  const { s } = useGame();
  const clan = s.clans[c.clanId];
  return <Portrait c={c} year={s.year} rank={charRank(s, c)} clanColor={clan?.color} trim={clan?.sigil.c2} size={size} />;
}

export function CharCard({ c, sub, size = 56, extra, traitsMax = 4 }: { c: Character; sub?: ReactNode; size?: number; extra?: ReactNode; traitsMax?: number }) {
  const { s, openChar } = useGame();
  const rel = relationTo(s, c);
  const title = charTitle(s, c);
  return (
    <div className={`char ${alive(c) ? '' : 'dead'}`} onClick={() => openChar(c.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openChar(c.id)}>
      <Face c={c} size={size} />
      <div className="meta">
        <div className="nm">
          {fullName(s, c)}
          {c.bastard && <span className="pill red" style={{ marginLeft: 6 }}>Bastard</span>}
        </div>
        <div className="sub">
          {sub ?? [rel, title, alive(c) ? `age ${ageOf(s, c)}` : `died ${c.died} (${c.deathCause})`].filter(Boolean).join(' · ')}
        </div>
        {traitsMax > 0 && (
          <div style={{ marginTop: 4 }}>
            <TraitList c={c} s={s} max={traitsMax} />
          </div>
        )}
        {extra}
      </div>
    </div>
  );
}

export function ClanBadge({ clanId, size = 26 }: { clanId: string; size?: number }) {
  const { s, openClan } = useGame();
  const clan = s.clans[clanId];
  if (!clan) return null;
  return (
    <button className="row" style={{ background: 'none', border: 0, padding: 0, gap: 6 }} onClick={() => openClan(clanId)}>
      <Sigil spec={clan.sigil} size={size} />
      <span style={{ fontWeight: 700 }}>House {clan.name}</span>
    </button>
  );
}

export function Opinion({ v }: { v: number }) {
  const cls = v >= 30 ? 'green' : v <= -30 ? 'red' : '';
  return (
    <Tip text="Opinion of you, from -100 (hatred) to 100 (devotion). It drifts toward a baseline set by your Diplomacy, faith, prestige, traits, marriages and wars. Below -40 vassals may revolt; below -25 strong neighbours may attack.">
      <span className={`pill ${cls}`}>
        <Icon name="heart" size={11} /> {v > 0 ? '+' : ''}
        {Math.round(v)}
      </span>
    </Tip>
  );
}

export function WarBar({ score }: { score: number }) {
  const left = score >= 0 ? 50 : 50 + score / 2;
  const width = Math.abs(score) / 2;
  return (
    <div className="warbar">
      <div className="fill" style={{ left: `${left}%`, width: `${width}%`, background: score >= 0 ? 'var(--green)' : 'var(--red)' }} />
      <div className="mid" />
    </div>
  );
}

export function Section({ title, icon, info, children, right }: { title: ReactNode; icon?: string; info?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>
          {icon && <Icon name={icon} size={18} />}
          {title}
          {info && <InfoDot text={info} />}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}
