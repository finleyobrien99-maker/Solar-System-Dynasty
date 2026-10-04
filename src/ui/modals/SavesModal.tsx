import { useRef, useState } from 'react';
import { deleteSave, exportSave, importSave, listSaves, readSave, writeSave, type SlotId } from '../../game/save';
import type { GameState } from '../../game/types';
import { shareFile } from '../../native';
import { Btn, Modal } from '../components';
import { useGame } from '../store';

const LABEL: Record<SlotId, string> = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

export function downloadSave(s: GameState): void {
  const house = s.clans[s.playerClanId]?.name ?? 'dynasty';
  const filename = `solar-dynasty-${house.toLowerCase()}-${s.year}.json`;
  const text = exportSave(s);
  // In the phone app there is no download folder, so use the share sheet.
  if (shareFile(filename, text)) return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save manager used both in-game and on the title screen. */
export function SavesPanel({ current, onLoad, onClose }: { current?: GameState; onLoad: (s: GameState) => void; onClose: () => void }) {
  const [, force] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const saves = listSaves();
  const bySlot = new Map(saves.map((x) => [x.slot, x]));
  const refresh = () => force((n) => n + 1);

  return (
    <Modal title="Saves" onClose={onClose} icon="save">
      <p className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
        Your game autosaves after every action. Each slot keeps a verified backup of the previous save, so a corrupted write never costs you a run. Export a
        file to keep a copy outside the browser.
      </p>
      {msg && (
        <div role="status" aria-label="Save status" className="card flat" style={{ marginBottom: 'var(--space-8px)' }}>
          {msg}
        </div>
      )}
      <div className="stack">
        {(['auto', 'slot1', 'slot2', 'slot3'] as SlotId[]).map((slot) => {
          const info = bySlot.get(slot);
          return (
            <div key={slot} className="card flat spread">
              <div>
                <b>{LABEL[slot]}</b>
                {info ? (
                  <div className="muted" style={{ fontSize: 'var(--font-size-0_82rem)' }}>
                    {info.summary.ruler} of House {info.summary.house} · {info.summary.title} · year {info.summary.year}
                    {info.summary.gameOver ? ' · ended' : ''}
                    {info.summary.vip ? ' · VIP' : ''}
                    <br />
                    saved {new Date(info.savedAt).toLocaleString()}
                    {info.fromBackup && <span className="bad"> (restored from backup)</span>}
                  </div>
                ) : (
                  <div className="dim">Empty</div>
                )}
              </div>
              <div className="btn-row">
                {current && slot !== 'auto' && (
                  <Btn
                    small
                    kind="good"
                    onClick={() => {
                      const res = writeSave(slot, current);
                      setMsg(res.ok ? `Saved to ${LABEL[slot]}.` : `Save failed: ${res.error}`);
                      refresh();
                    }}
                  >
                    Save here
                  </Btn>
                )}
                {info && (
                  <Btn
                    small
                    kind="primary"
                    onClick={() => {
                      try {
                        const res = readSave(slot);
                        if (res) onLoad(res.state);
                        else setMsg('That save could not be read.');
                      } catch (e) {
                        setMsg(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Load
                  </Btn>
                )}
                {info && slot !== 'auto' && (
                  <Btn
                    small
                    kind="ghost"
                    confirm="Tap again to delete"
                    onClick={() => {
                      deleteSave(slot);
                      refresh();
                    }}
                  >
                    Delete
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <hr className="divider" />
      <div className="btn-row">
        {current && (
          <Btn icon="save" onClick={() => downloadSave(current)}>
            Export to file
          </Btn>
        )}
        <Btn icon="arrow" onClick={() => file.current?.click()}>
          Import from file
        </Btn>
        <input
          ref={file}
          type="file"
          aria-label="Import save file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const state = importSave(await f.text());
              onLoad(state);
            } catch (err) {
              setMsg(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>
    </Modal>
  );
}

export function SavesModal() {
  const { s, replace, setUi, toast } = useGame();
  return (
    <SavesPanel
      current={s}
      onClose={() => setUi({ panel: null })}
      onLoad={(next) => {
        replace(next);
        toast('Game loaded.');
      }}
    />
  );
}
