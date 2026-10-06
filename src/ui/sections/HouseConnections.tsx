import type { Pacts } from '../../game/aiCourt';
import { treatiesOf } from '../../game/treaties';
import { treatyName } from '../../game/houseRelations';
import { useGame } from '../store';

/** Recorded public bonds only. Hostile opinions are not invented declared rivalries. */
export function HouseConnections({
  houseId,
  marriagePacts,
  rivals = [],
}: {
  houseId: string;
  marriagePacts: Pacts;
  rivals?: { id: string; reasons: { label: string }[] }[];
}) {
  const { s, openClan } = useGame();
  const treaties = treatiesOf(s, houseId);
  const kin = [...(marriagePacts.get(houseId) ?? [])].filter((id) => s.clans[id]);
  const feud = houseId === s.playerClanId ? s.feuds : s.feuds.includes(houseId) ? [s.playerClanId] : [];
  const link = (id: string) => (
    <button
      className="btn small ghost"
      type="button"
      onClick={() => openClan(id)}
      style={{ maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'left' }}
    >
      House {s.clans[id]?.name ?? 'unknown'}
    </button>
  );
  return (
    <details style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <summary>Who stands with them · {treaties.length} treaties</summary>
      {treaties.length === 0 && <p className="muted">No current treaty recorded.</p>}
      {treaties.map((t) => {
        const partner = t.a === houseId ? t.b : t.a;
        const direction =
          t.kind === 'guarantee'
            ? t.a === houseId
              ? 'Protects'
              : 'Protected by'
            : t.kind === 'tribute'
              ? t.a === houseId
                ? 'Receives tribute from'
                : 'Pays tribute to'
              : treatyName(t.kind) + ' with';
        return (
          <div key={t.id} className="stack" style={{ gap: 'var(--space-4px)', marginTop: 'var(--space-8px)' }}>
            <div>
              {direction} {link(partner)}
            </div>
            <span className="muted">
              Until {t.until}
              {t.kind === 'tribute' ? ' · ' + t.amount + ' credits per cycle, capped by available funds' : ''}
            </span>
          </div>
        );
      })}
      {kin.length > 0 && (
        <div className="stack" style={{ marginTop: 'var(--space-8px)' }}>
          <span className="muted">Bound by reciprocal marriage</span>
          {kin.map((id) => (
            <div key={id}>{link(id)}</div>
          ))}
        </div>
      )}
      {feud.length > 0 && (
        <div className="stack" style={{ marginTop: 'var(--space-8px)' }}>
          <span className="bad">Recorded blood feuds</span>
          {feud.map((id) => (
            <div key={id}>{link(id)}</div>
          ))}
        </div>
      )}
      {rivals.length > 0 && (
        <div className="stack" style={{ marginTop: 'var(--space-8px)' }}>
          <b className="bad">Public rivals</b>
          {rivals.map((r) => (
            <div key={r.id}>
              {link(r.id)}
              <div className="muted">{r.reasons.map((reason) => reason.label).join(' · ')}</div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
