import { useMemo, useState } from 'react';
import { ACTIVITIES, activityBlocker, doActivity, type ActivityKind } from '../../game/activities';
import { ageOf, alive, clanRegions, fullName, ruler } from '../../game/core';
import { runScheme, schemeBlocker, schemeChance, SCHEMES, SCHEMES_PER_CYCLE, schemesLeft, type SchemeKind } from '../../game/intrigue';
import { PLANETS, PLANET_BY_ID } from '../../game/planets';
import type { Character } from '../../game/types';
import { Icon } from '../../svg/Icons';
import { Btn, CostTag, Section } from '../components';
import { useGame } from '../store';

function Activities() {
  const { s, act } = useGame();
  return (
    <div className="grid">
      {(Object.keys(ACTIVITIES) as ActivityKind[]).map((k) => {
        const a = ACTIVITIES[k];
        const block = activityBlocker(s, k);
        return (
          <div key={k} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8px)' }}>
            <div className="row">
              <div className="event-icon" style={{ width: 42, height: 42 }}>
                <Icon name={a.icon} size={22} />
              </div>
              <div className="grow">
                <b>{a.name}</b>
                <div className="muted" style={{ fontSize: 'var(--font-size-0_75rem)' }}>
                  Every {a.cooldown === 1 ? 'cycle' : `${a.cooldown} cycles`}
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)', flex: 1 }}>
              {a.desc}
            </div>
            <div className="spread">
              <CostTag cost={a.cost(s)} />
              <Btn small kind="primary" reason={block} onClick={() => act((d) => doActivity(d, k))}>
                Go
              </Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Schemes() {
  const { s, act } = useGame();
  const [kind, setKind] = useState<SchemeKind>('sway');
  const [target, setTarget] = useState('');
  const def = SCHEMES[kind];
  const r = ruler(s);

  const charTargets = useMemo(() => {
    const out: { planet: string; chars: Character[] }[] = [];
    for (const p of PLANETS) {
      const chars = Object.values(s.characters).filter((c) => {
        if (!alive(c) || c.id === r.id || ageOf(s, c) < 16) return false;
        const clan = s.clans[c.clanId];
        if (!clan || clan.isPlayer || clan.planetId !== p.id) return false;
        if (kind === 'seduce') return c.gender !== r.gender && c.id !== r.spouseId;
        return clan.headId === c.id || c.fatherId === clan.headId || c.motherId === clan.headId || c.spouseId === clan.headId;
      });
      if (chars.length) out.push({ planet: p.name, chars });
    }
    return out;
  }, [s, kind, r]);

  const clanTargets = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length);
  const regionTargets = Object.values(s.regions).filter((x) => x.owner !== s.playerClanId);
  const valid = def.target === 'char' ? !!s.characters[target] : def.target === 'clan' ? !!s.clans[target] && !s.clans[target].isPlayer : !!s.regions[target];
  const block = valid ? schemeBlocker(s, kind, target) : 'Pick a target';
  const chance = valid ? schemeChance(s, kind, target) : 0;

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 'var(--space-8px)' }}>
        <span className="muted">
          Scheme actions left this cycle: <b className="gold">{schemesLeft(s)}</b> / {SCHEMES_PER_CYCLE}
        </span>
      </div>
      <div className="choice-grid" style={{ marginBottom: 'var(--space-10px)' }}>
        {(Object.keys(SCHEMES) as SchemeKind[]).map((k) => (
          <button
            key={k}
            className={`opt ${kind === k ? 'sel' : ''}`}
            onClick={() => {
              setKind(k);
              setTarget('');
            }}
          >
            <div className="t">{SCHEMES[k].name}</div>
            <div className="d">{SCHEMES[k].desc}</div>
          </button>
        ))}
      </div>
      <div className="stack" style={{ gap: 'var(--space-8px)' }}>
        <label className="stack" style={{ gap: 'var(--space-4px)' }}>
          <span className="muted">Target</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {def.target === 'char' &&
              charTargets.map((g) => (
                <optgroup key={g.planet} label={g.planet}>
                  {g.chars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fullName(s, c)} ({ageOf(s, c)}){s.clans[c.clanId]?.headId === c.id ? ' - head of house' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            {def.target === 'clan' &&
              PLANETS.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {clanTargets
                    .filter((c) => c.planetId === p.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        House {c.name} (opinion {Math.round(c.opinion)})
                      </option>
                    ))}
                </optgroup>
              ))}
            {def.target === 'region' &&
              PLANETS.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {regionTargets
                    .filter((x) => x.planetId === p.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} (House {s.clans[x.owner]?.name})
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </label>
        <div className="spread">
          <span>
            Success chance: <b className={chance >= 0.5 ? 'good' : 'bad'}>{valid ? `${Math.round(chance * 100)}%` : '-'}</b>
            <span className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
              {' '}
              (Intrigue vs theirs, plus traits and relics)
            </span>
          </span>
          <span className="row" style={{ gap: 'var(--space-6px)' }}>
            <CostTag cost={def.cost} />
            <Btn kind="primary" icon="scheme" reason={block} onClick={() => act((d) => runScheme(d, kind, target))}>
              Execute
            </Btn>
          </span>
        </div>
        {valid && def.target === 'region' && <div className="muted">{PLANET_BY_ID[s.regions[target].planetId].name}</div>}
      </div>
    </div>
  );
}

export function ActionsTab() {
  return (
    <div>
      <Section
        title="Activities"
        icon="gala"
        info="Each activity can be done once per cooldown. Most give prestige or faith, with a dash of risk. Regents (rulers under 16) cannot do them."
      >
        <Activities />
      </Section>
      <Section
        title="Schemes"
        icon="scheme"
        info="Up to 3 schemes per cycle. Success depends on your Intrigue against your target's, plus Deceitful, psionic genes, Venusian birth and relics. Paranoid and Plutonian targets are harder. Get caught and the victim's house will hate you, or worse."
      >
        <Schemes />
      </Section>
    </div>
  );
}
