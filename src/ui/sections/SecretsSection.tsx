import { useId, useState } from 'react';
import { ageOf, alive, ch, fullName, ruler } from '../../game/core';
import { runScheme, schemeBlocker, schemeChance } from '../../game/intrigue';
import {
  exposeSecret,
  hooksOf,
  investigate,
  investigateBlocker,
  investigateChance,
  INVESTIGATION_COST,
  marriageHookBlocker,
  secretLabel,
  secretsKnownTo,
  spendMarriageHook,
} from '../../game/secrets';
import type { Character, Hook } from '../../game/types';
import { Btn, Section } from '../components';
import { useGame } from '../store';

function MarriageFavour({ hook }: { hook: Hook }) {
  const { s, act, toast } = useGame();
  const id = useId();
  const [ownId, setOwnId] = useState(''),
    [partnerId, setPartnerId] = useState('');
  const available = (c: Character | undefined): c is Character =>
    alive(c) && ageOf(s, c) >= 18 && !c.prisonerOf && !c.marriedIn && !c.betrothedId && !alive(ch(s, c.spouseId));
  const mine = Object.values(s.characters).filter((c) => c.clanId === s.playerClanId && available(c));
  const target = s.characters[hook.targetId];
  const theirs = target.childrenIds.map((key) => ch(s, key)).filter(available);
  const own = mine.find((c) => c.id === ownId) ?? mine[0];
  const partner = theirs.find((c) => c.id === partnerId) ?? theirs.find((c) => own && !marriageHookBlocker(s, hook.id, own.id, c.id)) ?? theirs[0];
  const block = own && partner ? marriageHookBlocker(s, hook.id, own.id, partner.id) : 'No eligible adult match is available.';
  return (
    <details className="card flat">
      <summary>Trade silence for a marriage</summary>
      <p className="muted">One use. Their child joins your court. Existing marriages, betrothals, close kin and heirs are protected. Expect resentment.</p>
      <div className="grid">
        <div>
          <label htmlFor={id + '-own'}>Your family member</label>
          <select id={id + '-own'} style={{ width: '100%', minWidth: 0 }} value={own?.id ?? ''} onChange={(e) => setOwnId(e.target.value)}>
            {!mine.length && <option value="">Nobody eligible</option>}
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(s, c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id + '-partner'}>Their child</label>
          <select id={id + '-partner'} style={{ width: '100%', minWidth: 0 }} value={partner?.id ?? ''} onChange={(e) => setPartnerId(e.target.value)}>
            {!theirs.length && <option value="">Nobody eligible</option>}
            {theirs.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(s, c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Btn
        kind="primary"
        reason={block}
        showReason
        confirm="Spend this hook on the marriage?"
        onClick={() => {
          if (!own || !partner) return;
          const result = act((d) => spendMarriageHook(d, hook.id, own.id, partner.id));
          toast(result ? 'The marriage is agreed. Your hook is spent.' : 'That marriage is no longer possible.', !result);
        }}
      >
        Spend hook on marriage
      </Btn>
    </details>
  );
}

export function SecretsSection({ c }: { c: Character }) {
  const { s, act, toast } = useGame();
  const me = ruler(s);
  const evidence = secretsKnownTo(s).filter((x) => x.subjectId === c.id);
  const hooks = hooksOf(s).filter((x) => x.targetId === c.id);
  const investigateReason = investigateBlocker(s, c.id);
  const publishReason = s.gameOver || !alive(me) || me.prisonerOf || ageOf(s, me) < 18 ? 'Only a free adult can publish evidence.' : null;
  if (!s.characters[c.id] || (!alive(c) && !evidence.length) || (c.id === me.id && !evidence.length)) return null;
  return (
    <Section
      title="Secrets & hooks"
      icon="scheme"
      info="Proof comes from real affairs and murders. A hook belongs to the person who discovered it and buys one favour. Exposure destroys every hook on that secret; heirs do not inherit leverage."
    >
      <div className="stack">
        {alive(c) && c.id !== me.id && (
          <div className="card flat">
            <p className="muted">
              Send agents to seek proof. One investigation per cycle costs {INVESTIGATION_COST} credits, even if nothing is found. Success chance:{' '}
              {Math.round(investigateChance(s, c.id) * 100)}%. Your Intrigue and spymaster oppose their Intrigue.
            </p>
            <div className="btn-row">
              <Btn reason={investigateReason} showReason onClick={() => act((d) => investigate(d, c.id))}>
                Investigate ({INVESTIGATION_COST} credits)
              </Btn>
              {s.clans[c.clanId]?.headId === c.id && c.clanId !== s.playerClanId && (
                <Btn
                  reason={schemeBlocker(s, 'blackmail', c.clanId)}
                  showReason
                  title="Costs 20 credits and one scheme action. The hook is spent even if they refuse. Payment comes from their actual treasury."
                  onClick={() => act((d) => runScheme(d, 'blackmail', c.clanId))}
                >
                  Demand payment (20 credits, {Math.round(schemeChance(s, 'blackmail', c.clanId) * 100)}%)
                </Btn>
              )}
            </div>
          </div>
        )}
        {!evidence.length && <p className="muted">You have no evidence about {c.name}. Rumours cannot buy favours.</p>}
        {evidence.map((secret) => {
          const hook = hooks.find((x) => x.secretId === secret.id);
          const spent = s.hooks.some((x) => x.secretId === secret.id && x.holderId === me.id && x.usedYear !== undefined);
          return (
            <div className="card flat stack" key={secret.id}>
              <b>{secretLabel(s, secret)}</b>
              <span className="muted">
                {secret.exposedYear !== undefined ? 'Public evidence' : 'Private evidence'} · Recorded in {secret.year}.
                {secret.exposedYear !== undefined
                  ? ' All hooks on this secret are worthless.'
                  : hook
                    ? ' You hold one unspent hook.'
                    : spent
                      ? ' Your hook is spent.'
                      : ' You hold no usable hook.'}
              </span>
              {secret.exposedYear === undefined && (
                <Btn
                  small
                  kind="danger"
                  reason={publishReason}
                  showReason
                  confirm="Publish this evidence? All hooks on it will be lost."
                  onClick={() => {
                    const result = act((d) => exposeSecret(d, secret.id));
                    toast(result ? 'The evidence is public.' : 'This evidence cannot be published now.', !result);
                  }}
                >
                  Expose evidence
                </Btn>
              )}
              {hook && s.clans[c.clanId]?.headId === c.id && c.clanId !== s.playerClanId && <MarriageFavour key={hook.id} hook={hook} />}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
