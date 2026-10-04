import { useState } from 'react';
import { ageOf, alive, ch, charTitle, clanRank, fullName, lifespan, playerClan, ruler } from '../../game/core';
import { currentHeir, regencyActive } from '../../game/life';
import { FAITHS, PLANET_BY_ID } from '../../game/planets';
import type { LogKind } from '../../game/types';
import { Icon } from '../../svg/Icons';
import { Sigil } from '../../svg/Sigil';
import { CharCard, Face, HealthBar, InfoDot, Section, StatBlock, TraitList } from '../components';
import { useGame } from '../store';

const FILTERS: { id: 'all' | LogKind | 'mine'; label: string }[] = [
  { id: 'mine', label: 'My life' },
  { id: 'all', label: 'Everything' },
  { id: 'news', label: 'System news' },
  { id: 'war', label: 'War' },
];

export function LifeTab() {
  const { s, openChar, setUi } = useGame();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('mine');
  const r = ruler(s);
  const clan = playerClan(s);
  const spouse = ch(s, r.spouseId);
  const heir = currentHeir(s);
  const lover = ch(s, r.loverId);
  const planet = PLANET_BY_ID[clan.planetId];
  const entries = s.log
    .filter((e) => (filter === 'all' ? true : filter === 'mine' ? e.k !== 'news' : e.k === filter))
    .slice(-150)
    .reverse();

  return (
    <div>
      <div className="card hl section">
        <div className="hero">
          <div onClick={() => openChar(r.id)} style={{ cursor: 'pointer' }}>
            <Face c={r} size={150} />
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <div className="nm">{fullName(s, r)}</div>
              <div className="gold">{charTitle(s, r)}</div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                Age {ageOf(s, r)} · {planet.adjective} · {FAITHS[r.faithId]?.name}
                <InfoDot
                  text={`Expected lifespan around ${lifespan(r)} years, shifted by genes and implants. Health and illness matter more than age alone.`}
                />
              </div>
              {regencyActive(s) && (
                <div className="pill red" style={{ marginTop: 4 }}>
                  Regency until age 16: war, schemes and activities are locked
                </div>
              )}
            </div>
            <HealthBar s={s} c={r} />
            <StatBlock s={s} c={r} />
            <TraitList c={r} s={s} />
          </div>
        </div>
      </div>

      <div className="cols section">
        <div className="stack">
          <div className="card">
            <div className="spread">
              <h3 style={{ margin: 0 }}>Your house</h3>
              <button className="btn small ghost" onClick={() => setUi({ panel: 'tree' })}>
                <Icon name="family" size={14} /> Family tree
              </button>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <Sigil spec={clan.sigil} size={46} />
              <div>
                <div style={{ fontWeight: 700 }}>House {clan.name}</div>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {planet.faction} · {['Landless', 'Governors', 'Viceroys', 'Sovereigns', 'Emperors'][clanRank(s, clan.id)]} · {s.dynasty.rulers.length} rulers
                  so far
                </div>
              </div>
            </div>
          </div>
          {spouse && alive(spouse) ? (
            <CharCard c={spouse} />
          ) : (
            <div className="card flat">
              <div className="spread">
                <span className="muted">You are unmarried.</span>
                <button className="btn small primary" onClick={() => setUi({ tab: 'family' })}>
                  <Icon name="heart" size={14} /> Find a spouse
                </button>
              </div>
            </div>
          )}
          {heir ? <CharCard c={heir} sub={`Heir · age ${ageOf(s, heir)}`} /> : <div className="card flat bad">No heir! If you die now, your dynasty ends.</div>}
          {lover && alive(lover) && <CharCard c={lover} sub={`Lover · House ${s.clans[lover.clanId]?.name}`} traitsMax={2} />}
        </div>
        <div className="card">
          <div className="spread">
            <h3 style={{ margin: 0 }}>Chronicle</h3>
            <div className="tabs" style={{ margin: 0 }}>
              {FILTERS.map((f) => (
                <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="log" style={{ marginTop: 8 }}>
            {entries.map((e, i) => (
              <div key={i} className={`entry k-${e.k}`}>
                <span className="y">{e.y}</span>
                <span>{e.t}</span>
              </div>
            ))}
            {!entries.length && <div className="empty">Nothing yet.</div>}
          </div>
        </div>
      </div>
      <Section title="Getting started" icon="info">
        <div className="card flat muted" style={{ fontSize: '0.88rem' }}>
          Press <b className="gold">Age Up</b> to live through a cycle (one year). Between cycles you can marry and raise heirs (Family), forge a perfect
          bloodline (Bloodline), manage your fleet, wars and lands (Realm), scheme against rivals across the planets (System and Actions), and kit yourself out
          with relics (Treasury). When you die, you carry on as your heir. Open the{' '}
          <button className="btn small ghost" onClick={() => setUi({ panel: 'codex' })}>
            Codex
          </button>{' '}
          any time for the full guide.
        </div>
      </Section>
    </div>
  );
}
