import { useState } from 'react';
import { clanRegions } from '../../game/core';
import { PLANETS, PLANET_BY_ID } from '../../game/planets';
import { closeRoute, GOODS, openCost, openRoute, partnerPort, raidRisk, routeBlocker, routeCap, routeValue } from '../../game/trade';
import { Icon } from '../../svg/Icons';
import { Sigil } from '../../svg/Sigil';
import { Btn, CostTag, Section } from '../components';
import { useGame } from '../store';

export function TradeSection() {
  const { s, act, toast } = useGame();
  const mine = clanRegions(s, s.playerClanId);
  const [from, setFrom] = useState(mine[0]?.id ?? '');
  const [partner, setPartner] = useState('');
  const fromReg = s.regions[from] ?? mine[0];
  const fromId = fromReg?.id ?? '';
  const partners = Object.values(s.clans).filter((c) => !c.isPlayer && clanRegions(s, c.id).length && partnerPort(s, c.id) !== fromReg?.planetId);
  const port = partner ? partnerPort(s, partner) : undefined;
  const block = partner ? routeBlocker(s, fromId, partner) : 'Pick a partner house';
  return (
    <Section
      title={`Trade routes (${s.routes.length}/${routeCap(s)})`}
      icon="ship"
      info="Run convoys from one of your regions to a partner house on another world. Longer hauls and richer ports pay more. Partners must like you (opinion 0+), and routes close if you go to war with them. Pirates raid routes now and then: a bigger fleet keeps them away. Slots: 1 + your rank + 1 per 6 Economy on your Treasurer."
    >
      <div className="stack">
        {s.routes.map((r) => {
          const p = s.clans[r.partner];
          const home = s.regions[r.from];
          return (
            <div key={r.id} className="card flat spread" style={{ padding: 10 }}>
              <div className="row" style={{ minWidth: 0 }}>
                {p && <Sigil spec={p.sigil} size={28} />}
                <div style={{ minWidth: 0 }}>
                  <b>
                    {home?.name} <Icon name="arrow" size={12} /> House {p?.name} ({PLANET_BY_ID[r.planetId].name})
                  </b>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>
                    Exporting {GOODS[home?.planetId ?? '']}, importing {GOODS[r.planetId]} · since {r.since}
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="pill gold">+{routeValue(s, r.from, r.partner, r.planetId)}/cycle</span>
                <Btn small kind="ghost" confirm="Tap again to close" onClick={() => act((d) => closeRoute(d, r.id))}>
                  Close
                </Btn>
              </div>
            </div>
          );
        })}
        {!s.routes.length && <div className="empty">No convoys running yet.</div>}
        <div className="card stack" style={{ gap: 8 }}>
          <b>Open a new route</b>
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="stack" style={{ gap: 2, flex: '1 1 160px', minWidth: 0 }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Home port
              </span>
              <select id="trade-from" value={fromId} onChange={(e) => setFrom(e.target.value)}>
                {mine.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({PLANET_BY_ID[r.planetId].name})
                  </option>
                ))}
              </select>
            </label>
            <label className="stack" style={{ gap: 2, flex: '2 1 220px', minWidth: 0 }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Partner house
              </span>
              <select id="trade-partner" value={partner} onChange={(e) => setPartner(e.target.value)}>
                <option value="">Choose…</option>
                {PLANETS.map((pl) => {
                  const here = partners.filter((c) => partnerPort(s, c.id) === pl.id);
                  if (!here.length) return null;
                  return (
                    <optgroup key={pl.id} label={`${pl.name}: ${GOODS[pl.id]}`}>
                      {here.map((c) => (
                        <option key={c.id} value={c.id}>
                          House {c.name} (opinion {Math.round(c.opinion)}, ~{routeValue(s, fromId, c.id, pl.id)}/cycle)
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          </div>
          <div className="spread">
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              {port ? `Worth about ${routeValue(s, fromId, partner, port)} credits a cycle. ` : ''}Pirate risk per route: {Math.round(raidRisk(s) * 100)}% a
              cycle.
            </span>
            <span className="row" style={{ gap: 6 }}>
              {port && <CostTag cost={openCost(s, fromId, port)} />}
              <Btn
                kind="primary"
                small
                icon="ship"
                reason={block}
                onClick={() => {
                  if (act((d) => openRoute(d, fromId, partner))) {
                    toast('Convoys are on their way.');
                    setPartner('');
                  }
                }}
              >
                Open route
              </Btn>
            </span>
          </div>
          {partner && block && <span className="reason">{block}</span>}
        </div>
      </div>
    </Section>
  );
}
