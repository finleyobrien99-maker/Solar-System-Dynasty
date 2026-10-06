import { committedShips } from '../../game/coalitions';
import { CoalitionsSection } from '../sections/CoalitionsSection';
import { EnvoysSection } from '../sections/EnvoysSection';
import { WarParticipantsSection, type WarParticipantRow } from '../sections/WarParticipantsSection';
import { RealmDutiesSection } from '../sections/RealmDutiesSection';
import { SiegeSection } from '../sections/SiegeSection';
import { WarWearinessSection } from '../sections/WarWearinessSection';
import { truceOf, OATH_BREAK_COST } from '../../game/peace';
import { TrucesSection } from '../sections/TrucesSection';
import { ch, clanRank, clanRegions, clanTitle, fmt, liegeOf, playerClan, regionIncome, ruler, sovereignPlanets, vassalsOf } from '../../game/core';
import { fleetCap, UPKEEP_PER_SHIP } from '../../game/economy';
import {
  arrestChance,
  arrestVassal,
  executePrisoner,
  prisoners,
  ransomPrisoner,
  ransomValue,
  releasePrisoner,
  releaseVassal,
  sendGift,
  GIFT_COST,
} from '../../game/intrigue';
import { regencyActive } from '../../game/life';
import { FAITHS, PLANET_BY_ID } from '../../game/planets';
import {
  convertFaith,
  createViceroy,
  developBlocker,
  developCost,
  developRegion,
  EMPEROR_COST,
  EMPEROR_PLANETS,
  emperorBlocker,
  forgeSolarThrone,
  recruitShips,
  scrapShips,
  shipCost,
  VICEROY_COST,
  viceroyBlocker,
} from '../../game/realm';
import { canAfford } from '../../game/genetics';
import {
  canFightBattle,
  CB_INFO,
  declareIndependence,
  independenceBlocker,
  enemySide,
  fightBattle,
  offerPeace,
  peaceChance,
  playerSide,
  surrender,
  warLabel,
} from '../../game/war';
import { Icon } from '../../svg/Icons';
import { Sigil } from '../../svg/Sigil';
import { Btn, CharCard, ClanBadge, CostTag, InfoDot, Opinion, Section, WarBar } from '../components';
import { useGame } from '../store';
import { CouncilSection } from '../sections/CouncilSection';
import { TradeSection } from '../sections/TradeSection';
import { CommanderSection } from '../sections/CommanderSection';

const RANKS = ['Exile', 'Governor', 'Viceroy', 'Sovereign', 'Solar Emperor'];

