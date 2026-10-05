import { clanRegions } from '../../game/core';
import { coalitionOf, coalitionPledgeBlocker, joinCoalition, leaveCoalition, threatOf } from '../../game/coalitions';
import { Btn, ClanBadge, Section } from '../components';
import { useGame } from '../store';

export function CoalitionsSection({ clanId }: { clanId?: string }) {
  const { s, act } = useGame();
  const id = clanId ?? s.playerClanId;
  const threat = threatOf(s, id);
  const against = coalitionOf(s, id);
  const targets = clanId
    ? s.coalitions.filter((c) => c.target === id || c.members.includes(id))
    : Object.values(s.clans)
        .filter((c) => c.id !== s.playerClanId && clanRegions(s, c.id).length && (threatOf(s, c.id) >= 30 || coalitionOf(s, c.id)))
        .map((c) => coalitionOf(s, c.id) ?? { target: c.id, members: [], formed: s.year });
  const aid = [
    ...s.wars.map((w) => ({ ...w, attacker: w.playerAttacker ? s.playerClanId : w.enemy, defender: w.playerAttacker ? w.enemy : s.playerClanId })),
    ...s.aiWars,
  ];
  const visible = [...(against && !targets.some((c) => c.target === id) ? [against] : []), ...targets];

  return (
    <Section
      title="Threat and coalitions"
      icon="war"
      info="Taking land builds a house's public threat, including AI conquests. Threat belongs to the house and survives succession. Threatened rulers may pledge to defend one another. These are defensive promises: a new territorial attack calls real ships from each eligible member's home fleet, and the survivors return when the campaign ends. Your house only joins through your explicit pledge."
    >
      <div className="card flat stack">
        <div className="spread wrap">
          <b>{threat}/100 threat</b>
          <span className={threat >= 60 ? 'bad' : threat >= 30 ? 'gold' : 'muted'}>
            {threat >= 60 ? 'The wider system is watching.' : threat >= 30 ? 'Neighbours fear another conquest.' : 'No alarm across the system.'}
          </span>
        </div>
        <progress aria-label={clanId ? 'House threat' : 'Your house threat'} max={100} value={threat} style={{ width: '100%' }} />
        <div className="muted">
          Land taken in war raises threat; beginning a cycle without an offensive campaign lowers it. Defenders keep their own commanders and bear their own
          losses.
        </div>
      </div>
      {!visible.length && <div className="empty">{clanId ? 'This house has no current coalition pledges.' : 'No coalition calls for your pledge yet.'}</div>}
      <div className="grid">
        {visible.map((c) => {
          const target = s.clans[c.target];
          if (!target) return null;
          const pledged = c.members.includes(s.playerClanId);
          return (
            <div className="card flat stack" key={c.target}>
              <div className="spread wrap">
                <div>
                  <span className="muted">Defence against</span>
                  <ClanBadge clanId={target.id} />
                </div>
                <span className={target.id === s.playerClanId ? 'pill red' : 'pill'}>{threatOf(s, target.id)}/100 threat</span>
              </div>
              <div className="muted">
                {c.members.length
                  ? `Pledged since ${c.formed} · ${c.members.length} ${c.members.length === 1 ? 'house' : 'houses'}`
                  : 'No houses have pledged yet.'}
              </div>
              {aid
                .filter((w) => w.attacker === c.target && w.coalition?.some((p) => p.clanId === id && p.ships > 0))
                .map((w) => (
                  <div className="card flat stack" key={w.id}>
                    <b>{w.coalition!.find((p) => p.clanId === id)!.ships} ships committed</b>
                    <div className="row wrap">
                      <span>Defending</span>
                      <ClanBadge clanId={w.defender} />
                      <span>at {s.regions[w.target]?.name ?? 'the campaign target'}</span>
                    </div>
                  </div>
                ))}
              {!!c.members.length && (
                <div className="row wrap" aria-label={`Coalition against House ${target.name}`}>
                  {c.members.map((member) => (
                    <ClanBadge key={member} clanId={member} />
                  ))}
                </div>
              )}
              {target.id === s.playerClanId ? (
                <div className="bad">A new territorial attack can bring these defenders into the war.</div>
              ) : (
                <>
                  <div className={pledged ? 'good' : 'muted'}>
                    {pledged
                      ? 'You have pledged defence. A new attack may detach half your available ships; survivors return at peace or when you withdraw your pledge.'
                      : 'Pledge to lend half your available ships if this house starts a new territorial war.'}
                  </div>
                  <div className="btn-row">
                    {pledged ? (
                      <Btn small kind="ghost" confirm="Tap again to withdraw your pledge" onClick={() => act((d) => leaveCoalition(d, target.id))}>
                        Withdraw pledge and recall ships
                      </Btn>
                    ) : (
                      <Btn
                        small
                        kind="primary"
                        reason={coalitionPledgeBlocker(s, target.id)}
                        showReason
                        confirm={`Tap again to pledge against House ${target.name}`}
                        onClick={() => act((d) => joinCoalition(d, target.id))}
                      >
                        Pledge defence
                      </Btn>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
