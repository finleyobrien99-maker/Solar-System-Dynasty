// Recorded parentage, bounded to five generations. Matching traits prove nothing.
import type { Character, GameState } from './types';

interface Path {
  ids: string[];
}
export interface Kinship {
  label: string;
  coefficient: number;
  commonAncestorIds: string[];
  close: boolean;
}
function paths(s: GameState, person: Character): Map<string, Path[]> {
  const out = new Map<string, Path[]>();
  const visit = (id: string | undefined, ids: string[], preview?: Character) => {
    if (!id || ids.includes(id) || ids.length > 5) return;
    const next = [...ids, id],
      row = out.get(id) ?? [];
    row.push({ ids: next });
    out.set(id, row);
    const c = preview ?? s.characters[id];
    // A recorded parent ID still proves a connection if the old person was pruned.
    if (c) for (const parent of new Set([c.fatherId, c.motherId])) visit(parent, next);
  };
  visit(person.id, [], person);
  return out;
}
/** Independent-path estimate, without guessing missing parentage or ancestral inbreeding. */
export function kinship(s: GameState, a: Character, b: Character): Kinship {
  const pa = paths(s, a),
    pb = paths(s, b);
  const common: string[] = [];
  let coefficient = 0,
    nearest: [number, number] | undefined;
  for (const [id, ap] of pa) {
    const bp = pb.get(id);
    if (!bp) continue;
    let contributes = false;
    for (const x of ap)
      for (const y of bp) {
        // Paths that already meet below this ancestor are not independent.
        const left = new Set(x.ids.slice(0, -1));
        if (y.ids.slice(0, -1).some((p) => left.has(p))) continue;
        const da = x.ids.length - 1,
          db = y.ids.length - 1;
        coefficient += Math.pow(0.5, da + db + 1);
        contributes = true;
        if (!nearest || da + db < nearest[0] + nearest[1]) nearest = [da, db];
      }
    if (contributes) common.push(id);
  }
  let label = 'No shared ancestry recorded';
  if (a.id === b.id) label = 'Same person';
  else if (nearest) {
    const [da, db] = nearest,
      min = Math.min(da, db),
      max = Math.max(da, db);
    if (min === 0) label = max === 1 ? 'Parent and child' : max === 2 ? 'Grandparent and grandchild' : 'Ancestor and descendant';
    else if (min === 1 && max === 1) {
      const parents = [a.fatherId, a.motherId].filter((id) => !!id && (id === b.fatherId || id === b.motherId));
      label = new Set(parents).size > 1 ? 'Siblings' : 'Half-siblings';
    } else if (min === 1 && max === 2) label = 'Aunt or uncle and niece or nephew';
    else if (min === 2 && max === 2) label = 'First cousins';
    else if (min === 3 && max === 3) label = 'Second cousins';
    else label = 'Distant relatives';
  }
  return { label, coefficient: Math.min(0.5, coefficient), commonAncestorIds: common, close: coefficient >= 0.0625 };
}
