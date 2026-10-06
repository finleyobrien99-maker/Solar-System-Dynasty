// Diplomacy with one house (WAVE-5-DIPLOMACY.md slice 2): how it regards you
// and why, how far each side trusts the other, the treaties between you, and
// what you could offer, with the odds. Reading it never changes the game;
// offers and breaches go through act(). For your own house it lists every
// treaty you hold. Mount it in the house profile (ClanModal).
import { houseRelation, treatyName, trustOf } from '../../game/houseRelations';
import type { TreatyKind } from '../../game/diplomacyTypes';
import { breakTreaty, breakTreatyBlocker, proposeTreaty, termsFor, treatiesOf, treatyAcceptance, treatyBlocker, tradeIncomeOf } from '../../game/treaties';
import {
  demandableRegion,
  issueUltimatum,
  predecessorTreaty,
  repudiateBlocker,
  repudiateTreaty,
  rivalsOf,
  risingPower,
  stanceOf,
  STANCE_NAME,
  ultimatumAcceptance,
  tributeDemand,
  ultimatumBlocker,
  type Demand,
} from '../../game/foreignPolicy';
import { Btn, ClanBadge, Opinion, Section } from '../components';
import { useGame } from '../store';

const OFFERS: { kind: TreatyKind; label: string; stronger?: 'you' | 'them' }[] = [
  { kind: 'nonAggression', label: 'Non-aggression pact' },
  { kind: 'defensive', label: 'Defensive pact' },
  { kind: 'trade', label: 'Trade agreement' },
  { kind: 'guarantee', label: 'Guarantee their independence', stronger: 'you' },
  { kind: 'tribute', label: 'Demand tribute', stronger: 'you' },
];

const INFO =
  'Every house regards every other, for reasons it will tell you. Treaties have terms and an end: a non-aggression pact stops either side declaring war, a defensive pact (or a guarantee, or tribute you are paid) obliges you to defend them when attacked, and trade pays both sides each cycle. Trust grows while promises are kept. Breaking a promise costs the victim’s trust, a little of every house’s, and prestige. AI houses make and break treaties with each other by the same rules.';

