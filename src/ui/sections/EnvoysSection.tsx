// Envoys waiting (WAVE-5-DIPLOMACY.md slice 2): offers from AI houses that
// wait for your answer here instead of interrupting you. Weighty ones
// (defensive pacts, guarantees, tribute) also arrive as Envoys at Court.
// Answering goes through act(); offers lapse unanswered after a few cycles.
import { offerTerms } from '../../game/eventsDiplomacy';
import { answerTreaty, offerBlocker, offersToYou } from '../../game/treaties';
import { Btn, ClanBadge, Section } from '../components';
import { useGame } from '../store';

export function EnvoysSection() {
  const { s, act, toast } = useGame();
  const offers = offersToYou(s);
  if (!offers.length) return null;
  return (
    <Section
      title={`Envoys waiting (${offers.length})`}
      icon="peace"
      info="Houses send envoys with offers. Answer when it suits you: an offer lapses if left too long. Accepting binds you to its terms; declining is always allowed, and a little resented."
    >
      <div className="stack" style={{ overflowWrap: 'anywhere' }}>
        {offers.map((p) => (
          <div key={p.id} className="card flat stack" aria-label={`Offer from House ${s.clans[p.from]?.name ?? 'unknown'}`}>
            <div className="spread wrap">
              <ClanBadge clanId={p.from} />
              <span className="muted">waits until {p.expires}</span>
            </div>
            <div>{offerTerms(s, p)}</div>
            <div className="btn-row">
              <Btn
                small
                kind="primary"
                reason={offerBlocker(s, p.id)}
                onClick={() => {
                  if (act((d) => answerTreaty(d, p.id, true))) toast('Agreed. It is on record now.');
                }}
              >
                Accept
              </Btn>
              <Btn small kind="ghost" onClick={() => act((d) => answerTreaty(d, p.id, false))}>
                Decline
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
