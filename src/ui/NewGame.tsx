import { useMemo, useState } from 'react';
import { eduTrait } from '../game/character';
import { clanRegions } from '../game/core';
import { FAITHS, PLANETS, PLANET_BY_ID } from '../game/planets';
import { seeded } from '../game/rng';
import { addTrait, EDU_NAMES, PERSONALITY, STAT_NAMES, TRAITS } from '../game/traits';
import { STAT_KEYS, type Appearance, type Character, type GameState, type Gender, type ScenarioId, type SigilSpec, type StatKey } from '../game/types';
import { GOD_EXTRAS, GOD_PERSONALITY, GOD_STAT, godGenetics, STAT_MAX } from '../game/vip';
import {
  createWorld,
  emperorWorlds,
  MAX_START_AGE,
  MIN_START_AGE,
  randomSigil,
  rollRuler,
  SCENARIOS,
  scenarioHouses,
  startGame,
  type RulerPreview,
  type StartFamily,
} from '../game/world';
import { Icon } from '../svg/Icons';
import { PlanetArt } from '../svg/PlanetArt';
import { Portrait } from '../svg/Portrait';
import { Sigil } from '../svg/Sigil';
import { InfoDot, TraitChip } from './components';
import { TraitPicker } from './vip/TraitPicker';

const FOCUS_DESC: Record<StatKey, string> = {
  dip: 'Raised at court. Charming and persuasive.',
  cmd: 'Raised on a warship. Born to command.',
  eco: 'Raised in the counting-house. Credits flow.',
  int: "Raised among spies. Knows everyone's secrets.",
  sci: 'Raised in the archives. Brilliant and curious.',
};

const LOOKS: [keyof Appearance, string, number][] = [
  ['skin', 'Skin', 7],
  ['hair', 'Hair colour', 7],
  ['hairStyle', 'Hair style', 7],
  ['eyes', 'Eyes', 6],
  ['face', 'Face', 3],
  ['nose', 'Nose', 3],
  ['mouth', 'Mouth', 3],
  ['brow', 'Brows', 2],
  ['beard', 'Beard', 3],
];

const FAMILY: [StartFamily, string, string][] = [
  ['single', 'Single', 'Find your own match.'],
  ['married', 'Married', 'A spouse from another house.'],
  ['kids', 'Married with kids', 'A spouse and one to three children.'],
];

const STEPS = ['1. Homeworld', '2. Start', '3. House', '4. Ruler'];

