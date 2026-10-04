import { ch, clanRank, clanRegions, liegeOf, planetRegions, planetSovereign } from '../../game/core';
import { runScheme, schemeBlocker, schemeChance } from '../../game/intrigue';
import { FAITHS, PLANET_BY_ID } from '../../game/planets';
import { CB_INFO, cbOptions, declareWar, warBlocker } from '../../game/war';
import { clanPower } from '../../game/war';
import { Icon } from '../../svg/Icons';
import { PlanetArt } from '../../svg/PlanetArt';
import { PlanetMap } from '../../svg/PlanetMap';
import { Sigil } from '../../svg/Sigil';
import { SolarMap } from '../../svg/SolarMap';
import { Btn, CostTag, Face, InfoDot, Opinion, Section } from '../components';
import { useGame } from '../store';
import { GrudgeSection } from '../sections/GrudgeSection';
import { isRival } from '../../game/memory';

function RegionPanel({ regionId }: { regionId: string }) {
  const { s, act, toast, openClan } = useGame();
  const reg = s.regions[regionId];
  const owner = s.clans[reg.owner];
  const mine = reg.owner === s.playerClanId;
  const block = warBlocker(s, reg);
  const opts = cbOptions(s, reg);
  const fab = schemeBlocker(s, 'fabricate', reg.id);
  return (
    <div className="card hl">
      <div className="spread">
        <div>
          <h3 style={{ margin: 0 }}>
            {reg.capital && <Icon name="crown" size={14} />} {reg.name}
          </h3>
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            {PLANET_BY_ID[reg.planetId].name} · development {reg.dev}
            {reg.capital ? ' · Throne-region: whoever holds it rules the planet' : ''}
          </div>
        </div>
        <button className="row" style={{ background: 'none', border: 0, gap: 6 }} onClick={() => openClan(owner.id)}>
          <Sigil spec={owner.sigil} size={30} />
          <b>House {owner.name}</b>
        </button>
      </div>
      {mine ? (
        <div className="good" style={{ marginTop: 8 }}>
          This region is yours.
        </div>
      ) : (
        <>
          <hr className="divider" />
          <h4>
            Declare war{' '}
            <InfoDot text="Pick a justification (casus belli). A claim or blood feud is free. A holy war needs a different faith and costs faith. Naked conquest needs no excuse but costs prestige and makes everyone like you less." />
          </h4>
          {block ? (
            <div className="muted">{block}</div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {opts.map((o) => (
                <div key={o.cb} className="spread">
                  <span>
                    <b>{CB_INFO[o.cb].name}</b>{' '}
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      {CB_INFO[o.cb].desc}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <CostTag cost={o.cost} />
                    <Btn
                      small
                      kind="danger"
                      icon="war"
                      reason={o.ok ? null : o.reason}
                      confirm="Tap again: war!"
                      onClick={() => {
                        if (act((d) => declareWar(d, reg.id, o.cb))) toast(`War declared on House ${owner.name}! Fight from the Realm tab.`);
                      }}
                    >
                      War
                    </Btn>
                  </span>
                </div>
              ))}
            </div>
          )}
          {!s.claims.includes(reg.id) && (
            <div className="spread" style={{ marginTop: 10 }}>
              <span className="muted" style={{ fontSize: '0.84rem' }}>
                Forge a claim: {Math.round(schemeChance(s, 'fabricate', reg.id) * 100)}% chance
              </span>
              <Btn small icon="scheme" reason={fab} onClick={() => act((d) => runScheme(d, 'fabricate', reg.id))}>
                Forge claim (80)
              </Btn>
            </div>
          )}
          {s.claims.includes(reg.id) && (
            <div className="pill gold" style={{ marginTop: 8 }}>
              You hold a claim here
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClanRow({ clanId }: { clanId: string }) {
  const { s, openClan } = useGame();
  const clan = s.clans[clanId];
  const head = ch(s, clan.headId);
  const liege = liegeOf(s, clanId);
  const regions = clanRegions(s, clanId);
  return (
    <div className="char" onClick={() => openClan(clanId)} role="button" tabIndex={0}>
      <Sigil spec={clan.sigil} size={40} />
      {head && <Face c={head} size={48} />}
      <div className="meta">
        <div className="nm">
          House {clan.name} {clan.isPlayer && <span className="pill gold">You</span>}
          {clan.allied && (
            <span className="pill green" style={{ marginLeft: 4 }}>
              Ally
            </span>
          )}
          {liege === s.playerClanId && (
            <span className="pill cyan" style={{ marginLeft: 4 }}>
              {clan.cadetOf === s.playerClanId ? 'Cadet' : 'Vassal'}
            </span>
          )}
          {isRival(clan) && (
            <span className="pill red" style={{ marginLeft: 4 }}>
              Sworn rival
            </span>
          )}
          {s.wars.some((w) => w.enemy === clanId) && (
            <span className="pill red" style={{ marginLeft: 4 }}>
              At war
            </span>
          )}
        </div>
        <div className="sub">
          {clanPower(s, clanId)} · {regions.length} region{regions.length === 1 ? '' : 's'} · {clan.fleet} ships
          {liege ? ` · vassal of ${s.clans[liege].name}` : ''}
        </div>
        {!clan.isPlayer && (
          <div style={{ marginTop: 4 }}>
            <Opinion v={clan.opinion} />
          </div>
        )}
      </div>
    </div>
  );
}

export function SystemTab() {
  const { s, ui, setUi } = useGame();
  const planetId = ui.planetId ?? s.clans[s.playerClanId].planetId;
  const p = PLANET_BY_ID[planetId];
  const sov = planetSovereign(s, planetId);
  const sovClan = sov ? s.clans[sov] : undefined;
  const clansHere = Object.values(s.clans)
    .filter((c) => c.planetId === planetId || planetRegions(s, planetId).some((r) => r.owner === c.id))
    .filter((c) => clanRegions(s, c.id).length > 0 || c.planetId === planetId)
    .sort((a, b) => clanRank(s, b.id) - clanRank(s, a.id) || clanRegions(s, b.id).length - clanRegions(s, a.id).length);
  const regionId = ui.regionId && s.regions[ui.regionId]?.planetId === planetId ? ui.regionId : undefined;

  return (
    <div>
      <Section
        title="The Sol System"
        icon="map"
        info="Tap a world to inspect it. The coloured ring around each planet is its ruling house. Gold stars mark worlds where you hold land, gold dots are your trade lanes and red dashes are your wars. Planets move along their orbits each cycle."
      >
        <SolarMap s={s} selected={planetId} onSelect={(id) => setUi({ planetId: id, regionId: undefined })} />
      </Section>
      <div className="cols section">
        <div className="card">
          <div className="row top">
            <PlanetArt planetId={planetId} size={84} />
            <div className="grow">
              <h2 style={{ marginBottom: 2 }}>{p.name}</h2>
              <div className="gold" style={{ fontSize: '0.88rem' }}>
                {p.faction}
              </div>
              <div className="muted" style={{ fontSize: '0.84rem', marginTop: 4 }}>
                {p.blurb}
              </div>
              <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                <b>Bonus for natives:</b> {p.bonus}
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <b>Faith:</b> <span style={{ color: FAITHS[p.faithId].color }}>{FAITHS[p.faithId].name}</span>
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <b>Ruled by:</b> {sovClan ? `House ${sovClan.name}, ${p.monarch[ch(s, sovClan.headId)?.gender ?? 'M']}` : 'nobody'}
              </div>
            </div>
          </div>
          <PlanetMap s={s} planetId={planetId} selected={regionId} onSelect={(id) => setUi({ regionId: id })} />
          <div className="muted" style={{ fontSize: '0.78rem', textAlign: 'center' }}>
            Tap a region. Gold dashes: yours. Hatched: your claims. Red: war targets. Crown: the throne-region.
          </div>
        </div>
        <div className="stack">
          {regionId ? (
            <RegionPanel regionId={regionId} />
          ) : (
            <div className="card flat muted">Select a region on the map to see who holds it, forge claims or declare war.</div>
          )}
          <h3 style={{ marginTop: 6 }}>Houses of {p.name}</h3>
          {clansHere.map((c) => (
            <ClanRow key={c.id} clanId={c.id} />
          ))}
        </div>
      </div>
      <GrudgeSection />
    </div>
  );
}
