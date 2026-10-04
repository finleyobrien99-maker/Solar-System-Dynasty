// Tap-to-toggle trait grid used by the VIP editor and the VIP ruler builder.
// Traits on the same ladder (or opposite personalities) replace each other.

import { useState } from 'react';
import { TRAIT_LIST, traitEffectText, type TraitCat, type TraitDef } from '../../game/traits';

const CAT_LABEL: Record<TraitCat, string> = {
  genetic: 'Genes',
  personality: 'Personality',
  education: 'Education',
  acquired: 'Earned',
  cyber: 'Implants',
};

const LADDERS: Record<string, string> = {
  intellect: 'Intellect',
  physique: 'Physique',
  beauty: 'Beauty',
  stature: 'Stature',
  constitution: 'Constitution',
  longevity: 'Longevity',
  fertility: 'Fertility',
  psionic: 'Psionics',
};

function Chip({ t, on, onToggle }: { t: TraitDef; on: boolean; onToggle: (id: string) => void }) {
  const tone = t.good === true ? 'good-t' : t.good === false ? 'bad' : '';
  return (
    <button type="button" className="chip-btn" aria-pressed={on} onClick={() => onToggle(t.id)} title={`${t.desc} ${traitEffectText(t)}`}>
      <span className={`trait ${t.cat} ${tone}`}>{t.name}</span>
    </button>
  );
}

function Rows({ rows, selected, onToggle }: { rows: [string, TraitDef[]][]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="pick-rows">
      {rows.map(([label, list]) => (
        <div key={label} className="pick-row">
          <span className="pick-label">{label}</span>
          <div className="traits">
            {list.map((t) => (
              <Chip key={t.id} t={t} on={selected.includes(t.id)} onToggle={onToggle} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TraitPicker({
  selected,
  onToggle,
  cats = ['genetic', 'personality', 'education', 'acquired', 'cyber'],
}: {
  selected: string[];
  onToggle: (id: string) => void;
  cats?: TraitCat[];
}) {
  const [cat, setCat] = useState<TraitCat>(cats[0]);
  const list = TRAIT_LIST.filter((t) => t.cat === cat);
  let rows: [string, TraitDef[]][];
  if (cat === 'genetic') {
    const ladders = Object.entries(LADDERS).map(
      ([g, label]) => [label, list.filter((t) => t.group === g).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))] as [string, TraitDef[]],
    );
    rows = [...ladders, ['Rare', list.filter((t) => !t.group || !LADDERS[t.group])]];
  } else if (cat === 'personality') {
    // Pairs sit next to each other, so one pair per row.
    rows = [];
    for (const t of list) if (!rows.some(([, l]) => l.some((x) => x.opposite === t.id))) rows.push(['', [t, ...list.filter((x) => x.id === t.opposite)]]);
  } else if (cat === 'education') {
    const by: Record<string, TraitDef[]> = {};
    for (const t of list) (by[t.id.split('_')[1]] ??= []).push(t);
    rows = Object.values(by).map((l) => ['', l]);
  } else rows = [['', list]];

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="tabs" style={{ marginBottom: 0 }}>
        {cats.map((c) => {
          const n = selected.filter((id) => TRAIT_LIST.some((t) => t.id === id && t.cat === c)).length;
          return (
            <button key={c} type="button" className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
              {CAT_LABEL[c]}
              {n > 0 && <span className="muted"> · {n}</span>}
            </button>
          );
        })}
      </div>
      <Rows rows={rows} selected={selected} onToggle={onToggle} />
      <div className="dim" style={{ fontSize: '0.74rem' }}>
        Tap to add or remove. Traits on the same ladder, or opposite personalities, replace each other.
      </div>
    </div>
  );
}
