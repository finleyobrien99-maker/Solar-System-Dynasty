import { useState } from 'react';
import { dynastyMembers, isVip } from '../../game/core';
import {
  bloodlineScore,
  buySlot,
  canAfford,
  carriers,
  lockBlocker,
  lockPrice,
  lockTrait,
  MAX_SLOTS,
  purgeBlocker,
  purgePrice,
  purgeTrait,
  releaseTrait,
  slotCost,
  vaultUsed,
} from '../../game/genetics';
import { GENETIC, PERSONALITY, traitEffectText, type TraitDef } from '../../game/traits';
import { Icon } from '../../svg/Icons';
import { Btn, CostTag, InfoDot, Section, TraitChip } from '../components';
import { useGame } from '../store';
import { ForgeSection } from '../sections/ForgeSection';

type Filter = 'carried' | 'genetic' | 'personality' | 'vault';

const GROUP_NAMES: Record<string, string> = {
  intellect: 'Intellect',
  physique: 'Physique',
  beauty: 'Beauty',
  stature: 'Stature',
  constitution: 'Constitution',
  longevity: 'Longevity',
  fertility: 'Fertility',
  psionic: 'Psionics',
};

function GeneLadders() {
  const { s } = useGame();
  const members = dynastyMembers(s);
  const groups = Object.keys(GROUP_NAMES);
  return (
    <div className="grid tight">
      {groups.map((g) => {
        const tiers = GENETIC.filter((t) => t.group === g).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
        return (
          <div key={g} className="card flat" style={{ padding: 10 }}>
            <h4 style={{ marginBottom: 6 }}>{GROUP_NAMES[g]}</h4>
            <div className="traits">
              {tiers.map((t) => {
                const n = members.filter((m) => m.traits.includes(t.id)).length;
                return (
                  <span key={t.id} className="row" style={{ gap: 3, opacity: n || s.dynasty.locked.includes(t.id) ? 1 : 0.4 }}>
                    <TraitChip id={t.id} s={s} />
                    {n > 0 && <span className="muted" style={{ fontSize: '0.72rem' }}>×{n}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TraitRow({ t }: { t: TraitDef }) {
  const { s, act, toast } = useGame();
  const locked = s.dynasty.locked.includes(t.id);
  const purged = s.dynasty.purged.includes(t.id);
  const who = carriers(s, t.id);
  const lb = lockBlocker(s, t.id);
  const pb = purgeBlocker(s, t.id);
  return (
    <div className={`card flat ${locked ? 'hl' : ''}`} style={{ padding: 10 }}>
      <div className="spread">
        <TraitChip id={t.id} s={s} />
        <span className="muted" style={{ fontSize: '0.75rem' }}>
          {who.length ? `${who.length} carrier${who.length > 1 ? 's' : ''}` : 'no carriers'}
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', margin: '6px 0', color: '#a8e6c1' }}>{traitEffectText(t)}</div>
      {who.length > 0 && (
        <div className="dim" style={{ fontSize: '0.74rem', marginBottom: 6 }}>
          {who
            .slice(0, 4)
            .map((c) => c.name)
            .join(', ')}
          {who.length > 4 ? ` +${who.length - 4}` : ''}
        </div>
      )}
      {locked || purged ? (
        <div className="spread">
          <span className={`pill ${locked ? 'gold' : 'red'}`}>
            <Icon name={locked ? 'lock' : 'purge'} size={12} /> {locked ? 'Locked in' : 'Purged'}
          </span>
          <Btn small kind="ghost" onClick={() => act((d) => releaseTrait(d, t.id))} title="Frees the vault slot. Costs are not refunded.">
            Release
          </Btn>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <div className="spread">
            <Btn small kind="good" icon="lock" reason={lb} onClick={() => act((d) => lockTrait(d, t.id)) && toast(`${t.name} locked into the bloodline.`)}>
              Lock in
            </Btn>
            <CostTag cost={lockPrice(s, t.id)} />
          </div>
          <div className="spread">
            <Btn small kind="danger" icon="purge" reason={pb} onClick={() => act((d) => purgeTrait(d, t.id)) && toast(`${t.name} purged from the bloodline.`)}>
              Purge
            </Btn>
            <CostTag cost={purgePrice(s, t.id)} />
          </div>
          {lb && who.length > 0 && <span className="reason">Lock: {lb}</span>}
          {lb && !who.length && <span className="reason">Lock: needs a living carrier in your dynasty.</span>}
        </div>
      )}
    </div>
  );
}

export function BloodlineTab() {
  const { s, act } = useGame();
  const [filter, setFilter] = useState<Filter>('carried');
  const { score, grade } = bloodlineScore(s);
  const used = vaultUsed(s);
  const members = dynastyMembers(s);
  const present = new Set(members.flatMap((m) => m.traits));
  const heritable = [...GENETIC, ...PERSONALITY];
  const list = heritable.filter((t) => {
    if (filter === 'carried') return present.has(t.id) || s.dynasty.locked.includes(t.id) || s.dynasty.purged.includes(t.id);
    if (filter === 'genetic') return t.cat === 'genetic';
    if (filter === 'personality') return t.cat === 'personality';
    return s.dynasty.locked.includes(t.id) || s.dynasty.purged.includes(t.id);
  });
  const sc = slotCost(s);

  return (
    <div>
      <div className="card hl section">
        <div className="row top wrap" style={{ gap: 18 }}>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontFamily: 'var(--head)', fontSize: '3rem', color: 'var(--gold)', lineHeight: 1 }}>{grade}</div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>
              Bloodline grade
              <InfoDot text="Average genetic tier across your living dynasty, plus a bonus for every good gene locked in. Climb from F to S by breeding, locking and purging." />
            </div>
            <div className="dim" style={{ fontSize: '0.75rem' }}>score {score}</div>
          </div>
          <div className="grow stack" style={{ gap: 8 }}>
            <h2 style={{ margin: 0 }}>
              <Icon name="dna" size={18} /> The Gene Vault
            </h2>
            <div className="muted" style={{ fontSize: '0.88rem' }}>
              Lock a trait and <b className="gold">every child born into your dynasty will have it</b>, forever, across every heir and descendant. Purge a trait and no dynasty child will
              ever inherit it. Genetic locks are sequenced from a living carrier, so breed for a gene first, then lock it. Personality locks are drilled in through
              conditioning, which also reshapes your kids under 16 right away.
            </div>
            {isVip(s) ? (
              <div className="spread">
                <span>
                  Vault slots: <b className="gold">{used}</b> / ∞
                </span>
                <span className="pill gold">VIP: unlimited, free, no carrier needed</span>
              </div>
            ) : (
              <>
                <div className="spread">
                  <span>
                    Vault slots: <b className="gold">{used}</b> / {s.dynasty.slots}
                    <span className="muted"> (each lock or purge uses one)</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <Btn small icon="plus" reason={s.dynasty.slots >= MAX_SLOTS ? 'Vault is at maximum size' : canAfford(s, sc) ? null : 'Not enough resources'} onClick={() => act((d) => buySlot(d))}>
                      Add slot
                    </Btn>
                    <CostTag cost={sc} />
                  </span>
                </div>
                <div className="bar">
                  <span style={{ width: `${(used / Math.max(1, s.dynasty.slots)) * 100}%`, background: 'linear-gradient(90deg, #b388ff, #4cc9f0)' }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Section title="How genes pass on" icon="info">
        <div className="card flat muted" style={{ fontSize: '0.86rem' }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>One parent carries a gene: <b>40%</b> chance the child gets it. Both parents carry the same gene: <b>75%</b>.</li>
            <li>Both parents share a tier (e.g. Brilliant + Brilliant): <b>12%</b> chance the child climbs a rung (Genius).</li>
            <li>Every birth has a <b>5%</b> chance of a random mutation. Rare genes like Psionic Ascendant and Ageless mostly appear this way.</li>
            <li>Personality traits pass on by upbringing (<b>15%</b> each), the rest form at 16, shaped by education.</li>
            <li>Locked traits override all of this for dynasty-born children. Spouses from other houses are not affected, so pick their genes carefully.</li>
          </ul>
        </div>
      </Section>

      <Section title="Gene ladders" icon="dna" info="Each ladder is one gene group. Only one tier from a group can be carried at a time. Numbers show how many living dynasty members carry it.">
        <GeneLadders />
      </Section>

      <ForgeSection />

      <Section title="Traits" icon="lock">
        <div className="tabs">
          {(
            [
              ['carried', 'In your bloodline'],
              ['genetic', 'All genetic'],
              ['personality', 'All personality'],
              ['vault', 'Locked & purged'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid tight">
          {list.map((t) => (
            <TraitRow key={t.id} t={t} />
          ))}
          {!list.length && <div className="empty">Nothing here yet.</div>}
        </div>
      </Section>
    </div>
  );
}
