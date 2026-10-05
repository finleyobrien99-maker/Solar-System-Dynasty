// The regency (ROADMAP 12.3): who rules while the ruler is a child, or while a
// regent will not let go; otherwise, who you would want ruling for a young
// heir if you died tomorrow. Reading it never changes the game; naming a
// guardian goes through act().
import { useId, useState } from 'react';
import { ageOf, fullName } from '../../game/core';
import {
  clearGuardian,
  gripOf,
  guardianBlocker,
  guardianWard,
  majorityYear,
  nameGuardian,
  namedGuardian,
  regencyOf,
  regentCandidates,
  regentTie,
  type Grip,
} from '../../game/regency';
import { Btn, CharCard, Section } from '../components';
import { useGame } from '../store';

function gripLabel(g: Grip): { text: string; tone: string } {
  if (g.score <= 2) return { text: 'Likely to hand back power', tone: 'good' };
  if (g.score <= 5) return { text: 'Comfortable in the chair', tone: 'muted' };
  return { text: 'Hungry for power', tone: 'bad' };
}

const INFO =
  'While the ruler is under 16 a regent governs: war, schemes, activities and abdication wait for the ruler. The regent is a real person, a parent first, otherwise family or a councillor. A greedy or deceitful regent quietly skims the treasury, and how kind or cruel they are shapes how the child feels about them. At sixteen an ambitious regent may refuse to hand over the seal for up to three more cycles; you can challenge them, buy them out or have them arrested. AI houses have regents by the same rules, and theirs can keep the house.';

export function RegencySection() {
  const { s, act, openChar } = useGame();
  const id = useId();
  const [pickId, setPickId] = useState('');
  const reg = regencyOf(s, s.playerClanId);

  if (reg) {
    const grip = gripOf(s, reg.regent, reg.ward, reg.since);
    const label = gripLabel(grip);
    const grown = ageOf(s, reg.ward) >= 16;
    return (
      <Section title="The regency" icon="crown" info={INFO}>
        <div className={`card ${grown ? 'hl' : 'flat'} stack`}>
          <CharCard c={reg.regent} size={44} traitsMax={3} sub={`Regent since ${reg.since} · ${reg.ward.name}'s ${regentTie(s, reg.ward, reg.regent)}`} />
          <div>
            {grown
              ? `Refuses to hand over the seal until ${reg.until}. Watch for your chance to challenge them.`
              : `Rules until ${reg.ward.name} turns 16 in ${majorityYear(reg.ward)}.`}
          </div>
          <div>
            <span className={label.tone}>{label.text}</span>
            {grip.reasons.length > 0 && <span className="dim"> · {grip.reasons.join(' · ')}</span>}
          </div>
          {reg.exposed && reg.skimmed > 0 && <div className="bad">You have proof they took {reg.skimmed} credits from the treasury.</div>}
        </div>
      </Section>
    );
  }

  const heir = guardianWard(s);
  if (!heir) return null;
  const named = namedGuardian(s);
  const pool = regentCandidates(s, s.playerClanId, heir).filter((c) => c.id !== named?.id);
  const pick = pool.find((c) => c.id === pickId) ?? pool[0];
  const forecast = (c: (typeof pool)[number]) => gripLabel(gripOf(s, c, heir)).text.toLowerCase();

  return (
    <Section
      title="Guardian for your heir"
      icon="family"
      info={`If you die before ${heir.name} turns 16, a regent rules for them. Name one now and they take the chair without a council vote. Otherwise the council puts forward the best of the family, a parent first, and you may overrule it. ${INFO}`}
    >
      <div className="card flat stack">
        {named ? (
          <>
            <CharCard c={named} size={44} traitsMax={3} sub={`Named guardian · ${heir.name}'s ${regentTie(s, heir, named)}`} />
            <div className="muted">{gripLabel(gripOf(s, named, heir)).text}.</div>
            <div className="btn-row">
              <Btn small kind="ghost" onClick={() => act((d) => clearGuardian(d))}>
                Leave it to the council
              </Btn>
            </div>
          </>
        ) : (
          <div className="muted">
            {heir.name} is {ageOf(s, heir)}. Nobody is named: if the worst happens, the council will choose.
          </div>
        )}
        {pool.length > 0 ? (
          <div className="stack">
            <label htmlFor={id + '-guardian'}>
              {named ? 'Name someone else' : 'Choose a guardian'}
              <select id={id + '-guardian'} style={{ width: '100%', minWidth: 0 }} value={pick?.id ?? ''} onChange={(e) => setPickId(e.target.value)}>
                {pool.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(s, c)}, {regentTie(s, heir, c)}: {forecast(c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <Btn small reason={pick ? guardianBlocker(s, pick.id) : 'Nobody to name'} onClick={() => pick && act((d) => nameGuardian(d, pick.id))}>
                Name as guardian
              </Btn>
              {pick && (
                <Btn small kind="ghost" onClick={() => openChar(pick.id)}>
                  View {pick.name}
                </Btn>
              )}
            </div>
          </div>
        ) : (
          !named && <div className="muted">Nobody in the family or council is fit to serve yet.</div>
        )}
      </div>
    </Section>
  );
}
