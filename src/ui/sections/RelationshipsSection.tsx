import { knownRomance } from '../courtInfo';
import { useId, useState } from 'react';
import { alive, fullName, ruler } from '../../game/core';
import { opinionLines, relationsOf, spendTime, TIME_KINDS, TIME_PER_CYCLE, timeBlocker, timeLeft, timeValue, type TimeKind } from '../../game/relations';
import { TRAITS } from '../../game/traits';
import type { Character } from '../../game/types';
import { Btn, InfoDot, Section } from '../components';
import { useGame } from '../store';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function RelationshipsSection({ c }: { c: Character }) {
  const { s, openChar } = useGame();
  const relations = relationsOf(s, c).filter(({ other, kind }) => kind !== 'lover' || knownRomance(s, c, other));
  return (
    <Section
      title="Relationships"
      icon="heart"
      info={`How ${c.name} feels about each person, from -100 to +100. Open a row to see every reason. Feelings can differ in the other direction.`}
    >
      <p className="muted">How {c.name} feels about them:</p>
      {!relations.length && <div className="empty">No close family or shared history yet.</div>}
      <div className="stack">
        {relations.map(({ other, opinion, kind }) => (
          <details className="card flat" key={other.id}>
            <summary>
              {fullName(s, other)} · {signed(opinion)}
              {kind && ` · ${kind}`}
            </summary>
            <ul>
              {opinionLines(s, c, other).map((line, i) => (
                <li key={i}>
                  {line.label}: {signed(line.value)}
                </li>
              ))}
            </ul>
            <div className="muted">The total is capped between -100 and +100.</div>
            <Btn small onClick={() => openChar(other.id)}>
              Open {other.name}'s profile
            </Btn>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function SpendTimeSection() {
  const { s, act, toast, openChar } = useGame();
  const id = useId();
  const r = ruler(s);
  const close = new Set(relationsOf(s, r).map(({ other }) => other.id));
  const people = Object.values(s.characters)
    .filter((c) => alive(c) && c.id !== r.id)
    .sort(
      (a, b) =>
        Number(close.has(b.id)) - Number(close.has(a.id)) ||
        Number(b.clanId === s.playerClanId) - Number(a.clanId === s.playerClanId) ||
        fullName(s, a).localeCompare(fullName(s, b)),
    );
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<TimeKind>('dinner');
  const target = people.find((c) => c.id === targetId) ?? people[0];
  const block = target ? timeBlocker(s, target.id) : 'Nobody is available.';
  const activity = TIME_KINDS[kind];
  const names = (ids: string[]) => ids.map((id) => TRAITS[id]?.name ?? id).join(', ');
  return (
    <Section
      title="Spend time with..."
      icon="heart"
      info={`See up to ${TIME_PER_CYCLE} different people each cycle, once each. Shared time clears neglect and warms your relationship. It fades by one point per cycle.`}
    >
      <div className="card flat stack">
        <div role="status">
          {timeLeft(s)} of {TIME_PER_CYCLE} visits left this cycle.
        </div>
        <div className="grid">
          <label htmlFor={id + '-person'}>
            Spend time with
            <select id={id + '-person'} style={{ width: '100%', minWidth: 0 }} value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>
              {!people.length && <option value="">Nobody available</option>}
              {people.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(s, c)}
                  {close.has(c.id) ? ' · Close relation' : ''}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id + '-activity'}>
            Activity
            <select id={id + '-activity'} style={{ width: '100%', minWidth: 0 }} value={kind} onChange={(e) => setKind(e.target.value as TimeKind)}>
              {(Object.keys(TIME_KINDS) as TimeKind[]).map((k) => (
                <option key={k} value={k}>
                  {TIME_KINDS[k].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {target && (
          <div className="muted">
            {target.name} gains {timeValue(target, kind)} warmth towards you; you gain 5 towards them.
            <InfoDot
              text={`Their warmth starts at 5, +5 per matching preference (${names(activity.loves)}), -5 per dislike (${names(activity.hates)}), capped at 0 to 15. Your warmth is always +5. Spending time also clears any neglect.`}
            />
          </div>
        )}
        <div className="btn-row">
          <Btn
            kind="primary"
            reason={block}
            showReason
            onClick={() => {
              if (!target) return;
              setTargetId(target.id);
              const result = act((d) => spendTime(d, target.id, kind));
              toast(result ? `You spent time with ${target.name}.` : 'They cannot see you just now.', !result);
            }}
          >
            Spend time together
          </Btn>
          {target && (
            <Btn small onClick={() => openChar(target.id)}>
              View their profile
            </Btn>
          )}
        </div>
      </div>
    </Section>
  );
}
