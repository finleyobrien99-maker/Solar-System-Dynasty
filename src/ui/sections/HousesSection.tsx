import { HouseConnections } from './HouseConnections';
import { houseRelation } from '../../game/houseRelations';
import { rivalsOf } from '../../game/foreignPolicy';
import { pactMap } from '../../game/aiCourt';
import { useId, useState, useMemo } from 'react';
import { alive, ch, clanRegions, fullName, liegeOf, ruler } from '../../game/core';
import { committedShips } from '../../game/coalitions';
import { truceOf } from '../../game/peace';
import { FAITHS, PLANETS, PLANET_BY_ID } from '../../game/planets';
import { Sigil } from '../../svg/Sigil';
import { Btn, Opinion, Section } from '../components';
import { useGame } from '../store';

/** Public facts only: filtering and opening profiles do not change game state. */
export function HousesSection() {
  const { s, openClan, openChar } = useGame();
  const [planet, setPlanet] = useState('all');
  const [faith, setFaith] = useState('all');
  const labelId = useId();
  const marriagePacts = useMemo(() => pactMap(s, true), [s]);
  const houses = Object.values(s.clans).sort((a, b) => a.name.localeCompare(b.name));
  const headOf = (id: string) => {
    const c = id === s.playerClanId ? ruler(s) : ch(s, s.clans[id]?.headId);
    return alive(c) ? c : undefined;
  };
  const faithOf = (id: string) => {
    const head = headOf(id);
    return head && FAITHS[head.faithId] ? head.faithId : 'unknown';
  };
  const worldOf = (id: string) => (PLANET_BY_ID[s.clans[id].planetId] ? s.clans[id].planetId : 'unknown');
  const shown = houses.filter((c) => (planet === 'all' || worldOf(c.id) === planet) && (faith === 'all' || faithOf(c.id) === faith));
  const reset = () => {
    setPlanet('all');
    setFaith('all');
  };

  return (
    <Section
      title="Houses of Sol"
      icon="crown"
      info="Browse every recorded house. Home world is the house's recorded home; faith is its current ruler's own faith. Open each house’s recorded web of treaties, protectors, marriage pacts and blood feuds. Opinion and the peace badge concern your house; treaty links also show AI–AI bonds."
    >
      <div className="card flat stack" style={{ gap: 'var(--space-10px)' }}>
        <div className="grid tight">
          <div className="stack" style={{ gap: 'var(--space-4px)' }}>
            {/* The label sits beside the select, so its accessible name is just the label, not every option. */}
            <label htmlFor={labelId + '-planet'}>House home world</label>
            <select id={labelId + '-planet'} value={planet} onChange={(e) => setPlanet(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
              <option value="all">All worlds</option>
              {PLANETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="unknown">Unknown world</option>
            </select>
          </div>
          <div className="stack" style={{ gap: 'var(--space-4px)' }}>
            <label htmlFor={labelId + '-faith'}>Ruler faith</label>
            <select id={labelId + '-faith'} value={faith} onChange={(e) => setFaith(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
              <option value="all">All faiths</option>
              {Object.values(FAITHS).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="unknown">Unknown faith</option>
            </select>
          </div>
        </div>
        <div className="spread wrap">
          <p role="status" aria-live="polite" style={{ margin: 0 }}>
            Showing {shown.length} of {houses.length} houses
          </p>
          <Btn small kind="ghost" onClick={reset} disabled={planet === 'all' && faith === 'all'}>
            Reset filters
          </Btn>
        </div>
      </div>
      {shown.length === 0 && <div className="empty">No houses match these filters. Choose another world or faith, or reset the filters.</div>}
      <div className="grid" style={{ marginTop: 'var(--space-12px)' }}>
        {shown.map((house) => {
          const own = house.id === s.playerClanId;
          const head = headOf(house.id);
          const world = PLANET_BY_ID[house.planetId];
          const rulerFaith = head && FAITHS[head.faithId];
          const liege = liegeOf(s, house.id);
          const regions = clanRegions(s, house.id);
          const peace = own ? undefined : truceOf(s, s.playerClanId, house.id);
          const committed = committedShips(s, house.id);
          const foes = [...s.wars.map((w) => ({ a: s.playerClanId, b: w.enemy })), ...s.aiWars.map((w) => ({ a: w.attacker, b: w.defender }))]
            .filter((w) => w.a === house.id || w.b === house.id)
            .map((w) => s.clans[w.a === house.id ? w.b : w.a]?.name ?? 'unknown');
          return (
            <article key={house.id} className="card stack" aria-label={'House ' + house.name} style={{ gap: 'var(--space-8px)', minWidth: 0 }}>
              <div className="row top" style={{ gap: 'var(--space-10px)' }}>
                <Sigil spec={house.sigil} size={42} />
                <div className="grow" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={'View House ' + house.name}
                    onClick={() => openClan(house.id)}
                    style={{ width: '100%', whiteSpace: 'normal', textAlign: 'left', padding: 'var(--space-4px) var(--space-6px)' }}
                  >
                    <b>House {house.name}</b>
                  </button>
                  <div className="muted">Home world: {world?.name ?? 'Unknown'}</div>
                </div>
              </div>
              <div>
                <span className="muted">Ruler: </span>
                {head ? (
                  <button
                    type="button"
                    className="btn small ghost"
                    aria-label={'View ruler ' + fullName(s, head)}
                    onClick={() => openChar(head.id)}
                    style={{ maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' }}
                  >
                    {fullName(s, head)}
                  </button>
                ) : (
                  <span>Unknown</span>
                )}
                <div className="muted">Ruler faith: {rulerFaith?.name ?? 'Unknown'}</div>
              </div>
              <div className="row wrap">
                {own ? (
                  <span className="pill gold">Your house</span>
                ) : (
                  <>
                    <span className="muted">Opinion of you:</span>
                    <Opinion v={houseRelation(s, house.id, s.playerClanId).value} />
                  </>
                )}
                {!own && house.allied && <span className="pill green">Allied to you</span>}
                {peace && <span className="pill gold">Truce with you until {peace.until}</span>}
              </div>
              <HouseConnections houseId={house.id} marriagePacts={marriagePacts} rivals={rivalsOf(s, house.id, s.playerClanId)} />
              <div className="muted" style={{ overflowWrap: 'anywhere' }}>
                {regions.length} region{regions.length === 1 ? '' : 's'} · {own ? s.fleet : house.fleet} ships at home
                {committed > 0 && <div>{committed} ships committed to defence</div>}
                <div>
                  Allegiance:{' '}
                  {liege ? (
                    s.clans[liege] ? (
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => openClan(liege)}
                        style={{ maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' }}
                      >
                        Vassal of House {s.clans[liege].name}
                      </button>
                    ) : (
                      'Unknown liege'
                    )
                  ) : (
                    'Independent'
                  )}
                </div>
                {foes.length > 0 && (
                  <div className="bad">
                    At war with{' '}
                    {Array.from(new Set(foes))
                      .map((name) => 'House ' + name)
                      .join(', ')}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
