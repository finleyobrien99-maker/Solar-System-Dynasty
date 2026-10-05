import { conductSiege, siegeOptions } from '../../game/war';
import type { War } from '../../game/types';
import { Btn, ClanBadge } from '../components';
import { useGame } from '../store';

const NAMES = { starve: 'Starve them out', assault: 'Assault the walls', bribe: 'Bribe a gate', sabotage: 'Sabotage the walls' };

export function SiegeSection({ war }: { war: War }) {
  const { s, act, openChar } = useGame();
  const last = war.siege;
  if (!war.target || !s.regions[war.target] || war.cb === 'independence' || war.cb === 'revolt') return null;
  const options = war.playerAttacker ? siegeOptions(s, war.id) : [];
  return (
    <div className="stack" style={{ marginTop: 'var(--space-12px)' }}>
      <h3 style={{ margin: 0 }}>Siege at {s.regions[war.target].name}</h3>
      {last && (
        <div className={`card flat stack ${last.success ? '' : 'bad'}`} aria-label="Last siege operation">
          <b>
            {NAMES[last.kind]} · {last.success ? 'Succeeded' : 'Failed'} in {last.year}
          </b>
          <div className="row wrap">
            <ClanBadge clanId={last.attacker} />
            {last.leaderId && s.characters[last.leaderId] && (
              <Btn small kind="ghost" onClick={() => openChar(last.leaderId)}>
                Led by {s.characters[last.leaderId].name}
              </Btn>
            )}
          </div>
          <div>
            Spent {last.cost} credits · Lost {last.losses} ships · Attacker progress {last.progress > 0 ? '+' : ''}
            {last.progress}
          </div>
        </div>
      )}
      {war.playerAttacker ? (
        <>
          <div className="muted">
            Choose one operation or launch one battle each cycle. Siege choices unlock at +25 war score with at least 10 ships at home.
          </div>
          <div className="grid tight">
            {options.map((o) => (
              <div className="card flat stack" key={o.kind}>
                <b>{o.name}</b>
                <div className="muted">{o.desc}</div>
                <div>
                  {o.cost ? `${o.cost} credits` : 'No credit fee'} · {Math.round(o.chance * 100)}% {o.kind === 'assault' ? 'strength share' : 'success'}
                </div>
                <div className="muted">
                  Success: +{o.progressMin}–{o.progressMax} progress · {Math.round(o.lossMin * 100)}–{Math.round(o.lossMax * 100)}% fleet loss
                </div>
                <Btn
                  small
                  kind={o.kind === 'assault' ? 'danger' : 'primary'}
                  reason={o.ok ? null : (o.reason ?? 'Unavailable')}
                  showReason
                  confirm={o.kind === 'assault' ? 'Tap again to assault' : undefined}
                  onClick={() => act((d) => conductSiege(d, war.id, o.kind))}
                >
                  {o.name}
                </Btn>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="muted">Your enemy is the attacker. Their siege choices share their battle allowance for the cycle.</div>
      )}
    </div>
  );
}
