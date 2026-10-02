import { dynastyMembers, playerClan } from '../../game/core';
import { Sigil } from '../../svg/Sigil';
import { Btn, Modal } from '../components';
import { useGame } from '../store';

export function GameOverModal() {
  const { s, quit, setUi } = useGame();
  const clan = playerClan(s);
  const years = s.year - s.startYear;
  return (
    <Modal title="The End of a Dynasty" icon="death">
      <div className="row top" style={{ gap: 14 }}>
        <Sigil spec={clan.sigil} size={70} />
        <div>
          <p>{s.gameOver?.reason}</p>
          <p className="muted">
            House {clan.name} endured {years} cycles under {s.dynasty.rulers.length} rulers. {s.stats.children} heirs born to rulers, {s.stats.battlesWon} battles won,{' '}
            {s.stats.schemes} schemes hatched. {dynastyMembers(s, true).length} souls carried the name.
          </p>
        </div>
      </div>
      <div className="card flat" style={{ margin: '10px 0' }}>
        {s.dynasty.rulers.map((r, i) => (
          <div key={r.id + i} className="spread" style={{ fontSize: '0.88rem' }}>
            <span>
              {i + 1}. {r.name}
            </span>
            <span className="muted">
              {r.from}–{r.to ?? s.year}
            </span>
          </div>
        ))}
      </div>
      <div className="btn-row">
        <Btn kind="primary" onClick={quit}>
          New dynasty
        </Btn>
        <Btn onClick={() => setUi({ panel: 'saves' })}>Load a save</Btn>
        <Btn kind="ghost" onClick={() => setUi({ panel: 'tree' })}>
          View family tree
        </Btn>
      </div>
    </Modal>
  );
}
