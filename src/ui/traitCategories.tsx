import type { TraitCat } from '../game/traits';
export const CATEGORY_LABELS: Record<TraitCat, string> = {
  genetic: 'Genetic',
  personality: 'Personality',
  education: 'Education',
  cyber: 'Cybernetic',
  acquired: 'Acquired',
};
const GLYPHS: Record<TraitCat, string> = { genetic: '⌬', personality: '◇', education: '▤', cyber: '⚙', acquired: '★' };
export function CategoryMark({ cat }: { cat: TraitCat }) {
  return (
    <>
      <span className="category-mark" aria-hidden="true">
        {GLYPHS[cat]}
      </span>
      <span className="sr-only">{CATEGORY_LABELS[cat]}: </span>
    </>
  );
}
