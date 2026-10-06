import { useState } from 'react';
import { CADET_COST, cadetBlocker, defaultCadetName, foundCadet } from '../../game/cadets';
import { alive, cadetClans, ch, clanRegions, fullName } from '../../game/core';
import { memorySum } from '../../game/memory';
import { PLANET_BY_ID } from '../../game/planets';
import type { Character } from '../../game/types';
import { Sigil } from '../../svg/Sigil';
import { Btn, CostTag, Face, Opinion, Section } from '../components';
import { useGame } from '../store';

export function CadetSection() {
  const { s, openClan } = useGame();
  const cadets = cadetClans(s);
  return (
    <Section
      title={`Cadet branches (${cadets.length})`}
      icon="family"
      info="A cadet branch is an offshoot house of your bloodline, founded when you grant a kinsman one of your regions. Cadets are sworn to you, pay tribute, send 35% of their fleet to your wars and share your Gene Vault's locks. They can still turn on you if you treat them badly. If your main line ever dies out, the strongest cadet branch takes up the crown."
    >
      {!cadets.length && <div className="empty">None yet. Open an adult relative's card (not your heir) and grant them a region to found one.</div>}
      <div className="grid">
        {cadets.map((k) => {
          const head = ch(s, k.headId);
          const regions = clanRegions(s, k.id);
          const members = Object.values(s.characters).filter((c) => alive(c) && c.clanId === k.id).length;
          return (
            <div
              key={k.id}
              className="char"
              onClick={() => openClan(k.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }}
            >
              <Sigil spec={k.sigil} size={40} />
              {head && <Face c={head} size={48} />}
              <div className="meta">
                <div className="nm">House {k.name}</div>
                <div className="sub">
                  {head ? fullName(s, head) : ''} · {regions.map((r) => r.name).join(', ') || 'landless'} · {members} kin · {k.fleet} ships
                </div>
                <div className="row" style={{ marginTop: 'var(--space-4px)', gap: 'var(--space-4px)' }}>
                  <Opinion v={k.opinion} />
                  {memorySum(k) <= -40 && <span className="pill red">Resentful</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Grant-a-region panel shown on a main-house relative's character card. */
export function FoundCadetPanel({ c }: { c: Character }) {
  const { s, act, closePanels } = useGame();
  const regions = clanRegions(s, s.playerClanId).filter((r) => !r.capital);
  const [regionId, setRegionId] = useState(regions[0]?.id ?? '');
  const [name, setName] = useState('');
  const block = regionId ? cadetBlocker(s, c.id, regionId) : "You have no region to spare (throne-regions can't be granted).";
  return (
    <details style={{ marginTop: 'var(--space-12px)' }}>
      <summary className="gold">Found a cadet branch</summary>
      <div className="stack" style={{ gap: 'var(--space-8px)', marginTop: 'var(--space-8px)' }}>
        <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
          Grant {c.name} a region. They, and their descendants still in your house, become a new house of your bloodline, sworn to you. Their shield and flag
          keep your shape, pattern and symbol, with three freshly chosen colours.
        </div>
        <div className="row wrap" style={{ gap: 'var(--space-8px)' }}>
          <select
            id="cadet-region"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            aria-label="Region to grant"
            style={{ flex: '1 1 180px', minWidth: 0 }}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({PLANET_BY_ID[r.planetId].name}, dev {r.dev})
              </option>
            ))}
          </select>
          <input
            id="cadet-name"
            aria-label="New house name"
            placeholder={regionId ? defaultCadetName(s, regionId) : 'House name'}
            value={name}
            maxLength={28}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: '1 1 180px', minWidth: 0 }}
          />
        </div>
        <div className="spread">
          <CostTag cost={CADET_COST} />
          <Btn
            kind="primary"
            small
            reason={block}
            confirm="Tap again to grant the land"
            onClick={() => {
              const id = act((d) => foundCadet(d, c.id, regionId, name));
              // Let the founding notice take focus without competing profile windows.
              if (id) closePanels();
            }}
          >
            Found House {name.trim() || (regionId ? defaultCadetName(s, regionId) : '')}
          </Btn>
        </div>
        {block && <span className="reason">{block}</span>}
      </div>
    </details>
  );
}
