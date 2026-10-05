import { campaignsOf, warWeariness, WEARINESS_RECOVERY } from '../../game/peace';
import { Section } from '../components';
import { useGame } from '../store';

export function WarWearinessSection({ clanId }: { clanId?: string }) {
  const { s } = useGame();
  const id = clanId ?? s.playerClanId;
  const fatigue = warWeariness(s, id),
    campaigns = campaignsOf(s, id);
  if (clanId && !fatigue && !campaigns) return null;
  return (
    <Section
      title="War weariness"
      icon="war"
      info="Campaign years add 3 weariness per active war, up to 9 a cycle. A real battle adds 3 plus 20 times the share of participating ships lost, rounded up. It caps at 100: up to 25% less fleet strength and 15% less regional income. Beginning a cycle at peace recovers 8. Civil wars and their actual backers count. It belongs to the house and survives succession; no historical weariness is invented in old saves. Player and AI use the same factors."
    >
      <div className="card flat stack">
        <div className="spread wrap">
          <b>{fatigue}/100</b>
          <span className={fatigue >= 60 ? 'bad' : 'muted'}>
            {fatigue >= 60 ? 'Crews and worlds need a rest.' : fatigue ? 'The campaigns are taking their toll.' : 'Crews rested; worlds at full strength.'}
          </span>
        </div>
        <progress aria-label="War weariness" max={100} value={fatigue} style={{ width: '100%' }} />
        <div className="muted">
          Fleet strength −{(fatigue * 0.25).toFixed(1)}% · Regional income −{(fatigue * 0.15).toFixed(1)}%
        </div>
        <div className={campaigns ? 'gold' : 'good'}>
          {campaigns
            ? `${campaigns} active ${campaigns === 1 ? 'campaign' : 'campaigns'}: +${3 * Math.min(3, campaigns)} next cycle, plus battle losses.`
            : `At peace: recover ${WEARINESS_RECOVERY} weariness each cycle.`}
        </div>
      </div>
    </Section>
  );
}
