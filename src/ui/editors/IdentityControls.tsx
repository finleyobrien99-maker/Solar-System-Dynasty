import { hexColour, LOOK_LIMITS, SIGIL_PATTERNS, SIGIL_SHAPES, SIGIL_SYMBOLS } from '../../game/identity';
import type { Character, PortraitStyle, SigilSpec } from '../../game/types';
import { eyeColor, hairColor, skinColor } from '../../svg/colors';

const PALETTE = [
  '#ffffff',
  '#cbd5e1',
  '#64748b',
  '#171717',
  '#f7dfcc',
  '#e2b18b',
  '#ab7756',
  '#4b301e',
  '#7f1d1d',
  '#ef4444',
  '#fb7185',
  '#f97316',
  '#fbbf24',
  '#fef08a',
  '#a3e635',
  '#15803d',
  '#22c55e',
  '#2dd4bf',
  '#0e7490',
  '#38bdf8',
  '#2563eb',
  '#1e1b4b',
  '#7c3aed',
  '#c084fc',
  '#db2777',
  '#f0abfc',
  '#78350f',
  '#d4af37',
];

export function ColourControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const clean = hexColour(value);
  return (
    <fieldset className="identity-colour">
      <legend>{label}</legend>
      <div className="row">
        <input type="color" aria-label={`${label} picker`} value={clean ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input
          aria-label={`${label} hex`}
          value={value}
          maxLength={7}
          spellCheck={false}
          placeholder="#rrggbb"
          aria-invalid={!clean}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {!clean && <small className="red">Use a hex colour such as #3366ff.</small>}
      <details>
        <summary>Colour palette</summary>
        <div className="identity-swatches" role="group" aria-label={`${label} palette`}>
          {PALETTE.map((colour) => (
            <button
              type="button"
              key={colour}
              style={{ background: colour }}
              title={colour}
              aria-label={`${label} ${colour}`}
              aria-pressed={clean === colour}
              onClick={() => onChange(colour)}
            />
          ))}
        </div>
      </details>
    </fieldset>
  );
}

const OPTIONS = {
  hairStyle: ['Swept', 'Side part', 'Long', 'Bun', 'Mohawk', 'Braids', 'Centre part', 'Close cropped'],
  face: ['Oval', 'Broad', 'Long', 'Square'],
  nose: ['Soft', 'Rounded', 'Long', 'Broad'],
  mouth: ['Medium', 'Wide', 'Full', 'Small'],
  brow: ['Fine', 'Medium', 'Heavy'],
  beard: ['None', 'Stubble', 'Goatee', 'Full'],
};
const LABELS = { hairStyle: 'Hair style', face: 'Face shape', nose: 'Nose', mouth: 'Mouth', brow: 'Brows', beard: 'Beard' };

export function AppearanceControls({
  c,
  year,
  value,
  onChange,
}: {
  c: Character;
  year: number;
  value: PortraitStyle;
  onChange: (value: PortraitStyle) => void;
}) {
  const looks = { ...c.looks, ...value };
  return (
    <div className="stack">
      <div className="identity-grid">
        {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[])
          .filter((k) => k !== 'beard' || c.gender === 'M')
          .map((k) => (
            <label key={k} className="stack">
              {LABELS[k]}
              <select aria-label={LABELS[k]} value={looks[k]} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}>
                {OPTIONS[k].slice(0, LOOK_LIMITS[k] + 1).map((text, i) => (
                  <option value={i} key={text}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>
      <div className="identity-grid">
        <ColourControl
          label="Skin colour"
          value={value.skinColor ?? skinColor(looks.skin, c.planetId, c.traits)}
          onChange={(skinColor) => onChange({ ...value, skinColor })}
        />
        <ColourControl
          label="Hair colour"
          value={value.hairColor ?? hairColor(looks.hair, c.planetId, (c.died ?? year) - c.born)}
          onChange={(hairColor) => onChange({ ...value, hairColor })}
        />
        <ColourControl
          label="Eye colour"
          value={value.eyeColor ?? (c.traits.some((t) => t.startsWith('psi_')) ? '#c47dff' : eyeColor(looks.eyes, c.planetId))}
          onChange={(eyeColor) => onChange({ ...value, eyeColor })}
        />
      </div>
      <p className="dim">Any RGB colour: use the picker, palette or hex code. Crowns, implants, ageing and expressions still follow the character’s life.</p>
    </div>
  );
}

export function SigilControls({ value, onChange }: { value: SigilSpec; onChange: (value: SigilSpec) => void }) {
  return (
    <div className="stack">
      <div className="identity-grid">
        {(
          [
            ['shape', 'Shield shape', SIGIL_SHAPES],
            ['division', 'Flag pattern', SIGIL_PATTERNS],
            ['charge', 'House symbol', SIGIL_SYMBOLS],
          ] as const
        ).map(([key, label, options]) => (
          <label key={key} className="stack">
            {label}
            <select aria-label={label} value={value[key]} onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}>
              {options.map((name, i) => (
                <option value={i} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="identity-grid">
        {(
          [
            ['c1', 'Field colour'],
            ['c2', 'Pattern colour'],
            ['c3', 'Symbol colour'],
          ] as const
        ).map(([key, label]) => (
          <ColourControl key={key} label={label} value={value[key]} onChange={(colour) => onChange({ ...value, [key]: colour })} />
        ))}
      </div>
      <p className="dim">Your shield and flag share a design. The field colour also appears on your ships, clothing and region map.</p>
    </div>
  );
}

/** Invalid draft hex input stays editable without reaching the renderer or saved game. */
export function previewPortrait(style: PortraitStyle): PortraitStyle {
  return {
    ...style,
    skinColor: hexColour(style.skinColor) ?? undefined,
    hairColor: hexColour(style.hairColor) ?? undefined,
    eyeColor: hexColour(style.eyeColor) ?? undefined,
  };
}
export function previewSigil(spec: SigilSpec): SigilSpec {
  return { ...spec, c1: hexColour(spec.c1) ?? '#334155', c2: hexColour(spec.c2) ?? '#ffffff', c3: hexColour(spec.c3) ?? '#d4af37' };
}
