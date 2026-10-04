import { useState } from 'react';
import { ageOf, alive, ch, childrenOf, cooldownReady, dynastyMembers, ruler, siblingsOf } from '../../game/core';
import { TUTOR_COST } from '../../game/economy';
import {
  breakBetrothal,
  buyVats,
  canSeekSpouse,
  changeGenderLaw,
  changeLaw,
  designateHeir,
  divorce,
  divorceCost,
  endAffair,
  GENDER_LAW_COST,
  GENDER_LAWS,
  generateSuitors,
  LAW_COST,
  LAWS,
  legitimize,
  LEGITIMIZE_COST,
  setEducation,
  suitorMode,
  TUTORS,
  VATS_COST,
} from '../../game/family';
import { canAfford } from '../../game/genetics';
import { eduTier, isCloseFamily, lineOfSuccession } from '../../game/life';
import { EDU_NAMES, STAT_NAMES } from '../../game/traits';
import { STAT_KEYS, type Character, type GenderLaw, type StatKey, type SuccessionLaw, type TutorKey } from '../../game/types';
import { Btn, CharCard, CostTag, InfoDot, Section } from '../components';
import { useGame } from '../store';
import { CadetSection } from '../sections/CadetSection';

export function EduControls({ c }: { c: Character }) {
  const { s, act } = useGame();
  if (!c.edu) return null;
  const tier = eduTier(c.edu.progress);
  return (
    <div className="stack" style={{ gap: 'var(--space-6px)', marginTop: 'var(--space-6px)' }} onClick={(e) => e.stopPropagation()}>
      <div className="row wrap" style={{ gap: 'var(--space-6px)' }}>
        <select value={c.edu.focus} onChange={(e) => act((d) => setEducation(d, c.id, e.target.value as StatKey, c.edu!.tutor))} aria-label="Education focus">
          {STAT_KEYS.map((k) => (
            <option key={k} value={k}>
              {STAT_NAMES[k]}
            </option>
          ))}
        </select>
        <select value={c.edu.tutor} onChange={(e) => act((d) => setEducation(d, c.id, c.edu!.focus, e.target.value as TutorKey))} aria-label="Tutor">
          {(Object.keys(TUTORS) as TutorKey[]).map((k) => (
            <option key={k} value={k}>
              {TUTORS[k].name} {TUTOR_COST[k] ? `(${TUTOR_COST[k]}/cycle)` : '(free)'}
            </option>
          ))}
        </select>
      </div>
      <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)' }}>
        On track for: <b className="gold">{EDU_NAMES[c.edu.focus][tier - 1]}</b> (tier {tier}/4) · progress {Math.round(c.edu.progress)}
        <InfoDot text="At 16 a child earns an education trait based on progress: under 45 is tier 1, 45+ tier 2, 75+ tier 3, 100+ tier 4. Better tutors, Quick or Brilliant genes and Saturnine schooling all speed it up. Switching focus after age 10 loses some progress." />
      </div>
      {s.year - c.born < 6 && <div className="dim">Schooling starts at 6.</div>}
    </div>
  );
}

function ChildActions({ c }: { c: Character }) {
  const { s, act, setUi, toast } = useGame();
  const married = alive(ch(s, c.spouseId));
  const betrothed = ch(s, c.betrothedId);
  const canMatch = !canSeekSpouse(s, c) && ageOf(s, c) >= 3;
  return (
    <div className="btn-row" style={{ marginTop: 'var(--space-6px)' }} onClick={(e) => e.stopPropagation()}>
      {canMatch && (
        <Btn
          small
          icon="heart"
          onClick={() => {
            act((d) => generateSuitors(d, c.id));
            setUi({ panel: 'suitors' });
          }}
        >
          {suitorMode(s, c) === 'marry' ? 'Arrange marriage' : 'Arrange betrothal'}
        </Btn>
      )}
      {betrothed && (
        <Btn small kind="ghost" onClick={() => act((d) => breakBetrothal(d, c.id))}>
          Break betrothal ({betrothed.name})
        </Btn>
      )}
      {married && <span className="pill">Married to {ch(s, c.spouseId)!.name}</span>}
      {c.bastard && (
        <Btn
          small
          reason={canAfford(s, LEGITIMIZE_COST) ? null : 'Need 150 prestige'}
          onClick={() => act((d) => legitimize(d, c.id)) && toast(`${c.name} is legitimised.`)}
        >
          Legitimise (150 prestige)
        </Btn>
      )}
      {s.dynasty.law === 'designated' && !c.bastard && s.dynasty.designatedHeir !== c.id && (
        <Btn small kind="good" onClick={() => act((d) => designateHeir(d, c.id))}>
          Make heir
        </Btn>
      )}
      {s.dynasty.designatedHeir === c.id && <span className="pill gold">Designated heir</span>}
    </div>
  );
}

