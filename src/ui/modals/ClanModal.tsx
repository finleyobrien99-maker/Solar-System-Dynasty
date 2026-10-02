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
import { Btn, CharCard, InfoDot, Modal, Opinion } from '../components';
import { useGame } from '../store';
import { MemoryList } from '../sections/GrudgeSection';
import { isRival } from '../../game/memory';

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
  const mine = clan.isPlayer;
  const atWar = s.wars.some((w) => w.enemy === id);

  return (
    <Modal title={`House ${clan.name}`} onClose={() => openClan(undefined)} wide>
      <div className="row top wrap" style={{ gap: 14 }}>
        <Sigil spec={clan.sigil} size={84} />
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="gold">{head ? clanTitle(s, id, head.gender) : ''}</div>
          <div className="muted" style={{ fontSize: '0.86rem' }}>
            {PLANET_BY_ID[clan.planetId].faction} · <span style={{ color: FAITHS[clan.faithId].color }}>{FAITHS[clan.faithId].name}</span> · founded {clan.founded}
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
          <div className="row wrap" style={{ marginTop: 4 }}>
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

      {!mine && (
        <div className="card flat" style={{ marginTop: 12 }}>
          <h4>
            Diplomacy <InfoDot text="Gifts raise opinion. Allies send 30% of their fleet to your wars. Viceroys and above can demand fealty from weaker clans. Insulting starts a blood feud: a free reason for war, both ways." />
          </h4>
          <div className="btn-row">
            <Btn small icon="gift" reason={(s.cooldowns[`gift:${id}`] ?? 0) > s.year ? 'Already sent this cycle' : s.credits < GIFT_COST ? 'Need 100 credits' : null} onClick={() => act((d) => sendGift(d, id))}>
              Send gift (100)
            </Btn>
            {clan.allied ? (
              <Btn small kind="ghost" confirm="Sure? -30 prestige" onClick={() => act((d) => breakAlliance(d, id))}>
                Break alliance
              </Btn>
            ) : (
              <Btn small icon="peace" reason={atWar ? 'At war' : (s.cooldowns[`ally:${id}`] ?? 0) > s.year ? 'Asked this cycle' : null} onClick={() => act((d) => proposeAlliance(d, id))}>
                Propose alliance ({Math.round(allianceChance(s, id) * 100)}%)
              </Btn>
            )}
            <Btn small icon="crown" reason={vassalizeBlocker(s, id)} onClick={() => act((d) => demandVassalage(d, id))}>
              Demand fealty ({Math.round(vassalizeChance(s, id) * 100)}%)
            </Btn>
            <Btn small kind="danger" reason={s.feuds.includes(id) ? 'Already feuding' : null} confirm="Tap again to insult" onClick={() => act((d) => insult(d, id))}>
              Insult
            </Btn>
          </div>
          <h4 style={{ marginTop: 10 }}>Schemes</h4>
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

      {!mine && (
        <div className="card flat" style={{ marginTop: 12 }}>
          <h4>What they remember</h4>
          <MemoryList clan={clan} />
        </div>
      )}

      <h4 style={{ marginTop: 14 }}>Members</h4>
      <div className="grid tight">
        {members.map((m) => (
          <CharCard key={m.id} c={m} size={46} traitsMax={3} sub={`${m.id === clan.headId ? 'Head of house · ' : ''}${ageOf(s, m)} yrs`} />
        ))}
      </div>
    </Modal>
  );
}
