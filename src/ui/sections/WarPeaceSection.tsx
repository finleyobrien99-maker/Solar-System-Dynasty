import { acceptPeace, peaceTerms, peaceOfferBlocker } from '../../game/peace';
import { goalLabel } from '../../game/warGoals';
import { offerPeace } from '../../game/war';
import type { War } from '../../game/types';
import { Btn } from '../components';
import { useGame } from '../store';

export function WarPeaceSection({ war }: { war: War }) {
  const { s, act } = useGame();
  if (!war.goal) return null;
  const options = peaceTerms(s, war);
  const incoming = war.peaceOffer;
  const incomingBlocker = incoming ? peaceOfferBlocker(s, war.id) : null;
  const label =
    incoming?.terms.kind === 'goal'
      ? goalLabel(s, incoming.terms.goal)
      : incoming?.terms.kind === 'reparations'
        ? 'Reparations: up to ' + incoming.terms.amount + ' credits to House ' + s.clans[incoming.terms.winner]?.name
        : 'White peace';
  return (
    <div className="stack" style={{ gap: 'var(--space-8px)', marginTop: 'var(--space-12px)', minWidth: 0 }}>
      <p className="gold" style={{ margin: 0 }}>
        War goal: {goalLabel(s, war.goal)}
      </p>
      {incoming ? (
        <div className="card flat stack" aria-label="Incoming peace offer">
          <b>Peace offered by House {s.clans[incoming.from]?.name}</b>
          <p>
            {label}. This exact offer expires in {Math.max(0, incoming.expires - s.year)} cycles. Payments are capped by the payer’s treasury when accepted.
          </p>
          <div className="btn-row">
            <Btn reason={incomingBlocker} icon="peace" confirm="Tap again to accept these terms" onClick={() => act((d) => acceptPeace(d, war.id, true))}>
              Accept peace terms
            </Btn>
            <Btn reason={incomingBlocker} kind="ghost" onClick={() => act((d) => acceptPeace(d, war.id, false))}>
              Refuse peace terms
            </Btn>
          </div>
        </div>
      ) : (
        <details>
          <summary>Negotiate peace</summary>
          <p className="muted">
            One envoy per war each cycle. A rejected offer still uses that envoy. Victory enforces the saved goal; white peace gives nobody the goal.
          </p>
          {options.map((o, i) => (
            <div key={i} className="card flat stack" style={{ gap: 'var(--space-6px)' }}>
              <b>{o.label}</b>
              <span>Acceptance: {Math.round(o.chance * 100)}%</span>
              <ul className="muted">
                {o.reasons.map((r, j) => (
                  <li key={j}>{r}</li>
                ))}
              </ul>
              <Btn
                small
                icon="peace"
                reason={o.blocker ?? (s.cooldowns['peace:' + war.id] === s.year ? 'Envoy already sent this cycle' : null)}
                onClick={() => act((d) => offerPeace(d, war.id, o.terms))}
              >
                Offer {o.label.toLowerCase()}
              </Btn>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
