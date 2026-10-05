import { ch, fullName } from '../../game/core';
import { currentHeir } from '../../game/life';
import { crisisBlocker, hearingChance, rebelFleet, resolveCrisis, settlementCost, successionClaimants, successionCrisis } from '../../game/succession';
import { Btn, CharCard, Section } from '../components';
import { useGame } from '../store';

export function SuccessionSection() {
  const { s, act, openChar, openClan } = useGame();
  const crisis = successionCrisis(s),
    heir = currentHeir(s);
  if (!crisis) {
    const claims = heir ? successionClaimants(s, s.rulerId, heir.id).slice(0, 3) : [];
    return (
      <Section
        title="Succession outlook"
        icon="family"
        info="At a ruler's death a legitimate, free adult child or sibling may challenge a free adult heir. Ambition, being passed over, neglect and hostility increase the risk; closeness and a content personality reduce it. The strongest potential claimant gets one roll, capped at 35%. Spending time with family can reduce real grievances. Voluntary abdication does not trigger a dispute. Child regencies and elective laws will be expanded separately."
      >
        <div className="card flat stack" style={{ gap: 'var(--space-8px)' }}>
          <span>{heir ? fullName(s, heir) + ' is next in line.' : 'There is no eligible heir.'}</span>
          {claims.length ? (
            claims.map((claim, i) => (
              <div key={claim.character.id}>
                <button className="btn small ghost" onClick={() => openChar(claim.character.id)}>
                  {claim.character.name}
                </button>
                <span className="muted">
                  {' '}
                  {Math.round(claim.risk * 100)}% {i === 0 ? 'risk of contesting the inheritance' : 'if the stronger claimant is unavailable'}
                </span>
                <div className="dim">{claim.reasons.join(' · ')}</div>
              </div>
            ))
          ) : (
            <span className="muted">No adult relative is currently threatening this inheritance.</span>
          )}
        </div>
      </Section>
    );
  }
  const claimant = ch(s, crisis.claimantId);
  if (!claimant) return null;
  const war = crisis.stage === 'civil-war';
  const cost = settlementCost(s, crisis);
  return (
    <Section title={war ? 'A family at war' : 'A disputed inheritance'} icon="crown">
      <div className="card hl stack" style={{ gap: 'var(--space-12px)' }}>
        <CharCard c={claimant} sub="Claims your crown" traitsMax={3} size={54} />
        <p style={{ margin: 0 }}>
          {war
            ? 'Your relative has taken up arms. Win two more battles than the rebels to secure the crown. If you lose, you carry on as the claimant; your dynasty survives.'
            : 'You have until year ' + crisis.deadline + ' to settle the claim before crews defect and civil war begins.'}
        </p>
        <div className="muted">{crisis.reasons.join(' · ')}</div>
        {crisis.votes.length > 0 && (
          <div className="stack">
            <b>The council takes sides</b>
            {crisis.votes.map((v) => {
              const c = ch(s, v.id);
              return c ? (
                <div className="spread wrap" key={v.id} title={v.reason}>
                  <button className="btn small ghost" onClick={() => openChar(v.id)}>
                    {c.name}
                  </button>
                  <span className={v.side === 'incumbent' ? 'good' : 'bad'}>{v.side === 'incumbent' ? 'Supports you' : 'Supports ' + claimant.name}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
        {crisis.backerIds.length > 0 && (
          <div className="row wrap">
            <span className="muted">Backing the claim:</span>
            {crisis.backerIds.map(
              (id) =>
                s.clans[id] && (
                  <button className="btn small ghost" key={id} onClick={() => openClan(id)}>
                    House {s.clans[id].name}
                  </button>
                ),
            )}
          </div>
        )}
        {war ? (
          <>
            <div className="spread wrap">
              <b>{s.fleet} loyal ships</b>
              <b className="bad">{rebelFleet(crisis)} rebel ships</b>
            </div>
            <div>Crown support: {crisis.score} / 70</div>
            <div className="muted">
              Ships and Command decide battles. Real ships are lost on both sides. One battle per cycle; Age Up also fights automatically. An empty loyal fleet
              loses the crown. Surviving rebel ships return to their original houses when the war ends.
            </div>
            <Btn kind="primary" reason={crisisBlocker(s, crisis.id, 'fight')} showReason onClick={() => act((d) => resolveCrisis(d, crisis.id, 'fight'))}>
              Fight for the crown
            </Btn>
          </>
        ) : (
          <>
            <div className="grid tight">
              <Btn kind="primary" reason={crisisBlocker(s, crisis.id, 'settle')} showReason onClick={() => act((d) => resolveCrisis(d, crisis.id, 'settle'))}>
                Settle the claim · {cost} credits
              </Btn>
              <Btn reason={crisisBlocker(s, crisis.id, 'hearing')} showReason onClick={() => act((d) => resolveCrisis(d, crisis.id, 'hearing'))}>
                Council hearing · {Math.round(hearingChance(s, crisis) * 100)}%
              </Btn>
              <Btn reason={crisisBlocker(s, crisis.id, 'hook')} showReason onClick={() => act((d) => resolveCrisis(d, crisis.id, 'hook'))}>
                Use a personal hook
              </Btn>
              <Btn
                kind="danger"
                reason={crisisBlocker(s, crisis.id, 'concede')}
                confirm={'Tap again: play as ' + claimant.name}
                onClick={() => act((d) => resolveCrisis(d, crisis.id, 'concede'))}
              >
                Concede the crown
              </Btn>
            </div>
            <div className="muted">
              A settlement costs {cost} credits and guarantees withdrawal. The hearing uses Diplomacy and living councillors' support, once only. A usable hook
              on the claimant forces withdrawal and is spent. Conceding costs 20% prestige and closes your reign.
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
