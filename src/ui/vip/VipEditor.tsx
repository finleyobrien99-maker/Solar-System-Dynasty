// The VIP character editor: change anyone's traits, stats, age and name on
// the fly. Lives at the bottom of every character's profile in VIP mode.

import { useState } from 'react';
import { ageOf, alive } from '../../game/core';
import { STAT_NAMES } from '../../game/traits';
import { STAT_KEYS, type Character } from '../../game/types';
import { cleanse, clearTraits, heal, makeGodTier, MAX_AGE, minAge, rename, setAge, setStat, STAT_MAX, toggleTrait } from '../../game/vip';
import { Icon } from '../../svg/Icons';
import { Btn } from '../components';
import { useGame } from '../store';
import { TraitPicker } from './TraitPicker';

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  steps = [1],
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  steps?: number[];
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      {[...steps].reverse().map((d) => (
        <button
          key={`-${d}`}
          type="button"
          className="btn small ghost"
          disabled={value <= min}
          onClick={() => onChange(value - d)}
          aria-label={`${label} minus ${d}`}
        >
          −{d > 1 ? d : ''}
        </button>
      ))}
      <b className="stepper-value">{value}</b>
      {steps.map((d) => (
        <button
          key={`+${d}`}
          type="button"
          className="btn small ghost"
          disabled={value >= max}
          onClick={() => onChange(value + d)}
          aria-label={`${label} plus ${d}`}
        >
          +{d > 1 ? d : ''}
        </button>
      ))}
    </div>
  );
}

export function VipEditor({ c }: { c: Character }) {
  const { s, act, toast } = useGame();
  const [name, setName] = useState(c.name);
  const living = alive(c);
  return (
    <details className="vip-box" style={{ marginTop: 'var(--space-12px)' }}>
      <summary>
        <Icon name="relic" size={15} /> VIP editor
        <span className="muted" style={{ fontWeight: 400 }}>
          {' '}
          · change anything about {c.name}
        </span>
      </summary>
      <div className="stack" style={{ gap: 'var(--space-12px)', marginTop: 'var(--space-10px)' }}>
        <div className="btn-row">
          <Btn
            small
            kind="primary"
            icon="prestige"
            onClick={() => {
              act((d) => makeGodTier(d, c.id));
              toast(`${c.name} is now god-tier.`);
            }}
          >
            Make god-tier
          </Btn>
          {living && (
            <Btn small kind="good" icon="health" onClick={() => act((d) => heal(d, c.id))}>
              Heal fully
            </Btn>
          )}
          <Btn small icon="purge" onClick={() => act((d) => cleanse(d, c.id))}>
            Remove bad traits
          </Btn>
          <Btn small kind="danger" confirm="Tap again to wipe" onClick={() => act((d) => clearTraits(d, c.id))}>
            Clear all traits
          </Btn>
        </div>

        <form
          className="row wrap"
          style={{ gap: 'var(--space-6px)' }}
          onSubmit={(e) => {
            e.preventDefault();
            act((d) => rename(d, c.id, name));
          }}
        >
          <label className="row" style={{ gap: 'var(--space-6px)', flex: '1 1 200px', minWidth: 0 }}>
            <span className="muted">Name</span>
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          </label>
          <button type="submit" className="btn small" disabled={!name.trim() || name.trim() === c.name}>
            Rename
          </button>
        </form>

        <div className="vip-grid">
          {living && (
            <Stepper label="Age" value={ageOf(s, c)} min={minAge(s, c)} max={MAX_AGE} steps={[1, 10]} onChange={(v) => act((d) => setAge(d, c.id, v))} />
          )}
          {STAT_KEYS.map((k) => (
            <Stepper
              key={k}
              label={STAT_NAMES[k]}
              value={c.base[k]}
              min={0}
              max={STAT_MAX}
              steps={[1, 5]}
              onChange={(v) => act((d) => setStat(d, c.id, k, v))}
            />
          ))}
        </div>
        <div className="dim" style={{ fontSize: 'var(--font-size-0_74rem)' }}>
          Stats here are natural talent (0 to {STAT_MAX}). Traits, education and items add on top.
        </div>

        <TraitPicker selected={c.traits} onToggle={(id) => act((d) => toggleTrait(d, c.id, id))} />
      </div>
    </details>
  );
}
