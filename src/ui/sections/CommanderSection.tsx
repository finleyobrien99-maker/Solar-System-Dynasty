// The fleet commander (ROADMAP 12.10): who leads your battles when you don't,
// their record, and who leads the fleets you are fighting. Reading it never
// changes the game; appointments go through act().
import { useId, useState } from 'react';
import {
  appointCommander,
  battleRecord,
  commandBlocker,
  commandedSince,
  commanderOf,
  dismissCommander,
  eligibleCommanders,
  personalCommand,
  PER_COMMAND,
} from '../../game/commanders';
import { effStats, fullName, ruler } from '../../game/core';
import { councilStat } from '../../game/council';
import type { Character, GameState } from '../../game/types';
import { Btn, CharCard, ClanBadge, Section } from '../components';
import { useGame } from '../store';

function record(c: Character): string {
  const r = battleRecord(c);
  return r.won + r.lost ? `won ${r.won}, lost ${r.lost}` : 'no battles yet';
}

function summary(s: GameState, c: Character): string {
  return `Command ${personalCommand(s, c)} · ${record(c)}`;
}

export function CommanderSection() {
  const { s, act, openChar } = useGame();
  const id = useId();
  const [pickId, setPickId] = useState('');
  const current = commanderOf(s, s.playerClanId);
  const pool = eligibleCommanders(s, s.playerClanId).filter((c) => c.id !== current?.id);
  const pick = pool.find((c) => c.id === pickId) ?? pool[0];
  const fallback = Math.max(effStats(s, ruler(s)).cmd, councilStat(s, 'admiral'));
  const enemies = s.wars.map((w) => ({ clan: s.clans[w.enemy], general: commanderOf(s, w.enemy) })).filter((x) => x.clan && x.general);

  return (
    <Section
      title="Fleet commander"
      icon="war"
      info={`Your commander leads every battle you don't lead in person, on their own Command and fleet traits alone: council seats and VIP add nothing to it. Each point of Command adds ${Math.round(PER_COMMAND * 100)}% to the fleet's strength. Battles go on their record and can earn them a name, and they can be wounded, captured or killed. Without a commander, you and your admiral lead as before.`}
    >
      <div className="card flat stack">
        {current ? (
          <>
            <CharCard c={current} size={44} traitsMax={3} sub={summary(s, current)} />
            <div className="muted">
              In command since {commandedSince(s, s.playerClanId)}.{' '}
              {s.leadPersonally ? 'You lead the battles you start; they lead when you are attacked.' : 'They lead every battle.'}
            </div>
            <div className="btn-row">
              <Btn small kind="ghost" confirm="Tap again to relieve them" onClick={() => act((d) => dismissCommander(d, d.playerClanId))}>
                Relieve of command
              </Btn>
            </div>
          </>
        ) : (
          <div className="muted">Nobody in command. Without one, your fleet fights at Command {fallback} (yours or your admiral's, whichever is better).</div>
        )}

        {pool.length > 0 ? (
          <div className="stack">
            <label htmlFor={id + '-commander'}>
              {current ? 'Replace with' : 'Appoint a commander'}
              <select id={id + '-commander'} style={{ width: '100%', minWidth: 0 }} value={pick?.id ?? ''} onChange={(e) => setPickId(e.target.value)}>
                {pool.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(s, c)}: {summary(s, c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <Btn
                small
                reason={pick ? commandBlocker(s, s.playerClanId, pick.id) : 'Nobody to appoint'}
                onClick={() => pick && act((d) => appointCommander(d, d.playerClanId, pick.id))}
              >
                Give them the fleet
              </Btn>
              {pick && (
                <Btn small kind="ghost" onClick={() => openChar(pick.id)}>
                  View {pick.name}
                </Btn>
              )}
            </div>
          </div>
        ) : (
          !current && <div className="muted">Nobody in your close family or council is old enough and free to command.</div>
        )}

        {enemies.length > 0 && (
          <div>
            <h4 style={{ margin: 'var(--space-6px) 0 var(--space-4px)' }}>Facing you</h4>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-16px)' }}>
              {enemies.map(({ clan, general }) => (
                <li key={clan.id}>
                  <ClanBadge clanId={clan.id} />:{' '}
                  <button
                    className="btn ghost small"
                    style={{ padding: '0 6px', minHeight: 24 }}
                    aria-label={`Open ${general!.name}'s profile`}
                    onClick={() => openChar(general!.id)}
                  >
                    {general!.name}
                  </button>{' '}
                  <span className="muted">({summary(s, general!)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

/** The named person who commands a foreign house; read-only public service. */
export function ForeignCommanderSection({ clanId }: { clanId: string }) {
  const { s } = useGame();
  const current = commanderOf(s, clanId);
  if (!current) return null;
  return (
    <Section title="Fleet commander" icon="war">
      <CharCard c={current} size={44} traitsMax={3} sub={summary(s, current)} />
    </Section>
  );
}