export function HouseDiplomacySection({ clanId }: { clanId: string }) {
  const { s, act, toast } = useGame();
  const me = s.playerClanId;
  if (!s.clans[clanId]) return null;

  if (clanId === me) {
    const mine = treatiesOf(s, me);
    return (
      <Section title="Your treaties" icon="peace" info={INFO}>
        <div className="card flat stack" style={{ overflowWrap: 'anywhere' }}>
          {mine.length ? (
            mine.map((t) => {
              const other = t.a === me ? t.b : t.a;
              return (
                <div key={t.id} className="spread wrap">
                  <span className="row wrap" style={{ gap: 'var(--space-6px)', minWidth: 0, maxWidth: '100%' }}>
                    <b>{treatyName(t.kind)}</b> with <ClanBadge clanId={other} />
                  </span>
                  <span className="muted">until {t.until}</span>
                </div>
              );
            })
          ) : (
            <div className="muted">You hold no treaties. Open a house to make an offer.</div>
          )}
        </div>
      </Section>
    );
  }

  const theirs = houseRelation(s, clanId, me);
  const stance = stanceOf(s, clanId, me);
  const rivals = rivalsOf(s, clanId, me);
  const region = demandableRegion(s, clanId);
  const tribute = tributeDemand(s, clanId);
  const demands: { label: string; demand: Demand }[] = [
    ...(region ? [{ label: `Hand over ${region.name} or face war`, demand: { kind: 'cede', regionId: region.id } as Demand }] : []),
    { label: `Pay ${tribute.amount} credits a cycle or face war`, demand: tribute },
  ];
  const between = treatiesOf(s, me).filter((t) => t.a === clanId || t.b === clanId);
  const trustThem = trustOf(s, clanId, me),
    trustYou = trustOf(s, me, clanId);
  return (
    <Section title="Diplomacy" icon="peace" info={INFO}>
      <div className="card flat stack" style={{ overflowWrap: 'anywhere' }}>
        {stance && (
          <div>
            <b>{STANCE_NAME[stance.kind]}</b>
            {risingPower(s, clanId) && (
              <span className="pill red" style={{ marginLeft: 'var(--space-6px)' }}>
                Rising power
              </span>
            )}
            <div className="dim">{stance.reasons.map((r) => r.label).join(' · ')}</div>
          </div>
        )}
        {rivals.length > 0 && (
          <div>
            <span>Rivals: </span>
            <span className="dim">
              {rivals
                .map(
                  (r) =>
                    `${r.id === me ? 'You' : `House ${s.clans[r.id]?.name}`} (${r.reasons.map((x) => (x.value === undefined ? x.label : `${x.label} ${x.value}`)).join(', ')})`,
                )
                .join(' · ')}
            </span>
          </div>
        )}
        <div className="spread wrap">
          <span>How they regard you</span>
          <Opinion v={theirs.value} />
        </div>
        {theirs.reasons.length > 0 && (
          <div className="dim">{theirs.reasons.map((r) => `${r.label} (${(r.value ?? 0) > 0 ? '+' : ''}${r.value ?? 0})`).join(' · ')}</div>
        )}
        <div className="muted">
          Their trust in you: {trustThem > 0 ? '+' : ''}
          {trustThem} · Yours in them: {trustYou > 0 ? '+' : ''}
          {trustYou}
        </div>

        {between.length > 0 && (
          <div className="stack" style={{ gap: 'var(--space-6px)' }}>
            <b>Treaties between you</b>
            {between.map((t) => (
              <div key={t.id} className="spread wrap">
                <span>
                  {treatyName(t.kind)}
                  {t.kind === 'trade' ? `: +${tradeIncomeOf(s, t)} credits a cycle` : ''}
                  {t.kind === 'tribute' ? `: ${t.amount} credits a cycle ${t.a === me ? 'to you' : 'from you'}` : ''}
                  <span className="muted"> · until {t.until}</span>
                </span>
                <span className="row wrap" style={{ gap: 'var(--space-6px)' }}>
                  {predecessorTreaty(s, t.id) && (
                    <Btn
                      small
                      reason={repudiateBlocker(s, t.id)}
                      confirm="Tap again: repudiate your predecessor’s treaty"
                      onClick={() => act((d) => repudiateTreaty(d, t.id))}
                    >
                      Repudiate
                    </Btn>
                  )}
                  <Btn
                    small
                    kind="danger"
                    reason={breakTreatyBlocker(s, me, t.id)}
                    confirm="Tap again: everyone will hear of it"
                    onClick={() => act((d) => breakTreaty(d, d.playerClanId, t.id))}
                  >
                    Break it
                  </Btn>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="stack" style={{ gap: 'var(--space-6px)' }}>
          <b>Press a demand</b>
          <div className="dim" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
            If they refuse, they will remember it.
          </div>
          {demands.map((d) => {
            const block = ultimatumBlocker(s, me, clanId, d.demand);
            const odds = block ? undefined : ultimatumAcceptance(s, me, clanId, d.demand);
            return (
              <div key={d.demand.kind} className="stack" style={{ gap: 'var(--space-2px)' }}>
                <div className="spread wrap">
                  <span>{d.label}</span>
                  <Btn
                    small
                    kind="danger"
                    reason={block}
                    confirm="Tap again: send the ultimatum"
                    onClick={() => {
                      const result = act((x) => issueUltimatum(x, x.playerClanId, clanId, d.demand));
                      toast(result === 'yielded' ? 'They give in.' : result === 'refused' ? 'They refuse.' : 'Your envoys were turned away.');
                    }}
                  >
                    {odds ? `Demand (${Math.round(odds.chance * 100)}%)` : 'Demand'}
                  </Btn>
                </div>
                {odds && (
                  <div className="dim" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
                    {odds.reasons.map((r) => `${r.label} (${(r.value ?? 0) > 0 ? '+' : ''}${r.value ?? 0}%)`).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="stack" style={{ gap: 'var(--space-6px)' }}>
          <b>Make an offer</b>
          {OFFERS.map((o) => {
            const terms = termsFor(s, o.kind, me, clanId, o.stronger === 'you' ? me : clanId);
            const block = treatyBlocker(s, me, clanId, terms);
            const odds = block ? undefined : treatyAcceptance(s, me, clanId, terms);
            return (
              <div key={o.kind} className="stack" style={{ gap: 'var(--space-2px)' }}>
                <div className="spread wrap">
                  <span>
                    {o.label}
                    <span className="muted"> · {terms.years} cycles</span>
                  </span>
                  <Btn
                    small
                    reason={block}
                    onClick={() => {
                      const result = act((d) =>
                        proposeTreaty(d, d.playerClanId, clanId, termsFor(d, o.kind, d.playerClanId, clanId, o.stronger === 'you' ? d.playerClanId : clanId)),
                      );
                      toast(result === 'signed' ? `${o.label}: agreed.` : result === 'refused' ? `${o.label}: they decline.` : 'Your envoys were turned away.');
                    }}
                  >
                    {odds ? `Offer (${Math.round(odds.chance * 100)}%)` : 'Offer'}
                  </Btn>
                </div>
                {odds && (
                  <div className="dim" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
                    {odds.reasons.map((r) => `${r.label} (${(r.value ?? 0) > 0 ? '+' : ''}${r.value ?? 0}%)`).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