export function RealmTab() {
  const { s, act, toast, setUi } = useGame();
  const r = ruler(s);
  const clan = playerClan(s);
  const rank = clanRank(s, clan.id);
  const regions = clanRegions(s, clan.id);
  const liege = liegeOf(s, clan.id);
  const vassals = vassalsOf(s, clan.id);
  const cap = fleetCap(s);
  const committed = committedShips(s, clan.id);
  const totalFleet = s.fleet + committed;
  const sc = shipCost(s);
  const regency = regencyActive(s);
  const jailed = prisoners(s);

  return (
    <div>
      <Section
        title="Titles"
        icon="crown"
        info="Ranks: Governor (1-2 regions) → Viceroy (create the title once you hold 3 regions) → Sovereign (seize a planet's throne-region, the one with the crown) → Solar Emperor (rule 3 throne-worlds and forge the Solar Throne). Each rank raises prestige income and fleet capacity."
      >
        <div className="card hl">
          <div className="spread">
            <div>
              <div className="gold" style={{ fontFamily: 'var(--head)', fontSize: 'var(--font-size-1_1rem)' }}>
                {clanTitle(s, clan.id, r.gender)}
              </div>
              <div className="muted">
                Rank {rank}: {RANKS[rank]}
              </div>
            </div>
            <div className="row wrap" style={{ gap: 'var(--space-4px)' }}>
              {RANKS.slice(1).map((n, i) => (
                <span key={n} className={`pill ${rank >= i + 1 ? 'gold' : ''}`}>
                  {n}
                </span>
              ))}
            </div>
          </div>
          <hr className="divider" />
          <div className="grid">
            {!clan.titles.viceroy && (
              <div className="stack" style={{ gap: 'var(--space-6px)' }}>
                <b>Create Viceroyalty</b>
                <span className="muted" style={{ fontSize: 'var(--font-size-0_82rem)' }}>
                  Hold 3+ regions. Unlocks demanding vassalage from lesser clans.
                </span>
                <div className="spread">
                  <Btn kind="primary" small reason={viceroyBlocker(s)} showReason onClick={() => act((d) => createViceroy(d))}>
                    Create title
                  </Btn>
                  <CostTag cost={VICEROY_COST} />
                </div>
              </div>
            )}
            {!clan.titles.emperor && (
              <div className="stack" style={{ gap: 'var(--space-6px)' }}>
                <b>Forge the Solar Throne</b>
                <span className="muted" style={{ fontSize: 'var(--font-size-0_82rem)' }}>
                  Rule the throne-regions of {EMPEROR_PLANETS} planets (you hold {sovereignPlanets(s, clan.id).length}).
                </span>
                <div className="spread">
                  <Btn kind="primary" small reason={emperorBlocker(s)} showReason onClick={() => act((d) => forgeSolarThrone(d))}>
                    Forge
                  </Btn>
                  <CostTag cost={EMPEROR_COST} />
                </div>
              </div>
            )}
            {liege && (
              <div className="stack" style={{ gap: 'var(--space-6px)' }}>
                <b>Your liege</b>
                <div className="row">
                  <ClanBadge clanId={liege} />
                  <Opinion v={s.clans[liege].opinion} />
                </div>
                <span className="muted" style={{ fontSize: 'var(--font-size-0_82rem)' }}>
                  You pay them 15% of your region income. They may summon you to war.
                </span>
                <Btn
                  small
                  kind="danger"
                  icon="war"
                  reason={independenceBlocker(s)}
                  showReason
                  onClick={() => act((d) => declareIndependence(d)) && toast('You declare independence!')}
                >
                  Declare independence
                </Btn>
                {truceOf(s, clan.id, liege) && (
                  <Btn
                    small
                    kind="danger"
                    reason={independenceBlocker(s, true)}
                    showReason
                    confirm={`Tap again: betray House ${s.clans[liege].name}`}
                    onClick={() => act((d) => declareIndependence(d, true)) && toast('You broke the truce and declared independence.')}
                  >
                    Break truce and revolt ({OATH_BREAK_COST} prestige)
                  </Btn>
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      <CouncilSection />

      <Section
        title={`Wars (${s.wars.length})`}
        icon="war"
        info="Win battles or siege operations to push the war score to +100 and take your prize. A manual battle and a siege operation share one allowance per war each cycle. At -100 you lose. The enemy also gets one operation every cycle. Wars that drag on 7 cycles end in a white peace. Coalition defenders lend actual ships, take their own losses and receive the survivors back."
      >
        {s.wars.length === 0 && <div className="empty">At peace. Declare war from the System tab by picking a region.</div>}
        <div className="stack">
          {s.wars.map((w) => {
            const enemy = s.clans[w.enemy];
            const me = playerSide(s, w, s.leadPersonally);
            const them = enemySide(s, w);
            const pc = peaceChance(s, w);
            return (
              <div key={w.id} className="card">
                <div className="spread">
                  <div className="row">
                    <Sigil spec={enemy.sigil} size={34} />
                    <div>
                      <b>{warLabel(s, w)}</b>
                      <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
                        {w.playerAttacker ? 'You attacked' : 'They attacked'} in {w.started} · {CB_INFO[w.cb].desc}
                      </div>
                    </div>
                  </div>
                  <span className={`pill ${w.score >= 0 ? 'green' : 'red'}`}>
                    Score {w.score > 0 ? '+' : ''}
                    {w.score}
                  </span>
                </div>
                <div style={{ margin: '10px 0' }}>
                  <WarBar score={w.score} />
                </div>
                <div className="cols" style={{ gap: 'var(--space-8px)', fontSize: 'var(--font-size-0_84rem)' }}>
                  <div>
                    <b className="good">Your side:</b> {me.ships} ships, strength ~{fmt(me.strength)}
                    {me.helpers.length > 0 && <div className="dim">{me.helpers.join(', ')}</div>}
                  </div>
                  <div>
                    <b className="bad">Their side:</b> {them.ships} ships, strength ~{fmt(them.strength)}
                    {them.helpers.length > 0 && <div className="dim">{them.helpers.join(', ')}</div>}
                  </div>
                </div>
                <WarParticipantsSection
                  title="Defenders"
                  defending={w.playerAttacker ? 'House ' + enemy.name : 'your house'}
                  rows={[
                    ...(w.realmCalls ?? []).map((a): WarParticipantRow => {
                      const loan = w.realmAid?.find((p) => p.clanId === a.clanId);
                      return {
                        clanId: a.clanId,
                        source: 'realm',
                        answer: a.answer,
                        reasons: a.reasons,
                        sent: loan?.sent ?? 0,
                        remaining: loan?.ships ?? 0,
                        role: a.role,
                        lost: loan?.lost,
                        returned: loan?.returned,
                        chance: a.chance > 0 && a.chance < 1 ? a.chance : undefined,
                        leaderId: loan?.commanderId,
                      };
                    }),
                    ...(w.coalition ?? []).map((loan): WarParticipantRow => ({
                      clanId: loan.clanId,
                      source: 'coalition',
                      answer: 'accepted',
                      reasons: [],
                      sent: loan.sent,
                      remaining: loan.ships,
                      lost: loan.lost,
                      returned: loan.returned,
                      leaderId: loan.commanderId,
                    })),
                  ]}
                />
                <div className="btn-row" style={{ marginTop: 'var(--space-10px)' }}>
                  <Btn
                    kind="primary"
                    icon="war"
                    reason={canFightBattle(s, w) ? null : s.fleet <= 0 ? 'No ships!' : 'Battle or siege operation already used this cycle'}
                    onClick={() => act((d) => fightBattle(d, w.id))}
                  >
                    Launch battle
                  </Btn>
                  <Btn
                    icon="peace"
                    reason={s.cooldowns[`peace:${w.id}`] === s.year ? 'Envoy already sent this cycle' : null}
                    onClick={() => act((d) => offerPeace(d, w.id))}
                  >
                    Offer peace ({Math.round(pc * 100)}%)
                  </Btn>
                  <Btn kind="danger" small confirm="Tap again to surrender" onClick={() => act((d) => surrender(d, w.id))}>
                    Surrender
                  </Btn>
                </div>
                <SiegeSection war={w} />
              </div>
            );
          })}
        </div>
      </Section>

      <EnvoysSection />
      <CoalitionsSection />
      <RealmDutiesSection />
      <WarWearinessSection />
      <TrucesSection />

      <Section
        title="Fleet"
        icon="fleet"
        info="Ships are your battle strength. Command adds 4% per point; Mars adds 15%; traits and flagships add more. Each ship costs 0.8 credits upkeep per cycle, including your ships committed to defence. Committed ships keep their place in your capacity and return on peace or withdrawal. Capacity grows with regions and rank."
      >
        <div className="card">
          <div className="spread">
            <div>
              <div style={{ fontFamily: 'var(--head)', fontSize: 'var(--font-size-1_4rem)' }} className="row">
                <Icon name="fleet" size={22} /> {totalFleet}{' '}
                <span className="muted" style={{ fontSize: 'var(--font-size-0_9rem)' }}>
                  / {cap} ships
                </span>
              </div>
              <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
                {s.fleet} ships at home{committed > 0 ? ` · ${committed} committed to defence` : ''}
                <br />
                {sc} credits per new ship · upkeep {Math.round(totalFleet * UPKEEP_PER_SHIP)}/cycle
              </div>
            </div>
            <div className="btn-row">
              <Btn
                small
                reason={totalFleet >= cap ? 'At capacity' : s.credits < sc * 10 ? 'Not enough credits' : null}
                onClick={() => toast(`Recruited ${act((d) => recruitShips(d, 10))} ships.`)}
              >
                +10 ({sc * 10})
              </Btn>
              <Btn
                small
                reason={totalFleet >= cap ? 'At capacity' : s.credits < sc ? 'Not enough credits' : null}
                onClick={() => toast(`Recruited ${act((d) => recruitShips(d, 50))} ships.`)}
              >
                +50
              </Btn>
              <Btn small kind="ghost" reason={s.fleet < 10 ? 'Too few ships' : null} onClick={() => act((d) => scrapShips(d, 10))}>
                Scrap 10
              </Btn>
            </div>
          </div>
          <hr className="divider" />
          <label className="row" style={{ gap: 'var(--space-8px)' }}>
            <input type="checkbox" checked={s.leadPersonally} onChange={(e) => act((d) => (d.leadPersonally = e.target.checked))} />
            <span>
              <b>Lead the fleet personally</b>
              <span className="muted"> (+15% strength and extra prestige in battles you launch, but your ruler can be wounded or killed)</span>
            </span>
          </label>
        </div>
      </Section>

      <CommanderSection />

      <TradeSection />

      <Section
        title={`Regions (${regions.length})`}
        icon="planet"
        info="Each region pays 20 + 12 × development credits per cycle, boosted by Economy. Developing costs 70 × current level, once per region per cycle."
      >
        <div className="grid tight">
          {regions.map((reg) => (
            <div key={reg.id} className="card flat" style={{ padding: 'var(--space-10px)' }}>
              <div className="spread">
                <b>
                  {reg.capital && <Icon name="crown" size={13} />} {reg.name}
                </b>
                <span className="pill">dev {reg.dev}</span>
              </div>
              <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
                {PLANET_BY_ID[reg.planetId].name} · {regionIncome(s, reg)} credits/cycle
              </div>
              <div className="spread" style={{ marginTop: 'var(--space-6px)' }}>
                <Btn small reason={developBlocker(s, reg.id)} onClick={() => act((d) => developRegion(d, reg.id))}>
                  Develop
                </Btn>
                {reg.dev < 10 && <CostTag cost={{ credits: developCost(reg.dev) }} />}
              </div>
            </div>
          ))}
        </div>
        {s.claims.length > 0 && (
          <div className="card flat" style={{ marginTop: 'var(--space-10px)' }}>
            <b>Claims</b> <InfoDot text="A claim is a free justification for war over that region. Get them by forging claims (Actions tab) or from events." />
            <div className="row wrap" style={{ marginTop: 'var(--space-6px)' }}>
              {s.claims.map((id) => (
                <button key={id} className="pill gold" onClick={() => setUi({ tab: 'system', planetId: s.regions[id].planetId, regionId: id })}>
                  {s.regions[id].name} ({PLANET_BY_ID[s.regions[id].planetId].name})
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section
        title={`Vassals (${vassals.length})`}
        icon="users"
        info="Vassals pay you 15% of their income (half if they dislike you, nothing below -50) and send 20% of their fleet to your wars if they like you. Below -40 opinion they may revolt."
      >
        {!vassals.length && <div className="empty">No vassals. Become a Sovereign or demand fealty as a Viceroy.</div>}
        <div className="grid">
          {vassals.map((v) => {
            const head = ch(s, v.headId);
            return (
              <div key={v.id} className="card flat" style={{ padding: 'var(--space-10px)' }}>
                <div className="spread">
                  <ClanBadge clanId={v.id} />
                  <Opinion v={v.opinion} />
                </div>
                <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)', margin: '4px 0' }}>
                  {head?.name} · {v.fleet} ships · {clanRegions(s, v.id).length} regions
                </div>
                <div className="btn-row">
                  <Btn
                    small
                    icon="gift"
                    reason={(s.cooldowns[`gift:${v.id}`] ?? 0) > s.year ? 'Sent this cycle' : s.credits < GIFT_COST ? 'Need 100 credits' : null}
                    onClick={() => act((d) => sendGift(d, v.id))}
                  >
                    Gift
                  </Btn>
                  <Btn
                    small
                    kind="danger"
                    reason={regency ? 'Regency' : head?.prisonerOf ? 'Already jailed' : null}
                    onClick={() => act((d) => arrestVassal(d, v.id))}
                    title="If it fails, they revolt"
                  >
                    Arrest ({Math.round(arrestChance(s, v.id) * 100)}%)
                  </Btn>
                  <Btn small kind="ghost" onClick={() => act((d) => releaseVassal(d, v.id))}>
                    Release
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {jailed.length > 0 && (
        <Section title="Prisoners" icon="chain">
          <div className="grid">
            {jailed.map((p) => (
              <CharCard
                key={p.id}
                c={p}
                extra={
                  <div className="btn-row" style={{ marginTop: 'var(--space-6px)' }} onClick={(e) => e.stopPropagation()}>
                    <Btn small kind="danger" confirm="Everyone will hear. Sure?" onClick={() => act((d) => executePrisoner(d, p.id))}>
                      Execute
                    </Btn>
                    <Btn small onClick={() => act((d) => ransomPrisoner(d, p.id))}>
                      Ransom ({ransomValue(s, p.id)})
                    </Btn>
                    <Btn small kind="good" onClick={() => act((d) => releasePrisoner(d, p.id))}>
                      Release
                    </Btn>
                  </div>
                }
              />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Faith"
        icon="faith"
        info="Your house's faith. Clans of the same faith like you more; different faiths can be attacked with a Holy War. Converting costs 200 faith and 100 prestige."
      >
        <div className="card">
          <div className="row" style={{ marginBottom: 'var(--space-8px)' }}>
            <span className="pill" style={{ color: FAITHS[clan.faithId].color }}>
              {FAITHS[clan.faithId].name}
            </span>
            <span className="muted" style={{ fontSize: 'var(--font-size-0_85rem)' }}>
              {FAITHS[clan.faithId].blurb}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
            Virtues: {FAITHS[clan.faithId].virtues.join(', ')} · Sins: {FAITHS[clan.faithId].sins.join(', ')}
          </div>
          <details style={{ marginTop: 'var(--space-8px)' }}>
            <summary className="muted">Convert to another faith</summary>
            <div className="grid tight" style={{ marginTop: 'var(--space-8px)' }}>
              {Object.values(FAITHS)
                .filter((f) => f.id !== clan.faithId)
                .map((f) => (
                  <div key={f.id} className="card flat" style={{ padding: 'var(--space-10px)' }}>
                    <b style={{ color: f.color }}>{f.name}</b>
                    <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)' }}>
                      {f.blurb}
                    </div>
                    <Btn
                      small
                      reason={canAfford(s, { faith: 200, prestige: 100 }) ? null : 'Need 200 faith + 100 prestige'}
                      confirm="Tap again to convert"
                      onClick={() => act((d) => convertFaith(d, f.id))}
                    >
                      Convert
                    </Btn>
                  </div>
                ))}
            </div>
          </details>
        </div>
      </Section>
    </div>
  );
}
