// Earned reputations: data only, so naming helpers never import the simulation.
export const DEED_LABELS = {
  cruelty: 'Cruel acts',
  executions: 'Executions ordered',
  kinslayings: 'Kin killed',
  justice: 'Fair judgements',
  arbitrary: 'Unfair judgements',
  pardons: 'Acts of mercy',
  kindness: 'Acts of kindness',
  charity: 'Credits donated',
  oathsBroken: 'Alliances betrayed',
  battlesWon: 'Battles won',
  battlesLost: 'Battles lost',
  warsStarted: 'Wars started',
  warsWon: 'Wars won',
  warsLost: 'Wars lost',
  regionsTaken: 'Regions conquered',
  capitalsTaken: 'Thrones captured',
  independence: 'Independence won',
  rebellions: 'Rebellions launched',
  personalBattles: 'Battles led personally',
  battleWounds: 'Battle wounds survived',
  defensiveWins: 'Defensive wars won',
  peaceTreaties: 'White peaces signed',
  peacefulYears: 'Longest peaceful reign',
  rulingYears: 'Cycles spent ruling',
  age: 'Age reached while ruling',
  shipsBuilt: 'Ships built',
  familyVisits: 'Visits to close family',
  friends: 'Friends at one time',
  marriedYears: 'Longest faithful marriage while ruling',
  neglectYears: 'Cycles with neglected children',
  children: 'Children parented',
  grandchildren: 'Grandchildren',
  cadetsFounded: 'Cadet houses established',
  schemes: 'Successful schemes',
  assassinations: 'Assassinations ordered',
  blackmails: 'Successful blackmails',
  sabotages: 'Successful sabotage plots',
  studies: 'Archive studies',
  stargazing: 'Stargazing visits',
  splices: 'Successful gene splices',
  research: 'Genes researched',
  vats: 'Vat heirs grown',
  clones: 'Clones created',
  purges: 'Genes purged',
  development: 'Development levels built',
  routes: 'Trade routes opened',
  income: 'Credits earned from governing',
  pilgrimages: 'Pilgrimages completed',
} as const;
export type Deed = keyof typeof DEED_LABELS;
export type EpithetCategory = 'Character' | 'War' | 'Rule' | 'Family' | 'Intrigue' | 'Science' | 'Prosperity';
export interface EpithetRequirement {
  deed: Deed;
  min?: number;
  max?: number;
}
export interface EpithetDef {
  id: string;
  name: string;
  category: EpithetCategory;
  tone: 'good' | 'bad' | 'neutral';
  priority: number;
  rule: string;
  needs: readonly EpithetRequirement[];
}
export interface EarnedEpithet {
  id: string;
  year: number;
  why: string;
}
export interface Reputation {
  deeds: Partial<Record<Deed, number>>;
  earned: EarnedEpithet[];
  since: number;
  houses: string[];
  lastYear: number;
  peaceStreak: number;
  marriageStreak: number;
  spouseId?: string;
  unique?: Partial<Record<Deed, string[]>>;
}
const need = (deed: Deed, min: number): EpithetRequirement => ({ deed, min });
const title = (
  id: string,
  name: string,
  category: EpithetCategory,
  tone: EpithetDef['tone'],
  priority: number,
  rule: string,
  ...needs: EpithetRequirement[]
): EpithetDef => ({ id, name: 'the ' + name, category, tone, priority, rule, needs });
// The rarer, more defining reputations take precedence beside a ruler's name.
// Every earned epithet stays in their history, even if their later behaviour changes.
export const EPITHETS: readonly EpithetDef[] = [
  title('cruel', 'Cruel', 'Character', 'bad', 65, 'Commit five cruel acts, including executions and violent repression.', need('cruelty', 5)),
  title('merciless', 'Merciless', 'Character', 'bad', 70, 'Order five executions.', need('executions', 5)),
  title('headsman', 'Headsman', 'Character', 'bad', 80, 'Order ten executions.', need('executions', 10)),
  title('kinslayer', 'Kinslayer', 'Character', 'bad', 95, 'Order the death of a member of your own house or close family.', need('kinslayings', 1)),
  title('just', 'Just', 'Character', 'good', 65, 'Make five fair judgements or negotiate fair settlements.', need('justice', 5)),
  title(
    'arbitrary',
    'Arbitrary',
    'Character',
    'bad',
    60,
    'Make three unfair judgements, such as letting family buy their way out of wrongdoing.',
    need('arbitrary', 3),
  ),
  title('merciful', 'Merciful', 'Character', 'good', 60, 'Spare people on three occasions through releases or acts of mercy.', need('pardons', 3)),
  title('benevolent', 'Benevolent', 'Character', 'good', 60, 'Perform five acts of kindness or charity.', need('kindness', 5)),
  title('generous', 'Generous', 'Character', 'good', 50, 'Donate 500 credits to temples, relief or sanctuary.', need('charity', 500)),
  title(
    'honourable',
    'Honourable',
    'Character',
    'good',
    75,
    'Make three fair judgements and perform three acts of mercy.',
    need('justice', 3),
    need('pardons', 3),
  ),
  title('oathbreaker', 'Oathbreaker', 'Character', 'bad', 85, 'Declare war on an allied house.', need('oathsBroken', 1)),
  title('conqueror', 'Conqueror', 'War', 'neutral', 75, 'Conquer five regions.', need('regionsTaken', 5)),
  title('worldbreaker', 'Worldbreaker', 'War', 'neutral', 90, 'Capture two planetary thrones.', need('capitalsTaken', 2)),
  title('victorious', 'Victorious', 'War', 'good', 65, 'Win ten fleet battles.', need('battlesWon', 10)),
  title('unbeaten', 'Unbeaten', 'War', 'good', 70, 'Win five fleet battles before ever losing one.', need('battlesWon', 5), { deed: 'battlesLost', max: 0 }),
  title('defiant', 'Defiant', 'War', 'neutral', 80, 'Win a war of independence or a rebellion against your liege.', need('independence', 1)),
  title('rebel', 'Rebel', 'War', 'neutral', 60, 'Launch a revolt or war of independence.', need('rebellions', 1)),
  title('warmonger', 'Warmonger', 'War', 'bad', 65, 'Start five wars.', need('warsStarted', 5)),
  title('vanquisher', 'Vanquisher', 'War', 'good', 80, 'Win five wars.', need('warsWon', 5)),
  title('broken', 'Broken', 'War', 'bad', 70, 'Lose three wars.', need('warsLost', 3)),
  title('bold', 'Bold', 'War', 'good', 60, 'Personally lead five fleet battles.', need('personalBattles', 5)),
  title('scarred', 'Scarred', 'War', 'neutral', 55, 'Survive being wounded in two fleet battles.', need('battleWounds', 2)),
  title('protector', 'Protector', 'War', 'good', 80, 'Win three wars defending your realm.', need('defensiveWins', 3)),
  title('peacemaker', 'Peacemaker', 'Rule', 'good', 65, 'Sign three white peaces.', need('peaceTreaties', 3)),
  title('peaceful', 'Peaceful', 'Rule', 'good', 45, 'Rule for fifteen consecutive cycles without war.', need('peacefulYears', 15)),
  title('steadfast', 'Steadfast', 'Rule', 'good', 40, 'Rule for twenty-five cycles.', need('rulingYears', 25)),
  title('enduring', 'Enduring', 'Rule', 'good', 55, 'Rule for fifty cycles.', need('rulingYears', 50)),
  title('long_lived', 'Long-Lived', 'Rule', 'neutral', 50, 'Reach age 90 and spend thirty cycles ruling.', need('age', 90), need('rulingYears', 30)),
  title('ancient', 'Ancient', 'Rule', 'neutral', 85, 'Reach age 120 and spend fifty cycles ruling.', need('age', 120), need('rulingYears', 50)),
  title('shipwright', 'Shipwright', 'Rule', 'good', 45, 'Build one hundred ships during your lifetime.', need('shipsBuilt', 100)),
  title('fleetmaster', 'Fleetmaster', 'Rule', 'good', 70, 'Build one thousand ships during your lifetime.', need('shipsBuilt', 1000)),
  title('devoted', 'Devoted', 'Family', 'good', 55, 'Spend time with close family fifteen times.', need('familyVisits', 15)),
  title('beloved', 'Beloved', 'Family', 'good', 70, 'Have three friends and rule for at least five cycles.', need('friends', 3), need('rulingYears', 5)),
  title(
    'faithful',
    'Faithful',
    'Family',
    'good',
    50,
    'Spend fifteen consecutive ruling cycles happily married to the same person, with neither partner taking a lover.',
    need('marriedYears', 15),
  ),
  title('neglectful', 'Neglectful', 'Family', 'bad', 65, 'Spend five ruling cycles with a child who remembers your neglect.', need('neglectYears', 5)),
  title('prolific', 'Prolific', 'Family', 'neutral', 40, 'Become parent to five children.', need('children', 5)),
  title('progenitor', 'Progenitor', 'Family', 'neutral', 65, 'Become parent to ten children.', need('children', 10)),
  title('elder', 'Elder', 'Family', 'good', 50, 'Have ten grandchildren.', need('grandchildren', 10)),
  title('founder', 'Founder', 'Family', 'good', 75, 'Establish two cadet houses as their patron.', need('cadetsFounded', 2)),
  title('schemer', 'Schemer', 'Intrigue', 'neutral', 50, 'Complete five successful schemes.', need('schemes', 5)),
  title('spider', 'Spider', 'Intrigue', 'neutral', 80, 'Complete twelve successful schemes.', need('schemes', 12)),
  title('shadow', 'Shadow', 'Intrigue', 'bad', 85, 'Order three successful assassinations.', need('assassinations', 3)),
  title('blackmailer', 'Blackmailer', 'Intrigue', 'bad', 65, 'Successfully blackmail five times.', need('blackmails', 5)),
  title('saboteur', 'Saboteur', 'Intrigue', 'bad', 65, 'Complete five successful sabotage plots.', need('sabotages', 5)),
  title('scholar', 'Scholar', 'Science', 'good', 50, 'Complete six studies at the Grand Archive.', need('studies', 6)),
  title('stargazer', 'Stargazer', 'Science', 'neutral', 40, 'Share six stargazing visits.', need('stargazing', 6)),
  title('bloodwright', 'Bloodwright', 'Science', 'neutral', 65, 'Complete five successful gene splices.', need('splices', 5)),
  title('gene_architect', 'Gene Architect', 'Science', 'neutral', 80, 'Research eight different genes.', need('research', 8)),
  title('vatmaker', 'Vatmaker', 'Science', 'neutral', 60, 'Grow three vat heirs.', need('vats', 3)),
  title('clonewright', 'Clonewright', 'Science', 'neutral', 75, 'Create three clones.', need('clones', 3)),
  title('purifier', 'Purifier', 'Science', 'neutral', 60, 'Purge five different genes from the bloodline.', need('purges', 5)),
  title('builder', 'Builder', 'Prosperity', 'good', 50, 'Build five levels of regional development.', need('development', 5)),
  title('architect', 'Architect', 'Prosperity', 'good', 70, 'Build fifteen levels of regional development.', need('development', 15)),
  title('merchant', 'Merchant', 'Prosperity', 'good', 55, 'Open three trade routes, as operator or partner.', need('routes', 3)),
  title('magnate', 'Magnate', 'Prosperity', 'neutral', 65, 'Earn 10,000 credits from governing, excluding your inherited treasury.', need('income', 10000)),
  title('patron', 'Patron', 'Prosperity', 'good', 70, 'Donate 2,000 credits to temples, relief or sanctuary.', need('charity', 2000)),
  title('pilgrim', 'Pilgrim', 'Prosperity', 'good', 55, 'Complete five pilgrimages.', need('pilgrimages', 5)),
];
export const EPITHET_BY_ID: Readonly<Record<string, EpithetDef>> = Object.fromEntries(EPITHETS.map((t) => [t.id, t]));
export function primaryEpithet(reputation?: Reputation): EpithetDef | undefined {
  if (!reputation) return undefined;
  let best: EpithetDef | undefined,
    year = -Infinity;
  for (const earned of reputation.earned) {
    const def = EPITHET_BY_ID[earned.id];
    if (def && (!best || def.priority > best.priority || (def.priority === best.priority && earned.year >= year))) {
      best = def;
      year = earned.year;
    }
  }
  return best;
}
