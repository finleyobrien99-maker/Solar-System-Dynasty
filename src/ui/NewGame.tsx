import { useMemo, useState } from 'react';
import { eduTrait } from '../game/character';
import { clanRegions } from '../game/core';
import { FAITHS, PLANETS, PLANET_BY_ID } from '../game/planets';
import { seeded } from '../game/rng';
import { addTrait, EDU_NAMES, PERSONALITY, STAT_NAMES, TRAITS } from '../game/traits';
import { STAT_KEYS, type Character, type GameState, type Gender, type SigilSpec, type StatKey } from '../game/types';
import { createWorld, randomSigil, rollRuler, startGame, type RulerPreview } from '../game/world';
import { Icon } from '../svg/Icons';
import { PlanetArt } from '../svg/PlanetArt';
import { Portrait } from '../svg/Portrait';
import { Sigil } from '../svg/Sigil';
import { InfoDot, TraitChip } from './components';

const FOCUS_DESC: Record<StatKey, string> = {
  dip: 'Raised at court. Charming and persuasive.',
  cmd: 'Raised on a warship. Born to command.',
  eco: 'Raised in the counting-house. Credits flow.',
  int: 'Raised among spies. Knows everyone\'s secrets.',
  sci: 'Raised in the archives. Brilliant and curious.',
};

