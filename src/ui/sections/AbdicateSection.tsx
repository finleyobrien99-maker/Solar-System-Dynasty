import { fullName } from '../../game/core';
import { abdicate, abdicationBlocker, currentHeir } from '../../game/life';
import { Btn, CharCard, Section } from '../components';
import { useGame } from '../store';

export function AbdicateSection() {
  const { s, act } = useGame();
  const heir = currentHeir(s);
  const block = abdicationBlocker(s);
  return (
    <Section
      title="Pass the torch"
      icon="crown"
      info="An adult ruler can step down for their free, adult heir, including in VIP mode. The old ruler stays alive, may take a vacant council seat and cannot inherit again. Normal succession reduces prestige by 10% and each vassal's opinion by 10."
    >
      <div className="card flat stack" style={{ gap: 'var(--space-8px)' }}>
        <p>Let the next generation take over while you are still here to see it.</p>
        {heir && <CharCard c={heir} sub="Will inherit the throne" traitsMax={2} size={44} />}
        <div className="muted">
          Your treasury, lands, wars and bloodline pass on. You lose 10% prestige; each vassal loses 10 opinion. Your personal epithets stay yours.
        </div>
        <Btn
          kind="primary"
          icon="crown"
          reason={block}
          showReason
          confirm={heir ? 'Tap again: hand over to ' + heir.name : 'Tap again to abdicate'}
          onClick={() => act((d) => abdicate(d))}
        >
          Abdicate
        </Btn>
        {heir && !block && <div className="muted">You will play as {fullName(s, heir)}.</div>}
      </div>
    </Section>
  );
}