export function FamilyTab() {
  const { s, act, setUi, toast } = useGame();
  const [kinFilter, setKinFilter] = useState('');
  const r = ruler(s);
  const spouse = ch(s, r.spouseId);
  const lover = ch(s, r.loverId);
  const kids = childrenOf(s, r).sort((a, b) => a.born - b.born);
  const parents = [ch(s, r.fatherId), ch(s, r.motherId)].filter((x): x is Character => !!x);
  const sibs = siblingsOf(s, r).filter((x) => x.clanId === s.playerClanId);
  const line = lineOfSuccession(s).slice(0, 6);
  const shown = new Set([r.id, spouse?.id, lover?.id, ...kids.map((k) => k.id), ...parents.map((p) => p.id), ...sibs.map((x) => x.id)]);
  const kin = dynastyMembers(s).filter((c) => !shown.has(c.id));
  const kinShown = kin
    .filter((c) => !kinFilter || c.name.toLowerCase().includes(kinFilter.toLowerCase()))
    .sort((a, b) => Number(isCloseFamily(s, b)) - Number(isCloseFamily(s, a)) || a.born - b.born)
    .slice(0, 40);
  const seekBlock = canSeekSpouse(s, r);

  return (
    <div>
      <Section
        title="Spouse"
        icon="heart"
        info="Marrying brings your spouse into your house: your children belong to your dynasty. A highborn match (a clan head's child) costs prestige but seals an alliance; allies fight beside you in wars."
      >
        {spouse && alive(spouse) ? (
          <CharCard
            c={spouse}
            extra={
              <div className="btn-row" style={{ marginTop: 'var(--space-6px)' }} onClick={(e) => e.stopPropagation()}>
                <Btn
                  small
                  kind="danger"
                  reason={canAfford(s, divorceCost()) ? null : 'Need 100 faith and 50 prestige'}
                  onClick={() => act((d) => divorce(d, r.id)) && toast('Divorced.')}
                >
                  Divorce
                </Btn>
                <CostTag cost={divorceCost()} />
              </div>
            }
          />
        ) : (
          <div className="card flat spread">
            <span className="muted">{spouse ? `Widowed: ${spouse.name} died in ${spouse.died}.` : 'You are not married.'}</span>
            <Btn
              kind="primary"
              icon="heart"
              reason={seekBlock}
              onClick={() => {
                act((d) => generateSuitors(d, r.id));
                setUi({ panel: 'suitors' });
              }}
            >
              Find a spouse
            </Btn>
          </div>
        )}
        {lover && alive(lover) && (
          <div style={{ marginTop: 'var(--space-8px)' }}>
            <CharCard
              c={lover}
              sub={`Lover · House ${s.clans[lover.clanId]?.name}`}
              extra={
                <div className="btn-row" style={{ marginTop: 'var(--space-6px)' }} onClick={(e) => e.stopPropagation()}>
                  <Btn small kind="ghost" onClick={() => act((d) => endAffair(d))}>
                    End the affair
                  </Btn>
                </div>
              }
            />
          </div>
        )}
      </Section>

      <Section
        title={`Children (${kids.filter(alive).length})`}
        icon="birth"
        info="Each married cycle there is a chance of a child, higher with Fecund or Lustful parents and lower after 35. Children inherit genes from both parents, plus anything locked in your Gene Vault. From 6 they go to school; at 16 they come of age."
        right={
          <label className="row" style={{ gap: 'var(--space-6px)', fontSize: 'var(--font-size-0_85rem)' }}>
            <input type="checkbox" checked={!s.dynasty.familyPlanning} onChange={(e) => act((d) => (d.dynasty.familyPlanning = !e.target.checked))} />
            Trying for children
          </label>
        }
      >
        <div className="grid">
          {kids.map((k) => (
            <CharCard
              key={k.id}
              c={k}
              traitsMax={5}
              extra={
                alive(k) ? (
                  <>
                    {k.edu && <EduControls c={k} />}
                    <ChildActions c={k} />
                  </>
                ) : undefined
              }
            />
          ))}
          {!kids.length && <div className="empty">No children yet.</div>}
        </div>
      </Section>

      <Section
        title="Succession"
        icon="crown"
        info="When you die you continue as your heir. If there is no living, legitimate member of your dynasty to inherit, the game ends."
      >
        <div className="cols">
          <div className="card stack">
            <div>
              <h4>Succession law</h4>
              <div className="choice-grid">
                {(Object.keys(LAWS) as SuccessionLaw[]).map((law) => (
                  <button
                    key={law}
                    className={`opt ${s.dynasty.law === law ? 'sel' : ''}`}
                    disabled={s.dynasty.law === law || !cooldownReady(s, 'law') || !canAfford(s, LAW_COST)}
                    onClick={() => act((d) => changeLaw(d, law)) && toast(`Succession law: ${LAWS[law].name}`)}
                  >
                    <div className="t">{LAWS[law].name}</div>
                    <div className="d">{LAWS[law].desc}</div>
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)', marginTop: 'var(--space-4px)' }}>
                Changing costs 200 prestige{!cooldownReady(s, 'law') && ` (locked until ${s.cooldowns.law})`}.
              </div>
            </div>
            <div>
              <h4>Gender law</h4>
              <div className="choice-grid">
                {(Object.keys(GENDER_LAWS) as GenderLaw[]).map((g) => (
                  <button
                    key={g}
                    className={`opt ${s.dynasty.genderLaw === g ? 'sel' : ''}`}
                    disabled={s.dynasty.genderLaw === g || !cooldownReady(s, 'genderlaw') || !canAfford(s, GENDER_LAW_COST)}
                    onClick={() => act((d) => changeGenderLaw(d, g))}
                  >
                    <div className="t">{GENDER_LAWS[g].name}</div>
                    <div className="d">{GENDER_LAWS[g].desc}</div>
                  </button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)', marginTop: 'var(--space-4px)' }}>
                Changing costs 150 prestige. Also decides which kin bring spouses home when they marry themselves off.
              </div>
            </div>
          </div>
          <div className="card">
            <h4>Line of succession</h4>
            <div className="stack" style={{ gap: 'var(--space-6px)' }}>
              {line.map((c, i) => (
                <CharCard key={c.id} c={c} size={44} traitsMax={3} sub={`${i + 1}. ${ageOf(s, c)} yrs${ageOf(s, c) < 16 ? ' (minor: regency)' : ''}`} />
              ))}
              {!line.length && <div className="bad">Nobody! Have children or welcome kin into the dynasty.</div>}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Parents & siblings" icon="family">
        <div className="grid">
          {[...parents, ...sibs].map((c) => (
            <CharCard
              key={c.id}
              c={c}
              traitsMax={3}
              extra={alive(c) && c.clanId === s.playerClanId && c.id !== r.id && ageOf(s, c) < 40 ? <ChildActions c={c} /> : undefined}
            />
          ))}
        </div>
      </Section>

      <CadetSection />

      <Section
        title={`Wider dynasty (${kin.length} living)`}
        icon="users"
        info="Cousins, nephews, grandchildren. With auto-matchmaking on, unmarried adult kin find their own spouses across the system. Some bring the spouse home (their children join your dynasty), others marry into the other house, spreading your bloodline to every planet."
        right={
          <button className="btn small ghost" onClick={() => setUi({ panel: 'tree' })}>
            Full family tree
          </button>
        }
      >
        <div className="card flat stack" style={{ marginBottom: 'var(--space-10px)' }}>
          <label className="row" style={{ gap: 'var(--space-8px)' }}>
            <input type="checkbox" checked={s.dynasty.autoMatch} onChange={(e) => act((d) => (d.dynasty.autoMatch = e.target.checked))} />
            <span>
              <b>Auto-matchmaking</b> <span className="muted">(kin you haven't married off yourself find their own matches)</span>
            </span>
          </label>
          <div className="spread">
            <span className="muted" style={{ fontSize: 'var(--font-size-0_85rem)' }}>
              Dynasty growth: <b className="gold">{s.dynasty.growth === 'capped' ? 'Tight family (capped)' : 'Sprawling (uncapped)'}</b>
              <InfoDot text="Chosen when you started this run. Sprawling lets the bloodline grow without limit. Tight family slows births among distant kin once the dynasty passes 30 living members, and stops them at 60." />
            </span>
            {!s.dynasty.gestationVats ? (
              <span className="row" style={{ gap: 'var(--space-6px)' }}>
                <Btn small reason={canAfford(s, VATS_COST) ? null : 'Need 800 credits'} onClick={() => act((d) => buyVats(d))}>
                  Build gestation vats
                </Btn>
                <InfoDot text="Artificial wombs: dynasty mothers can have children until 58 instead of 45. Costs 800 credits, once." />
              </span>
            ) : (
              <span className="pill green">Gestation vats installed</span>
            )}
          </div>
        </div>
        {kin.length > 8 && (
          <input
            placeholder="Search kin by name"
            value={kinFilter}
            onChange={(e) => setKinFilter(e.target.value)}
            style={{ marginBottom: 'var(--space-8px)', width: 260 }}
          />
        )}
        <div className="grid tight">
          {kinShown.map((c) => (
            <CharCard
              key={c.id}
              c={c}
              size={44}
              traitsMax={3}
              sub={`${ageOf(s, c)} yrs${c.marriedIn && c.spouseId ? ` · wed into House ${s.clans[ch(s, c.spouseId)?.clanId ?? '']?.name ?? '?'}` : ''}`}
            />
          ))}
        </div>
        {kin.length > kinShown.length && (
          <div className="muted" style={{ marginTop: 'var(--space-6px)' }}>
            Showing {kinShown.length} of {kin.length}. Use search or the family tree.
          </div>
        )}
      </Section>
    </div>
  );
}
