import { isVip, ruler } from '../../game/core';
import { writeSave } from '../../game/save';
import { enableVip } from '../../game/vip';
import { AccessibilitySettings } from '../AccessibilitySettings';
import { Btn, Modal } from '../components';
import { useGame } from '../store';
import { downloadSave } from './SavesModal';

export function MenuModal() {
  const { s, act, setUi, quit, toast, openChar, openClan } = useGame();
  return (
    <Modal title="Menu" onClose={() => setUi({ panel: null })} icon="menu">
      <div className="stack">
        <AccessibilitySettings />
        <Btn block icon="family" onClick={() => openChar(ruler(s).id)}>
          Character appearance
        </Btn>
        <Btn block icon="crown" onClick={() => openClan(s.playerClanId)}>
          House identity & flag
        </Btn>
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
        {isVip(s) ? (
          <Btn block kind="primary" icon="relic" onClick={() => setUi({ panel: 'vip' })}>
            VIP console
          </Btn>
        ) : (
          <Btn
            block
            icon="relic"
            confirm="Tap again: cheats on"
            title="Edit anyone's traits on the fly, unlimited free Gene-Forge, and a console for resources."
            onClick={() => {
              act((d) => enableVip(d));
              setUi({ panel: 'vip' });
            }}
          >
            Turn on VIP mode
          </Btn>
        )}
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
