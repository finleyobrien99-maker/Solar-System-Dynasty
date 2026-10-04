// Shared building blocks. Tooltips are everywhere on purpose: every number,
// trait and button explains itself.

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ageOf, alive, charTitle, clanRank, effStats, fullName, maxHealth, relationTo } from '../game/core';
import { costText, type Cost } from '../game/genetics';
import { healthLabel } from '../game/life';
import { STAT_HELP, STAT_NAMES, TRAITS, traitEffectText } from '../game/traits';
import { STAT_KEYS, type Character, type GameState } from '../game/types';
import { haptic } from '../native';
import { Icon } from '../svg/Icons';
import { Portrait } from '../svg/Portrait';
import { Sigil } from '../svg/Sigil';
import { useGame } from './store';
import { CategoryMark, CATEGORY_LABELS } from './traitCategories';
import { lockDialogBackground } from './dialogBackground';

// ── Tooltip ───────────────────────────────────────────────────────────────

export function Tip({ text, children, className, label }: { text: ReactNode; children: ReactNode; className?: string; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  // A tap fires emulated hover and focus before the click, which would open
  // the tip and then toggle it straight shut. Touch only listens to the tap.
  const touch = useRef(false);

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

  // Tapping anywhere else closes it (iOS doesn't always focus, so blur alone can miss).
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <span
      ref={anchor}
      className={`tip-anchor ${className ?? ''}`}
      onPointerDown={(e) => {
        touch.current = e.pointerType !== 'mouse';
      }}
      onMouseEnter={() => !touch.current && setOpen(true)}
      onMouseLeave={() => !touch.current && setOpen(false)}
      onFocus={() => !touch.current && setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      role="button"
      aria-label={label}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }
      }}
      tabIndex={0}
    >
      {children}
      {open &&
        createPortal(
          <div ref={tip} id={id} className="tip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}

export function InfoDot({ text }: { text: ReactNode }) {
  return (
    <Tip text={text} className="info-dot" label="More information">
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
  const confirmId = useId();
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
    haptic('light');
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
        aria-describedby={confirm ? confirmId : undefined}
        onBlur={() => setArmed(false)}
      >
        {icon && <Icon name={icon} size={small ? 14 : 16} />}
        {armed ? confirm : children}
      </button>
      {confirm && (
        <span id={confirmId} className="sr-only" role="status">
          {armed ? confirm : 'Requires a second press to confirm.'}
        </span>
      )}
      {showReason && reason && <span className="reason">{reason}</span>}
    </span>
  );
}

export function CostTag({ cost }: { cost: Cost }) {
  const parts: ReactNode[] = [];
  if (cost.credits)
    parts.push(
      <span key="c" className="pill gold">
        <Icon name="credits" size={12} />
        {cost.credits}
      </span>,
    );
  if (cost.prestige)
    parts.push(
      <span key="p" className="pill" style={{ color: 'var(--prestige)' }}>
        <Icon name="prestige" size={12} />
        {cost.prestige}
      </span>,
    );
  if (cost.faith)
    parts.push(
      <span key="f" className="pill" style={{ color: 'var(--faith)' }}>
        <Icon name="faith" size={12} />
        {cost.faith}
      </span>,
    );
  if (!parts.length)
    parts.push(
      <span key="free" className="pill green">
        free
      </span>,
    );
  return (
    <span className="row wrap" style={{ gap: 'var(--space-4px)' }}>
      {parts}
    </span>
  );
}

export { costText };

// ── Modal ─────────────────────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
  wide,
  icon,
}: {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  icon?: string;
}) {
  const titleId = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const root = overlay.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    const top = () => [...document.querySelectorAll('.overlay')].filter((el) => !el.closest('[hidden]')).at(-1) === root;
    const focusable = () =>
      [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.closest('[hidden]') && !el.closest('details:not([open]) > :not(summary)') && el.getClientRects().length > 0);
    const focusFirst = () => (focusable()[0] ?? root).focus();
    const unlock = lockDialogBackground(root);
    if (top()) focusFirst();
    const onKey = (event: KeyboardEvent) => {
      if (!top()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (document.querySelector('.tip')) document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        else close.current?.();
      }
      if (event.key === 'Tab') {
        const controls = focusable();
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          root.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (top() && !root.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      unlock();
      if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
    };
  }, []);
  return (
    <div ref={overlay} tabIndex={-1} className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="row">
            {icon && (
              <div className="event-icon" style={{ width: 40, height: 40 }}>
                <Icon name={icon} size={22} />
              </div>
            )}
            <h2 id={titleId}>{title}</h2>
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
      label={t.name + ', ' + CATEGORY_LABELS[t.cat] + (locked ? ', locked' : '') + (purged ? ', purged' : '')}
      text={
        <div>
          <b>{t.name}</b>
          <div>{t.desc}</div>
          <div style={{ marginTop: 'var(--space-4px)', color: '#9fe6b8' }}>{traitEffectText(t)}</div>
          <div style={{ marginTop: 'var(--space-4px)', color: '#9aa6c8', fontSize: 'var(--font-size-0_76rem)' }}>{CAT_HELP[t.cat]}</div>
          {locked && <div className="gold">Locked in your bloodline: every dynasty child is born with it.</div>}
          {purged && <div className="bad">Purged from your bloodline: dynasty children will never inherit it.</div>}
        </div>
      }
    >
      <span className={`trait ${t.cat} ${tone}`}>
        <CategoryMark cat={t.cat} />
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

const CAT_ORDER = ['genetic', 'personality', 'education', 'cyber', 'acquired'] as const;
const fixedDesktop = () => false;
const noLayoutWatch = () => () => {};
const phoneLayout = () => window.matchMedia('(max-width: 560px)').matches;
function watchPhoneLayout(listener: () => void) {
  const media = window.matchMedia('(max-width: 560px)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

export function TraitList({ c, s, max, collapseOnPhone }: { c: Character; s?: GameState; max?: number; collapseOnPhone?: boolean }) {
  const compact = useSyncExternalStore(collapseOnPhone ? watchPhoneLayout : noLayoutWatch, collapseOnPhone ? phoneLayout : fixedDesktop);
  const sorted = c.traits.slice().sort((a, b) => CAT_ORDER.findIndex((cat) => cat === TRAITS[a]?.cat) - CAT_ORDER.findIndex((cat) => cat === TRAITS[b]?.cat));
  if (collapseOnPhone && compact && sorted.length > 8) {
    return (
      <div className="trait-groups">
        {CAT_ORDER.map((cat) => {
          const traits = sorted.filter((id) => TRAITS[id]?.cat === cat);
          if (!traits.length) return null;
          return (
            <details key={cat}>
              <summary>
                {CATEGORY_LABELS[cat]} <span className="muted">({traits.length})</span>
              </summary>
              <div className="traits">
                {traits.map((id) => (
                  <TraitChip key={id} id={id} s={s} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    );
  }
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
        <Tip
          key={k}
          text={
            <>
              <b>
                {STAT_NAMES[k]}: {st[k]}
              </b>
              <div>{STAT_HELP[k]}</div>
              <div className="muted">
                Base {c.base[k]}, the rest comes from traits{c.id === s.rulerId ? ', items and your homeworld' : ''}.
              </div>
            </>
          }
        >
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
    <Tip
      text={
        <>
          <b>Health {Math.round(c.health)}</b> ({healthLabel(c.health)})
          <div>
            Health drifts toward a maximum of {mh}, which falls with age. Below 30 the risk of death climbs fast. Rest, gene therapy, Robust genes and
            Nano-Immune implants all help.
          </div>
        </>
      }
    >
      <div style={{ width: '100%' }}>
        <div className="spread" style={{ fontSize: 'var(--font-size-0_75rem)' }}>
          <span className="muted row" style={{ gap: 'var(--space-4px)' }}>
            <Icon name="health" size={12} /> Health
          </span>
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
    <div
      className={`char ${alive(c) ? '' : 'dead'}`}
      onClick={() => openChar(c.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openChar(c.id);
        }
      }}
    >
      <Face c={c} size={size} />
      <div className="meta">
        <div className="nm">
          {fullName(s, c)}
          {c.bastard && (
            <span className="pill red" style={{ marginLeft: 'var(--space-6px)' }}>
              Bastard
            </span>
          )}
        </div>
        <div className="sub">{sub ?? [rel, title, alive(c) ? `age ${ageOf(s, c)}` : `died ${c.died} (${c.deathCause})`].filter(Boolean).join(' · ')}</div>
        {traitsMax > 0 && (
          <div style={{ marginTop: 'var(--space-4px)' }}>
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
    <button className="row" style={{ background: 'none', border: 0, padding: 0, gap: 'var(--space-6px)' }} onClick={() => openClan(clanId)}>
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
      <div className="spread" style={{ marginBottom: 'var(--space-8px)' }}>
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
