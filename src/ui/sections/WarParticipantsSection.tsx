import { Btn, ClanBadge } from '../components';
import { useGame } from '../store';

export interface WarParticipantRow {
  clanId: string;
  source: 'coalition' | 'realm';
  answer: 'accepted' | 'refused' | 'blocked' | 'pending';
  /** Only explanations cleared for the player to see, saved when the call was made. */
  reasons: readonly { label: string; value?: number }[];
  sent: number;
  remaining: number;
  /** Actual casualties, if recorded. A recalled survivor is not a loss. */
  lost?: number;
  returned?: number;
  role?: 'sovereign' | 'vassal' | 'planet';
  chance?: number;
  leaderId?: string;
}

export interface WarParticipantsSectionProps {
  rows: readonly WarParticipantRow[];
  title?: string;
  /** Public name of the house or world being defended. */
  defending?: string;
}

const ANSWERS = {
  accepted: 'Answered',
  refused: 'Refused',
  blocked: 'Unable to answer',
  pending: 'Awaiting answer',
} as const;

/** Displays supplied public call records; no game decisions or state changes occur here. */
export function WarParticipantsSection({ rows, title = 'Coalition defence', defending }: WarParticipantsSectionProps) {
  const { s, openChar } = useGame();
  if (!rows.length) return null;
  const counts = rows.reduce((n, row) => ({ ...n, [row.answer]: n[row.answer] + 1 }), { accepted: 0, refused: 0, blocked: 0, pending: 0 });
  const summary = [
    counts.accepted ? `${counts.accepted} answered` : '',
    counts.refused ? `${counts.refused} refused` : '',
    counts.blocked ? `${counts.blocked} unable to answer` : '',
    counts.pending ? `${counts.pending} awaiting answer` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="card flat stack" aria-label="War participants" style={{ marginTop: 'var(--space-10px)', overflowWrap: 'anywhere' }}>
      <b>{title}</b>
      {defending && <div className="muted">Who stands with {defending}</div>}
      <div className="muted">{summary}</div>
      <div className="stack">
        {rows.map((row) => {
          const leader = row.leaderId ? s.characters[row.leaderId] : undefined;
          const clan = s.clans[row.clanId];
          return (
            <div
              className="card flat stack"
              key={row.source + ':' + row.clanId}
              aria-label={`${row.source === 'realm' ? 'Realm' : 'Coalition'} answer from House ${clan?.name ?? row.clanId}`}
            >
              <div className="spread wrap">
                <div style={{ minWidth: 0, maxWidth: '100%' }}>
                  <ClanBadge clanId={row.clanId} />
                </div>
                <span className={`pill ${row.answer === 'accepted' ? 'green' : row.answer === 'refused' ? 'red' : ''}`}>{ANSWERS[row.answer]}</span>
              </div>
              <div className="muted">{row.source === 'realm' ? 'Realm defence call' : 'Coalition defence pledge'}</div>
              {row.role && <div className="muted">{row.role === 'sovereign' ? 'Sovereign' : row.role === 'vassal' ? 'Sworn house' : 'United world'}</div>}
              {row.answer === 'accepted' ? (
                <>
                  <div>
                    {row.remaining} of {row.sent} ships remain
                  </div>
                  {row.remaining === 0 && <div className="muted">No ships currently deployed.</div>}
                  {!!row.returned && <div className="muted">{row.returned} ships returned home</div>}
                  {row.lost !== undefined && <div className={row.lost ? 'bad' : 'muted'}>{row.lost} ships lost</div>}
                </>
              ) : (
                <div className="muted">No ships committed.</div>
              )}
              {leader && (
                <div className="btn-row">
                  <Btn small kind="ghost" onClick={() => openChar(leader.id)}>
                    Led by {leader.name}
                  </Btn>
                </div>
              )}
              {(row.reasons.length > 0 || row.chance !== undefined) && (
                <details>
                  <summary>Why this answer?</summary>
                  <div className="stack" style={{ gap: 'var(--space-6px)', marginTop: 'var(--space-6px)' }}>
                    {row.chance !== undefined && <div className="muted">{Math.round(row.chance * 100)}% chance when called</div>}
                    {row.reasons.map((reason, i) => (
                      <div className="spread wrap" key={reason.label + ':' + i}>
                        <span>{reason.label}</span>
                        {reason.value !== undefined && (
                          <span className={reason.value > 0 ? 'good' : reason.value < 0 ? 'bad' : 'muted'}>
                            {reason.value > 0 ? '+' : ''}
                            {reason.value}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
      <div className="muted">Detached ships fight for the defence. Each house bears its own losses; surviving crews return when their commitment ends.</div>
    </div>
  );
}
