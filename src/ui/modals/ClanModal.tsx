import { ageOf, alive, ch, clanRank, clanRegions, clanTitle, liegeOf } from '../../game/core';
import {
  allianceChance,
  breakAlliance,
  demandVassalage,
  GIFT_COST,
  insult,
  proposeAlliance,
  runScheme,
  schemeBlocker,
  schemeChance,
  sendGift,
  vassalizeBlocker,
  vassalizeChance,
} from '../../game/intrigue';
import { FAITHS, PLANET_BY_ID } from '../../game/planets';
import { Sigil } from '../../svg/Sigil';
import { Btn, CharCard, InfoDot, Modal, Opinion, Section, TraitChip } from '../components';
import { useGame } from '../store';
import { MemoryList } from '../sections/GrudgeSection';
import { successionCrisis, rebelFleet } from '../../game/succession';
import { AmbitionRecord } from '../sections/AmbitionSection';
import { isRival } from '../../game/memory';
import { aiAmbition } from '../../game/aiAmbition';
import { pactsOf } from '../../game/aiCourt';
import { TRAITS } from '../../game/traits';

export function ClanModal({ id }: { id: string }) {
  const { s, act, openClan, setUi } = useGame();
  const clan = s.clans[id];
  if (!clan) return null;
  const head = ch(s, clan.headId);
  const regions = clanRegions(s, id);
  const liege = liegeOf(s, id);
  const members = Object.values(s.characters)
    .filter((c) => alive(c) && (c.clanId === id || (c.spouseId && s.characters[c.spouseId]?.clanId === id && c.marriedIn)))
    .sort((a, b) => (a.id === clan.headId ? -1 : b.id === clan.headId ? 1 : a.born - b.born))
    .slice(0, 12);
  const pastRulers = Object.values(s.characters)
    .filter((c) => c.id !== clan.headId && c.reputation?.houses.includes(id) && c.reputation.earned.length)
    .sort((a, b) => (b.died ?? s.year) - (a.died ?? s.year));
  const mine = clan.isPlayer;
  const atWar = s.wars.some((w) => w.enemy === id);
  const ambition = aiAmbition(s, clan);
  const crisis = successionCrisis(s, id);
  const kin = [...pactsOf(s, id)].map((k) => s.clans[k]);

  return (
    <Modal title={`House ${clan.name}`} onClose={() => openClan(undefined)} wide>
      {crisis && (
        <div className="card flat bad" style={{ marginBottom: 'var(--space-12px)' }}>
          {ch(s, crisis.claimantId)?.name} contests the crown.{' '}
          {crisis.stage === 'civil-war' ? 'Civil war: ' + rebelFleet(crisis) + ' rebel ships.' : 'Settlement deadline: ' + crisis.deadline + '.'}
        </div>
      )}
      {head?.ambition && <AmbitionRecord c={head} />}
      <div className="row top wrap" style={{ gap: 'var(--space-14px)' }}>
        <Sigil spec={clan.sigil} size={84} />
        <div className="grow stack" style={{ gap: 'var(--space-4px)' }}>
          <div className="gold">{head ? clanTitle(s, id, head.gender) : ''}</div>
          <div className="muted" style={{ fontSize: 'var(--font-size-0_86rem)' }}>
            {PLANET_BY_ID[clan.planetId].faction} · <span style={{ color: FAITHS[clan.faithId].color }}>{FAITHS[clan.faithId].name}</span> · founded{' '}
            {clan.founded}
          </div>
          <div className="row wrap">
            {!mine && <Opinion v={clan.opinion} />}
            <span className="pill">{clan.fleet} ships</span>
            <span className="pill">{regions.length} regions</span>
            <span className="pill">rank {clanRank(s, id)}</span>
            {clan.allied && <span className="pill green">Allied</span>}
            {liege && <span className="pill cyan">Vassal of {s.clans[liege].name}</span>}
            {atWar && <span className="pill red">At war with you</span>}
            {clan.cadetOf === s.playerClanId && <span className="pill gold">Cadet branch of your bloodline</span>}
            {isRival(clan) && <span className="pill red">Sworn rival</span>}
          </div>
          {!mine && head && (
            <div className="muted" style={{ fontSize: 'var(--font-size-0_86rem)' }}>
              {head.name}'s ambition: {ambition.text}
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 'var(--space-4px)' }}>
            {regions.map((r) => (
              <button
                key={r.id}
                className="pill"
                onClick={() => {
                  openClan(undefined);
                  setUi({ tab: 'system', planetId: r.planetId, regionId: r.id });
                }}
              >
                {r.capital ? '♛ ' : ''}
                {r.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!!kin.length && (
        <Section
          title={`Marriage ties (${kin.length})`}
          icon="heart"
          info="A ruler's or their children's or siblings' marriage into another ruling family binds the houses. Kin send 25% of their fleet in defence and 15% in attack; kin of both sides stay home. Ties end as the family links die out. Deceitful or ambitious rulers who hate their kin may betray the pact."
        >
          <div className="row wrap">
            {kin.map((k) => (
              <button
                key={k.id}
                className="pill"
                style={{ whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%', overflowWrap: 'anywhere' }}
                onClick={() => openClan(k.id)}
              >
                Bound by marriage to House {k.name}
              </button>
            ))}
          </div>
        </Section>
      )}
      {!mine && (
        <div className="card flat" style={{ marginTop: 'var(--space-12px)' }}>
          <h4>
            Diplomacy{' '}
            <InfoDot text="Gifts raise opinion. Allies send 30% of their fleet to your wars. Viceroys and above can demand fealty from weaker clans. Insulting starts a blood feud: a free reason for war, both ways." />
          </h4>
          <div className="btn-row">
            <Btn
              small
              icon="gift"
              reason={(s.cooldowns[`gift:${id}`] ?? 0) > s.year ? 'Already sent this cycle' : s.credits < GIFT_COST ? 'Need 100 credits' : null}
              onClick={() => act((d) => sendGift(d, id))}
            >
              Send gift (100)
            </Btn>
            {clan.allied ? (
              <Btn small kind="ghost" confirm="Sure? -30 prestige" onClick={() => act((d) => breakAlliance(d, id))}>
                Break alliance
              </Btn>
            ) : (
              <Btn
                small
                icon="peace"
                reason={atWar ? 'At war' : (s.cooldowns[`ally:${id}`] ?? 0) > s.year ? 'Asked this cycle' : null}
                onClick={() => act((d) => proposeAlliance(d, id))}
              >
                Propose alliance ({Math.round(allianceChance(s, id) * 100)}%)
              </Btn>
            )}
            <Btn small icon="crown" reason={vassalizeBlocker(s, id)} onClick={() => act((d) => demandVassalage(d, id))}>
              Demand fealty ({Math.round(vassalizeChance(s, id) * 100)}%)
            </Btn>
            <Btn
              small
              kind="danger"
              reason={s.feuds.includes(id) ? 'Already feuding' : null}
              confirm="Tap again to insult"
              onClick={() => act((d) => insult(d, id))}
            >
              Insult
            </Btn>
          </div>
          <h4 style={{ marginTop: 'var(--space-10px)' }}>Schemes</h4>
          <div className="btn-row">
            <Btn small reason={schemeBlocker(s, 'sway', id)} onClick={() => act((d) => runScheme(d, 'sway', id))}>
              Sway ({Math.round(schemeChance(s, 'sway', id) * 100)}%)
            </Btn>
            <Btn small reason={schemeBlocker(s, 'blackmail', id)} onClick={() => act((d) => runScheme(d, 'blackmail', id))}>
              Blackmail ({Math.round(schemeChance(s, 'blackmail', id) * 100)}%)
            </Btn>
            <Btn small kind="danger" reason={schemeBlocker(s, 'sabotage', id)} onClick={() => act((d) => runScheme(d, 'sabotage', id))}>
              Sabotage ({Math.round(schemeChance(s, 'sabotage', id) * 100)}%)
            </Btn>
          </div>
        </div>
      )}

      {!mine && clan.genetics && (
        <details className="card flat" style={{ marginTop: 'var(--space-12px)' }}>
          <summary>Bloodline programme</summary>
          <div className="stack" style={{ gap: 'var(--space-8px)', marginTop: 'var(--space-8px)' }}>
            <div className="row wrap">
              <span className="pill">
                Vault: {clan.genetics.locked.length + clan.genetics.purged.length}/{clan.genetics.slots} slots
              </span>
              <span className="pill">{['No Gene-Forge', 'Gene-Forge', 'Gene-Forge and vats'][clan.genetics.forge.level]}</span>
            </div>
            <div>
              <b>Locked genes</b>
              <div className="row wrap">
                {clan.genetics.locked.length ? clan.genetics.locked.map((t) => <TraitChip key={t} id={t} />) : <span className="muted">None yet</span>}
              </div>
            </div>
            <div>
              <b>Purged genes</b>
              <div className="row wrap">
                {clan.genetics.purged.length ? clan.genetics.purged.map((t) => <TraitChip key={t} id={t} />) : <span className="muted">None yet</span>}
              </div>
            </div>
            {clan.genetics.forge.project && (
              <p className="muted">
                Sequencing {TRAITS[clan.genetics.forge.project.trait]?.name}: {Math.round(clan.genetics.forge.project.progress)}/
                {clan.genetics.forge.project.needed} research points. Upkeep: 40 credits per cycle.
              </p>
            )}
            {!!clan.genetics.forge.researched.length && (
              <div>
                <b>Sequenced genes</b>
                <div className="row wrap">
                  {clan.genetics.forge.researched.map((t) => (
                    <TraitChip key={t} id={t} />
                  ))}
                </div>
              </div>
            )}
            <p className="muted">
              Their treasury pays standard vault and Forge costs. Splices can fail, and condemning rulers resent gene-forging. These institutions pass to the
              next head of house.
            </p>
          </div>
        </details>
      )}
      {!mine && (
        <div className="card flat" style={{ marginTop: 'var(--space-12px)' }}>
          <h4>What they remember</h4>
          <MemoryList clan={clan} />
        </div>
      )}

      <h4 style={{ marginTop: 'var(--space-14px)' }}>Members</h4>
      <div className="grid tight">
        {members.map((m) => (
          <CharCard key={m.id} c={m} size={46} traitsMax={3} sub={`${m.id === clan.headId ? 'Head of house · ' : ''}${ageOf(s, m)} yrs`} />
        ))}
      </div>
      {!!pastRulers.length && (
        <details className="card flat" style={{ marginTop: 'var(--space-14px)' }}>
          <summary>Past named rulers ({pastRulers.length})</summary>
          <div className="grid tight">
            {pastRulers.map((c) => (
              <CharCard key={c.id} c={c} size={44} traitsMax={2} sub={c.died === undefined ? 'Former ruler' : `Died ${c.died}`} />
            ))}
          </div>
        </details>
      )}
    </Modal>
  );
}