function LooksEditor({ looks, gender, onChange }: { looks: Appearance; gender: Gender; onChange: (l: Appearance) => void }) {
  return (
    <div className="looks-grid">
      {LOOKS.filter(([k]) => k !== 'beard' || gender === 'M').map(([k, label, max]) => {
        const set = (d: number) => onChange({ ...looks, [k]: (looks[k] + d + max + 1) % (max + 1) });
        return (
          <div key={k} className="looks-row">
            <span>{label}</span>
            <span className="row" style={{ gap: 4 }}>
              <button type="button" className="btn small ghost" onClick={() => set(-1)} aria-label={`Previous ${label}`}>
                ‹
              </button>
              <b style={{ minWidth: 34, textAlign: 'center' }}>
                {looks[k] + 1}/{max + 1}
              </b>
              <button type="button" className="btn small ghost" onClick={() => set(1)} aria-label={`Next ${label}`}>
                ›
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function NewGame({ onStart, onBack }: { onStart: (s: GameState) => void; onBack: () => void }) {
  const [worldSeed, setWorldSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const world = useMemo(() => createWorld(worldSeed), [worldSeed]);
  const [step, setStep] = useState(0);
  const [planetId, setPlanetId] = useState('mars');
  const [scenario, setScenario] = useState<ScenarioId>('governor');
  const [vip, setVip] = useState(false);
  const [growth, setGrowth] = useState<'uncapped' | 'capped'>('uncapped');
  const [clanId, setClanId] = useState<string>('');
  const [clanName, setClanName] = useState('');
  const [sigil, setSigil] = useState<SigilSpec | undefined>();
  const [gender, setGender] = useState<Gender>('F');
  const [rollSeed, setRollSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [name, setName] = useState<string | undefined>();
  const [focus, setFocus] = useState<StatKey>('dip');
  const [age, setAge] = useState(20);
  const [family, setFamily] = useState<StartFamily>('single');
  // Overrides on top of the rolled ruler. null = use the roll.
  const [personality, setPersonality] = useState<string[] | null>(null);
  const [genetic, setGenetic] = useState<string[] | null>(null);
  const [looks, setLooks] = useState<Appearance | null>(null);
  const [base, setBase] = useState<Record<StatKey, number> | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [eduTier, setEduTier] = useState(2);

  const preview: RulerPreview = useMemo(() => rollRuler(rollSeed, planetId, gender), [rollSeed, planetId, gender]);
  // VIP-only overrides fall away if VIP is switched back off.
  const traitsChosen = personality && (vip || personality.length <= 3) ? personality : preview.personality;
  const genes = vip ? (genetic ?? preview.genetic) : preview.genetic;
  const face = looks ?? preview.looks;
  const talents = vip ? (base ?? preview.base) : preview.base;
  const rulerName = name ?? preview.name;
  const tier = vip ? eduTier : age >= 35 ? 3 : 2;

  const houses = scenarioHouses(world, planetId, scenario);
  const clan = world.clans[clanId] && houses.some((h) => h.id === clanId) ? world.clans[clanId] : houses[0];
  const royal = scenario === 'monarch' || scenario === 'emperor';
  const sovId = Object.values(world.clans).find((c) => c.planetId === planetId && clanRegions(world, c.id).some((r) => r.capital))?.id;
  const sov = sovId ? world.clans[sovId] : undefined;
  const p = PLANET_BY_ID[planetId];
  const rank = SCENARIOS.findIndex((x) => x.id === scenario) + 1;

  const fake: Character = {
    id: 'preview',
    name: rulerName,
    gender,
    born: world.year - age,
    clanId: clan?.id ?? '',
    planetId,
    faithId: p.faithId,
    childrenIds: [],
    traits: addTrait([...genes, ...traitsChosen, ...(vip ? extras : [])], eduTrait(focus, tier)),
    base: talents,
    health: 100,
    looks: face,
  };

  const reroll = () => {
    setRollSeed(Math.floor(Math.random() * 1e9));
    setPersonality(null);
    setGenetic(null);
    setLooks(null);
    setBase(null);
    setExtras([]);
    setName(undefined);
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

  // VIP builder: one picker for genes, personality and extras.
  const vipToggle = (id: string) => {
    const t = TRAITS[id];
    const flip = (list: string[]) => (list.includes(id) ? list.filter((x) => x !== id) : addTrait(list, id));
    if (t.cat === 'genetic') setGenetic(flip(genes));
    else if (t.cat === 'personality') setPersonality(flip(traitsChosen));
    else if (t.cat === 'acquired' || t.cat === 'cyber') setExtras(flip(extras));
  };

  const godTier = () => {
    setGenetic(godGenetics());
    setPersonality(GOD_PERSONALITY);
    setExtras(GOD_EXTRAS);
    setBase(Object.fromEntries(STAT_KEYS.map((k) => [k, GOD_STAT])) as Record<StatKey, number>);
    setEduTier(4);
  };

  const begin = () => {
    if (!clan) return;
    const s = structuredClone(world);
    const ruler: RulerPreview = { ...preview, name: rulerName.trim() || preview.name, personality: traitsChosen, genetic: genes, looks: face, base: talents };
    onStart(
      startGame(s, {
        clanId: clan.id,
        clanName: clanName || undefined,
        sigil,
        ruler,
        focus,
        growth,
        scenario,
        age,
        family: age < 18 ? 'single' : family,
        vip,
        extraTraits: vip ? extras : undefined,
        eduTier: vip ? eduTier : undefined,
      }),
    );
  };

  const pickHouse = (id: string) => {
    setClanId(id);
    setSigil(undefined);
    setClanName('');
  };

  return (
    <div className="main" style={{ paddingBottom: 40 }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h1 className="gold" style={{ margin: 0 }}>
          Found your dynasty
        </h1>
        <button className="btn ghost small" onClick={onBack} data-back>
          <Icon name="back" size={14} /> Back
        </button>
      </div>
      <div className="steps">
        {STEPS.map((t, i) => (
          <span key={t} className={step === i ? 'on' : ''}>
            {t}
          </span>
        ))}
      </div>

      {step === 0 && (
        <>
          <p className="muted">Each world is its own power with its own culture, faith and perks. Next you'll choose how high up its ladder you start.</p>
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
                  <div className="gold" style={{ fontSize: '0.78rem' }}>
                    {pl.faction}
                  </div>
                  <div className="muted" style={{ fontSize: '0.76rem' }}>
                    {pl.bonus}
                  </div>
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
              Next: how you start <Icon name="arrow" size={16} />
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h3>Starting rank</h3>
          <div className="scenario-grid">
            {SCENARIOS.map((sc, i) => (
              <button
                key={sc.id}
                className={`opt scenario ${scenario === sc.id ? 'sel' : ''}`}
                onClick={() => {
                  setScenario(sc.id);
                  pickHouse('');
                }}
                aria-pressed={scenario === sc.id}
              >
                <div className="spread">
                  <span className="t">{sc.name}</span>
                  <span className="rank-pips" aria-label={`Rank ${i + 1} of 4`}>
                    {SCENARIOS.map((_, j) => (
                      <i key={j} className={j <= i ? 'on' : ''} />
                    ))}
                  </span>
                </div>
                <div className="gold" style={{ fontSize: '0.8rem' }}>
                  {sc.tagline}
                </div>
                <div className="d">{sc.blurb}</div>
                {sc.id === 'monarch' && (
                  <div className="d" style={{ color: 'var(--cyan)' }}>
                    Crowned {p.monarch.M} / {p.monarch.F} of {p.name}.
                  </div>
                )}
                {sc.id === 'emperor' && (
                  <div className="d" style={{ color: 'var(--cyan)' }}>
                    Rules {p.name},{' '}
                    {emperorWorlds(planetId)
                      .map((id) => PLANET_BY_ID[id].name)
                      .join(' and ')}
                    .
                  </div>
                )}
                <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                  <span className="pill gold">
                    <Icon name="credits" size={11} />
                    {sc.credits.toLocaleString('en-GB')}
                  </span>
                  <span className="pill" style={{ color: '#ffb4f0' }}>
                    <Icon name="prestige" size={11} />
                    {sc.prestige.toLocaleString('en-GB')}
                  </span>
                  <span className="pill" style={{ color: '#ffb36b' }}>
                    <Icon name="faith" size={11} />
                    {sc.faith}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: 16 }}>
            Game mode{' '}
            <InfoDot text="VIP mode is a sandbox, like the VIP perks in mobile life sims. You can switch it on or off later from the menu, so picking Standard now doesn't lock you out." />
          </h3>
          <div className="choice-grid two">
            <button className={`opt ${!vip ? 'sel' : ''}`} onClick={() => setVip(false)} aria-pressed={!vip}>
              <div className="t">Standard</div>
              <div className="d">Roll your ruler, breed for genes, earn everything the hard way.</div>
            </button>
            <button className={`opt vip-opt ${vip ? 'sel' : ''}`} onClick={() => setVip(true)} aria-pressed={vip}>
              <div className="t">
                <Icon name="relic" size={14} /> VIP sandbox
              </div>
              <div className="d">
                Build a god-tier ruler with every trait you want. Edit anyone's traits, stats and age on the fly. Unlimited free Gene-Forge and Gene Vault. A
                console for credits, prestige and ships. Only ever helps you, never the AI.
              </div>
            </button>
          </div>

          <h3 style={{ marginTop: 16 }}>
            Dynasty growth{' '}
            <InfoDot text="Sprawling: no limit. Your bloodline can grow into the hundreds and spread into houses on every planet. Tight family: once the dynasty passes 30 living members, distant kin have far fewer children (none past 60), keeping the court small and focused. You can't change this mid-run." />
          </h3>
          <div className="choice-grid two">
            <button className={`opt ${growth === 'uncapped' ? 'sel' : ''}`} onClick={() => setGrowth('uncapped')}>
              <div className="t">Sprawling</div>
              <div className="d">Uncapped. Spread your blood across the whole system.</div>
            </button>
            <button className={`opt ${growth === 'capped' ? 'sel' : ''}`} onClick={() => setGrowth('capped')}>
              <div className="t">Tight family</div>
              <div className="d">Capped. A lean, focused court.</div>
            </button>
          </div>

          <div className="btn-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={() => setStep(0)} data-back>
              Back
            </button>
            <button className="btn primary" onClick={() => setStep(2)}>
              Next: your house <Icon name="arrow" size={16} />
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <p className="muted">
            {royal
              ? `You lead the royal house of ${p.name}${scenario === 'emperor' ? ', and two more worlds besides' : ''}. Rename it and redesign its sigil if you like.`
              : `${sov ? `House ${sov.name} sits the throne of ${p.name}. ` : ''}Pick the house you will lead.${scenario === 'viceroy' ? ' It will be granted land until it holds three regions.' : ''} You can rename it and redesign its sigil.`}
          </p>
          <div className="grid">
            {houses.map((c) => (
              <button key={c.id} className={`opt ${clan?.id === c.id ? 'sel' : ''}`} onClick={() => pickHouse(c.id)}>
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
            <button className="btn ghost" onClick={() => setStep(1)} data-back>
              Back
            </button>
            <span className="row">
              <button className="btn ghost small" onClick={() => setWorldSeed(Math.floor(Math.random() * 1e9))} title="Reroll every house in the system">
                Reroll the system
              </button>
              <button className="btn primary" disabled={!clan} onClick={() => setStep(3)}>
                Next: your ruler <Icon name="arrow" size={16} />
              </button>
            </span>
          </div>
        </>
      )}

      {step === 3 && clan && (
        <>
          {vip && (
            <div className="card flat vip-banner spread" style={{ marginBottom: 12 }}>
              <span>
                <Icon name="relic" size={14} /> <b className="gold">VIP builder.</b> Pick any traits you like, set talents up to {STAT_MAX}, or go all in.
              </span>
              <button className="btn primary small" onClick={godTier}>
                <Icon name="prestige" size={14} /> Make god-tier
              </button>
            </div>
          )}
          <div className="cols">
            <div className="card stack" style={{ gap: 10 }}>
              <div className="row top">
                <Portrait c={fake} year={world.year} rank={rank} clanColor={sigil?.c1 ?? clan.color} trim={sigil?.c2 ?? clan.sigil.c2} size={140} />
                <div className="stack" style={{ gap: 8, minWidth: 0 }}>
                  <label className="stack" style={{ gap: 4 }}>
                    <span className="muted">Name</span>
                    <input value={rulerName} maxLength={20} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <div className="row">
                    {(['F', 'M'] as Gender[]).map((g) => (
                      <button
                        key={g}
                        className={`btn small ${gender === g ? 'primary' : ''}`}
                        onClick={() => {
                          setGender(g);
                          setName(undefined);
                          setLooks(null);
                        }}
                      >
                        {g === 'F' ? 'Female' : 'Male'}
                      </button>
                    ))}
                  </div>
                  <button className="btn small" onClick={reroll}>
                    <Icon name="dna" size={14} /> Reroll {vip ? 'everything' : 'genes & looks'}
                  </button>
                </div>
              </div>

              <label className="stack" style={{ gap: 4 }}>
                <span className="spread">
                  <span className="muted">Age</span>
                  <b>{age}</b>
                </span>
                <input
                  type="range"
                  min={MIN_START_AGE}
                  max={MAX_START_AGE}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  aria-label="Starting age"
                />
                <span className="dim" style={{ fontSize: '0.74rem' }}>
                  Older rulers start better educated{!vip && age >= 35 ? ' (Tier 3 schooling)' : ''} but have fewer years left.
                </span>
              </label>

              <details className="looks">
                <summary className="gold">Appearance</summary>
                <LooksEditor looks={face} gender={gender} onChange={setLooks} />
              </details>

              {!vip && (
                <div>
                  <h4>
                    Genome{' '}
                    <InfoDot text="Genetic traits you were born with. They can pass to your children, and you can lock good ones into your bloodline later in the Gene Vault." />
                  </h4>
                  <div className="traits">
                    {genes.map((t) => (
                      <TraitChip key={t} id={t} />
                    ))}
                    {!genes.length && <span className="dim">Nothing remarkable</span>}
                  </div>
                </div>
              )}

              <div>
                <h4>Talents</h4>
                {vip ? (
                  <div className="vip-grid">
                    {STAT_KEYS.map((k) => (
                      <div key={k} className="stepper">
                        <span className="stepper-label">{STAT_NAMES[k]}</span>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={talents[k] <= 0}
                          onClick={() => setBase({ ...talents, [k]: Math.max(0, talents[k] - 1) })}
                          aria-label={`${STAT_NAMES[k]} minus 1`}
                        >
                          −
                        </button>
                        <b className="stepper-value">{talents[k] + (k === focus ? 2 : 0)}</b>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={talents[k] >= STAT_MAX}
                          onClick={() => setBase({ ...talents, [k]: Math.min(STAT_MAX, talents[k] + 1) })}
                          aria-label={`${STAT_NAMES[k]} plus 1`}
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="stats">
                    {STAT_KEYS.map((k) => (
                      <div key={k} className="stat">
                        <div className="v">{talents[k] + (k === focus ? 2 : 0)}</div>
                        <div className="k">{k}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card stack">
              <div>
                <h4>Upbringing</h4>
                <div className="choice-grid">
                  {STAT_KEYS.map((k) => (
                    <button key={k} className={`opt ${focus === k ? 'sel' : ''}`} onClick={() => setFocus(k)}>
                      <div className="t">{EDU_NAMES[k][tier - 1]}</div>
                      <div className="d">
                        {STAT_NAMES[k]}. {FOCUS_DESC[k]}
                      </div>
                    </button>
                  ))}
                </div>
                {vip && (
                  <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                    <span className="muted">Schooling tier</span>
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} className={`btn small ${eduTier === n ? 'primary' : ''}`} onClick={() => setEduTier(n)}>
                        {EDU_NAMES[focus][n - 1]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {vip ? (
                <div>
                  <h4>Traits</h4>
                  <TraitPicker selected={[...genes, ...traitsChosen, ...extras]} onToggle={vipToggle} cats={['genetic', 'personality', 'acquired', 'cyber']} />
                </div>
              ) : (
                <div>
                  <h4>Personality (pick up to 3)</h4>
                  <div className="traits">
                    {PERSONALITY.map((t) => (
                      <button key={t.id} type="button" className="chip-btn" onClick={() => togglePersonality(t.id)} aria-pressed={traitsChosen.includes(t.id)}>
                        <span className={`trait personality ${t.good === true ? 'good-t' : t.good === false ? 'bad' : ''}`}>{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4>Family</h4>
                <div className="choice-grid">
                  {FAMILY.map(([id, label, desc]) => (
                    <button
                      key={id}
                      className={`opt ${family === id && (age >= 18 || id === 'single') ? 'sel' : ''}`}
                      disabled={id !== 'single' && age < 18}
                      onClick={() => setFamily(id)}
                    >
                      <div className="t">{label}</div>
                      <div className="d">{id !== 'single' && age < 18 ? 'Needs a ruler aged 18 or over.' : desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={() => setStep(2)} data-back>
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