export function NewGame({ onStart, onBack }: { onStart: (s: GameState) => void; onBack: () => void }) {
  const [worldSeed, setWorldSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const world = useMemo(() => createWorld(worldSeed), [worldSeed]);
  const [step, setStep] = useState(0);
  const [planetId, setPlanetId] = useState('mars');
  const [clanId, setClanId] = useState<string>('');
  const [clanName, setClanName] = useState('');
  const [sigil, setSigil] = useState<SigilSpec | undefined>();
  const [gender, setGender] = useState<Gender>('F');
  const [rollSeed, setRollSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [name, setName] = useState<string | undefined>();
  const [focus, setFocus] = useState<StatKey>('dip');
  const [personality, setPersonality] = useState<string[] | null>(null);
  const [growth, setGrowth] = useState<'uncapped' | 'capped'>('uncapped');

  const preview: RulerPreview = useMemo(() => rollRuler(rollSeed, planetId, gender), [rollSeed, planetId, gender]);
  const traitsChosen = personality ?? preview.personality;
  const rulerName = name ?? preview.name;

  const clans = Object.values(world.clans).filter((c) => c.planetId === planetId && !clanRegions(world, c.id).some((r) => r.capital));
  const clan = world.clans[clanId] ?? clans[0];
  const sov = Object.values(world.clans).find((c) => c.planetId === planetId && clanRegions(world, c.id).some((r) => r.capital));
  const p = PLANET_BY_ID[planetId];

  const fake: Character = {
    id: 'preview',
    name: rulerName,
    gender,
    born: world.year - 20,
    clanId: clan?.id ?? '',
    planetId,
    faithId: p.faithId,
    childrenIds: [],
    traits: addTrait([...preview.genetic, ...traitsChosen], eduTrait(focus, 2)),
    base: preview.base,
    health: 100,
    looks: preview.looks,
  };

  const togglePersonality = (id: string) => {
    const cur = traitsChosen;
    if (cur.includes(id)) setPersonality(cur.filter((t) => t !== id));
    else {
      const opp = TRAITS[id].opposite;
      const next = cur.filter((t) => t !== opp);
      if (next.length >= 3) return;
      setPersonality([...next, id]);
    }
  };

  const begin = () => {
    if (!clan) return;
    const s = structuredClone(world);
    const ruler: RulerPreview = { ...preview, name: rulerName.trim() || preview.name, personality: traitsChosen };
    onStart(startGame(s, { clanId: clan.id, clanName: clanName || undefined, sigil, ruler, focus, growth }));
  };

  return (
    <div className="main" style={{ paddingBottom: 40 }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h1 className="gold" style={{ margin: 0 }}>Found your dynasty</h1>
        <button className="btn ghost small" onClick={onBack}>
          <Icon name="back" size={14} /> Back
        </button>
      </div>
      <div className="steps">
        {['1. Homeworld', '2. House', '3. Ruler'].map((t, i) => (
          <span key={t} className={step === i ? 'on' : ''}>
            {t}
          </span>
        ))}
      </div>

      {step === 0 && (
        <>
          <p className="muted">Each world is its own power with its own culture, faith and perks. You start as a minor house there, sworn to the planet's ruler.</p>
          <div className="planet-pick">
            {PLANETS.map((pl) => (
              <button
                key={pl.id}
                className={`planet-card ${planetId === pl.id ? 'sel' : ''}`}
                onClick={() => {
                  setPlanetId(pl.id);
                  setClanId('');
                  setSigil(undefined);
                  setName(undefined);
                }}
              >
                <PlanetArt planetId={pl.id} size={64} />
                <div>
                  <div className="nm">{pl.name}</div>
                  <div className="gold" style={{ fontSize: '0.78rem' }}>{pl.faction}</div>
                  <div className="muted" style={{ fontSize: '0.76rem' }}>{pl.bonus}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row top">
              <PlanetArt planetId={planetId} size={110} />
              <div>
                <h2>{p.faction}</h2>
                <p>{p.blurb}</p>
                <p className="muted">
                  Faith: <span style={{ color: FAITHS[p.faithId].color }}>{FAITHS[p.faithId].name}</span> · Monarch: {p.monarch.M} / {p.monarch.F}
                </p>
                <p className="good">{p.bonus}</p>
              </div>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={() => setStep(1)}>
              Next: pick a house <Icon name="arrow" size={16} />
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="muted">
            {sov ? `House ${sov.name} sits the throne of ${p.name}. ` : ''}Pick the minor house you will lead. You can rename it and redesign its sigil.
          </p>
          <div className="grid">
            {clans.map((c) => (
              <button key={c.id} className={`opt ${clan?.id === c.id ? 'sel' : ''}`} onClick={() => { setClanId(c.id); setSigil(undefined); setClanName(''); }}>
                <div className="row">
                  <Sigil spec={c.id === clan?.id && sigil ? sigil : c.sigil} size={42} />
                  <div>
                    <div className="t">House {c.id === clan?.id && clanName ? clanName : c.name}</div>
                    <div className="d">
                      {clanRegions(world, c.id)
                        .map((r) => r.name)
                        .join(', ')}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {clan && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row wrap">
                <Sigil spec={sigil ?? clan.sigil} size={70} />
                <div className="stack" style={{ gap: 6 }}>
                  <label className="row wrap">
                    <span className="muted">House name</span>
                    <input value={clanName} placeholder={clan.name} maxLength={24} onChange={(e) => setClanName(e.target.value)} />
                  </label>
                  <button className="btn small" onClick={() => setSigil(randomSigil(seeded(Math.random() * 1e9)))}>
                    Redesign sigil
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <span className="row">
              <button className="btn ghost small" onClick={() => setWorldSeed(Math.floor(Math.random() * 1e9))} title="Reroll every house in the system">
                Reroll the system
              </button>
              <button className="btn primary" disabled={!clan} onClick={() => setStep(2)}>
                Next: your ruler <Icon name="arrow" size={16} />
              </button>
            </span>
          </div>
        </>
      )}

      {step === 2 && clan && (
        <>
          <div className="cols">
            <div className="card">
              <div className="row top">
                <Portrait c={fake} year={world.year} rank={1} clanColor={sigil?.c1 ?? clan.color} trim={sigil?.c2 ?? clan.sigil.c2} size={140} />
                <div className="stack" style={{ gap: 8 }}>
                  <label className="stack" style={{ gap: 4 }}>
                    <span className="muted">Name</span>
                    <input value={rulerName} maxLength={20} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <div className="row">
                    {(['F', 'M'] as Gender[]).map((g) => (
                      <button key={g} className={`btn small ${gender === g ? 'primary' : ''}`} onClick={() => { setGender(g); setName(undefined); }}>
                        {g === 'F' ? 'Female' : 'Male'}
                      </button>
                    ))}
                  </div>
                  <button className="btn small" onClick={() => { setRollSeed(Math.floor(Math.random() * 1e9)); setPersonality(null); setName(undefined); }}>
                    <Icon name="dna" size={14} /> Reroll genes & looks
                  </button>
                </div>
              </div>
              <h4 style={{ marginTop: 12 }}>
                Genome <InfoDot text="Genetic traits you were born with. They can pass to your children, and you can lock good ones into your bloodline later in the Gene Vault." />
              </h4>
              <div className="traits">
                {preview.genetic.map((t) => (
                  <TraitChip key={t} id={t} />
                ))}
                {!preview.genetic.length && <span className="dim">Nothing remarkable</span>}
              </div>
              <h4 style={{ marginTop: 10 }}>Talents</h4>
              <div className="stats">
                {STAT_KEYS.map((k) => (
                  <div key={k} className="stat">
                    <div className="v">{preview.base[k] + (k === focus ? 2 : 0)}</div>
                    <div className="k">{k}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card stack">
              <div>
                <h4>Upbringing</h4>
                <div className="choice-grid">
                  {STAT_KEYS.map((k) => (
                    <button key={k} className={`opt ${focus === k ? 'sel' : ''}`} onClick={() => setFocus(k)}>
                      <div className="t">{EDU_NAMES[k][1]}</div>
                      <div className="d">
                        {STAT_NAMES[k]}. {FOCUS_DESC[k]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4>Personality (pick up to 3)</h4>
                <div className="traits">
                  {PERSONALITY.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => togglePersonality(t.id)}
                      style={{ background: 'none', border: 0, padding: 0, opacity: traitsChosen.includes(t.id) ? 1 : 0.35 }}
                      aria-pressed={traitsChosen.includes(t.id)}
                    >
                      <span className={`trait personality ${t.good === true ? 'good-t' : t.good === false ? 'bad' : ''}`}>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4>
                  Dynasty growth <InfoDot text="Sprawling: no limit. Your bloodline can grow into the hundreds and spread into houses on every planet. Tight family: once the dynasty passes 30 living members, distant kin have far fewer children (none past 60), keeping the court small and focused. You can't change this mid-run." />
                </h4>
                <div className="choice-grid">
                  <button className={`opt ${growth === 'uncapped' ? 'sel' : ''}`} onClick={() => setGrowth('uncapped')}>
                    <div className="t">Sprawling</div>
                    <div className="d">Uncapped. Spread your blood across the whole system.</div>
                  </button>
                  <button className={`opt ${growth === 'capped' ? 'sel' : ''}`} onClick={() => setGrowth('capped')}>
                    <div className="t">Tight family</div>
                    <div className="d">Capped. A lean, focused court.</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn primary" onClick={begin}>
              <Icon name="crown" size={16} /> Begin the dynasty of House {clanName || clan.name}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
