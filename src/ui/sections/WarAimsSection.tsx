import { useId, useState } from 'react';
import { clanRegions, liegeOf } from '../../game/core';
import { NAKED_WAR_PRESTIGE, goalBlocker, goalLabel, refusedWarDemand, type WarGoal } from '../../game/warGoals';
import { declareWithGoal, warBlocker } from '../../game/war';
import { Btn, Section } from '../components';
import { useGame } from '../store';

export function WarAimsSection({ clanId }: { clanId: string }) {
  const { s, act, toast } = useGame();
  const id = useId();
  const [kind, setKind] = useState<WarGoal['kind']>('cede');
  const regions = clanRegions(s, clanId);
  const vassals = Object.values(s.clans).filter(
    (c) => c.id !== s.playerClanId && c.id !== clanId && liegeOf(s, c.id) === clanId && clanRegions(s, c.id).length,
  );
  const [regionId, setRegionId] = useState('');
  const [vassalId, setVassalId] = useState('');
  const [amount, setAmount] = useState(25);
  const [years, setYears] = useState(5);
  if (clanId === s.playerClanId || !regions.length) return null;
  const target = s.regions[regionId] && s.regions[regionId].owner === clanId ? s.regions[regionId] : regions[0];
  const goal: WarGoal =
    kind === 'cede'
      ? { kind, regionId: target.id }
      : kind === 'tribute'
        ? { kind, amount, years }
        : kind === 'humiliate'
          ? { kind, prestige: 100 }
          : { kind, vassalId: vassalId || vassals[0]?.id || '' };
  const justified = (s.warJustifications ?? []).filter((j) => j.from === s.playerClanId && j.to === clanId && refusedWarDemand(s, j.id));
  const legacyAllianceCost = s.clans[clanId].allied ? 50 : 0;
  const totalCost = NAKED_WAR_PRESTIGE + legacyAllianceCost;
  const block =
    goalBlocker(s, s.playerClanId, clanId, goal) ??
    warBlocker(s, target) ??
    (s.prestige < totalCost ? 'Need ' + totalCost + ' prestige for this declaration.' : null);
  return (
    <Section
      title="War aims"
      icon="war"
      info="Choose exactly what this war seeks. A cause and a goal are different: ordinary declarations cost 120 prestige. A recorded refused demand justifies only its exact goal. Existing promises still bind you."
    >
      {justified.map((j) => (
        <div key={j.id} className="card flat stack">
          <b>Refused demand: {goalLabel(s, j.goal)}</b>
          <p className="muted">Valid until {j.expires}. This cause may justify one war for these exact terms, with no conquest prestige charge.</p>
          <Btn
            kind="danger"
            icon="war"
            confirm="Tap again to enforce this demand"
            reason={
              goalBlocker(s, s.playerClanId, clanId, j.goal) ??
              warBlocker(s, regions[0]) ??
              (s.prestige < legacyAllianceCost ? 'Need ' + legacyAllianceCost + ' prestige to break the existing alliance.' : null)
            }
            onClick={() => {
              if (act((d) => declareWithGoal(d, d.playerClanId, clanId, j.goal, { justification: j.id }))) toast('War declared for the exact refused demand.');
            }}
          >
            Enforce refused demand
          </Btn>
        </div>
      ))}
      <div className="stack" style={{ gap: 'var(--space-8px)' }}>
        <label htmlFor={id + '-kind'}>War objective</label>
        <select id={id + '-kind'} value={kind} onChange={(e) => setKind(e.target.value as WarGoal['kind'])}>
          <option value="cede">Cede a region</option>
          <option value="tribute">Demand tribute</option>
          <option value="humiliate">Humiliate their house</option>
          <option value="liberate">Liberate a vassal</option>
        </select>
        {kind === 'cede' && (
          <>
            <label htmlFor={id + '-region'}>Region to cede</label>
            <select id={id + '-region'} value={target.id} onChange={(e) => setRegionId(e.target.value)}>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </>
        )}
        {kind === 'tribute' && (
          <div className="grid tight">
            <label>
              Credits each cycle
              <input type="number" min={1} max={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <label>
              Tribute cycles
              <input type="number" min={1} max={20} value={years} onChange={(e) => setYears(Number(e.target.value))} />
            </label>
          </div>
        )}
        {kind === 'liberate' && (
          <>
            <label htmlFor={id + '-vassal'}>Vassal to liberate</label>
            <select id={id + '-vassal'} value={vassalId || vassals[0]?.id || ''} onChange={(e) => setVassalId(e.target.value)}>
              <option value="">Choose a vassal</option>
              {vassals.map((c) => (
                <option key={c.id} value={c.id}>
                  House {c.name}
                </option>
              ))}
            </select>
          </>
        )}
        <p className="muted">
          Declaration: {totalCost} prestige{legacyAllianceCost ? ' including the alliance breach' : ''}. {goalLabel(s, goal)}. A non-territorial victory takes
          no region. Defeat may cost actual reparations.
        </p>
        <Btn
          kind="danger"
          icon="war"
          reason={block}
          confirm="Tap again to declare this war"
          onClick={() => {
            if (act((d) => declareWithGoal(d, d.playerClanId, clanId, goal))) toast('War declared for this exact goal. Manage it on Realm.');
          }}
        >
          Declare war for this goal
        </Btn>
      </div>
    </Section>
  );
}
