import { writeSave } from '../../game/save';
import { Btn, Modal } from '../components';
import { useGame } from '../store';
import { downloadSave } from './SavesModal';

export function MenuModal() {
  const { s, setUi, quit, toast } = useGame();
  return (
    <Modal title="Menu" onClose={() => setUi({ panel: null })} icon="menu">
      <div className="stack">
        <Btn block icon="save" onClick={() => setUi({ panel: 'saves' })}>
          Save / Load
        </Btn>
        <Btn block icon="save" onClick={() => downloadSave(s)}>
          Export save file
        </Btn>
        <Btn block icon="codex" onClick={() => setUi({ panel: 'codex' })}>
          Codex & guide
        </Btn>
        <Btn block icon="family" onClick={() => setUi({ panel: 'tree' })}>
          Dynasty tree
        </Btn>
        <Btn
          block
          kind="ghost"
          icon="back"
          onClick={() => {
            const res = writeSave('auto', s);
            if (!res.ok) toast(`Autosave failed: ${res.error}`, true);
            quit();
          }}
        >
          Save & quit to title
        </Btn>
      </div>
    </Modal>
  );
}
