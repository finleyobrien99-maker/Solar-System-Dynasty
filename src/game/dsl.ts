import { recordDeed } from './epithets';
import { DEED_LABELS, type Deed } from './epithetDefs';
// Event DSL (ROADMAP 3.1, sketched in §16.2).
//
// An option says what it does as data: what it needs, what it costs, which
// checks it rolls and what each result does. From that one description the
// game both applies the outcome and writes the option's tooltip, e.g.
// "−40 faith · 50%: nothing happens · otherwise −2 development", so the
// tooltip can never disagree with what happens, and a locked option says why
// ("Needs Intrigue 8").
//
// Describing never rolls dice: tooltips show the odds for the current ruler,
// so any custom odds, tests or texts must be pure. Event texts, triggers,
// subjects and setup are still plain functions; story cycles (3.2) will want
// those declarative too.

import { alive, clanRegions, effStats, newId } from './core';
import { clearFlag, setFlag, sicken, type EventChoice, type EventCtx, type EventDef } from './eventKit';
import { makeItem } from './items';
import { currentHeir, killCharacter } from './life';
import { remember } from './memory';
import { addFeeling, forget } from './relations';
import { chance, clamp, int, pick } from './rng';
import { addTrait, STAT_NAMES, TRAITS } from './traits';
import type { Character, Clan, ItemSlot, Rarity, Region, StatKey } from './types';

export type Resource = 'credits' | 'prestige' | 'faith' | 'fleet';

/** A character: the ruler ('root'), the event's subject, the heir, the ruler's spouse, or a name bound by a pick or the event's setup data. */
export type Who = 'root' | 'subject' | 'heir' | 'spouse' | (string & {});

/** A stat that scales a number or a chance: `n` per point of `stat` on `of` (the ruler by default). */
export interface Per {
  stat: StatKey;
  n: number;
  of?: Who;
}

/**
 * A number: fixed, or base + (a value from the event's data, or a share of a
 * resource you hold) × times + a roll + a stat bonus, then rounded and floored
 * at `min` if asked. `calc` is the escape hatch.
 */
export type Num =
  | number
  | { base?: number; data?: string; of?: Resource; times?: number; roll?: [number, number]; per?: Per; round?: boolean; min?: number }
  | { calc: (c: Ctx) => number; text: Text };

/** A chance: fixed, a stat check (base + per point), or custom odds with their own roll. */
export type Prob = number | { base: number; per: Per } | { odds: (c: Ctx) => number; roll: (c: Ctx) => boolean; text: string };

export type Cond =
  | { have: Resource; n: number | string } // a number, or a key in the event's data
  | { stat: StatKey; min: number; of?: Who }
  | { exists: Who }
  /** `assume` is what tooltips take it to be when it can't be judged yet (it depends on a pick). */
  | { test: (c: Ctx) => boolean; why: string; assume?: boolean };

export type Effect =
  | { deed: Deed; n?: number; to?: Who }
  | { gain: Resource; n: Num; as?: string }
  | { lose: Resource; n: Num; as?: string; upTo?: 'have' }
  /** Add a trait. With `p` it's rolled (`or` is the trait on a miss); `fresh` skips the roll if they have it already; `say` adds "Vula is now Brave." to the outcome. */
  | { trait: string | { data: string }; to?: Who; p?: Prob; or?: string; fresh?: boolean; say?: string }
  | { traitFrom: string[]; to?: Who; as?: string; text: string }
  | { stat: StatKey; n: number; to?: Who }
  | { health: number; to?: Who }
  | { sicken: Who }
  | { cure: Who }
  | { kill: Who; cause: string }
  | { dev: number; region: string }
  | { opinion: number; clan: string; max?: number }
  | { remember: string; clan: string; value: number; decay?: number }
  | { feud: string }
  | { claim: string; as?: string }
  | { item: { slot?: ItemSlot; rarity?: Rarity | [Prob, Rarity, Rarity]; origin: string }; as?: string }
  | { flag: string; in: Num; data?: (c: Ctx) => Record<string, string | number> }
  | { clearFlag: string }
  /** Bind a character, region or clan for later effects. `get` may roll dice (it runs in order). `text` names it in tooltips; `say` adds a line of its own. */
  | { pick: string; get: (c: Ctx) => Character | Region | Clan | undefined; text: Text; say?: Text }
  /** Roll a chance in secret and keep the result (1 or 0) for later. */
  | { set: string; roll: Prob }
  /** How `from` feels about `to` (the ruler by default) changes (relations.ts). Fades by `decay` a cycle (default 1); a `key` replaces an earlier feeling. */
  | { feel: number; from: Who; to?: Who; why: string; decay?: number; key?: string }
  /** `from` lets go of a keyed feeling about `to` (the ruler by default): a grudge settled, neglect made good. */
  | { forgive: string; from: Who; to?: Who }
  /** The escape hatch. May return a sentence to add to the outcome. */
  | { run: (c: Ctx) => string | void; text: Text };

export type Text = string | ((c: Ctx) => string);

/** What happens: effects in order, then optionally a roll or a condition picking the next outcome. The deepest text wins. */
export interface Outcome {
  do?: Effect[];
  text?: Text;
  roll?: Prob;
  if?: Cond;
  pass?: Outcome;
  fail?: Outcome;
}

export interface OptionSpec {
  label: string;
  /** Hidden unless all hold. */
  show?: Cond[];
  /** Greyed out, with the first failing reason, unless all hold. */
  needs?: Cond[];
  then: Outcome;
}

export interface EventSpec extends Omit<EventDef, 'choices'> {
  options: OptionSpec[];
}

export interface Ctx extends EventCtx {
  vars: Record<string, string | number>;
  picks: Record<string, Character | Region | Clan | undefined>;
}

const RESOURCE: Record<Resource, string> = { credits: 'credits', prestige: 'prestige', faith: 'faith', fleet: 'ships' };

function ctxOf(e: EventCtx): Ctx {
  return { ...e, vars: {}, picks: {} };
}

// ── Lookups ───────────────────────────────────────────────────────────────

export function who(c: Ctx, w: Who = 'root'): Character | undefined {
  if (w === 'root') return c.r;
  if (w === 'subject') return c.subject;
  if (w === 'heir') return currentHeir(c.s);
  if (w === 'spouse') return c.s.characters[c.r.spouseId ?? ''];
  if (w in c.picks) return c.picks[w] as Character | undefined;
  const id = c.data[w];
  return id === undefined ? undefined : c.s.characters[String(id)];
}

export function regionOf(c: Ctx, key: string): Region | undefined {
  return key in c.picks ? (c.picks[key] as Region | undefined) : c.s.regions[String(c.data[key])];
}

export function clanOf(c: Ctx, key: string): Clan | undefined {
  return key in c.picks ? (c.picks[key] as Clan | undefined) : c.s.clans[String(c.data[key])];
}

function traitId(c: Ctx, t: string | { data: string }): string {
  return typeof t === 'string' ? t : String(c.data[t.data]);
}

function statOf(c: Ctx, p: Per): number {
  const x = who(c, p.of);
  return x ? effStats(c.s, x)[p.stat] : 0;
}

// ── Numbers, chances, conditions ──────────────────────────────────────────

function num(c: Ctx, n: Num): number {
  if (typeof n === 'number') return n;
  if ('calc' in n) return n.calc(c);
  let v = n.base ?? 0;
  if (n.data !== undefined) v += Number(c.data[n.data]) * (n.times ?? 1);
  if (n.of !== undefined) v += c.s[n.of] * (n.times ?? 1);
  if (n.roll) v += int(c.s, n.roll[0], n.roll[1]);
  if (n.per) v += statOf(c, n.per) * n.per.n;
  return finish(n, v);
}

function finish(n: { round?: boolean; min?: number }, v: number): number {
  const r = n.round ? Math.round(v) : v;
  return n.min === undefined ? r : Math.max(n.min, r);
}

/** The lowest and highest a number can come out, without rolling. Null for `calc`. */
function numRange(c: Ctx, n: Num): [number, number] | null {
  if (typeof n === 'number') return [n, n];
  if ('calc' in n) return null;
  let v = n.base ?? 0;
  if (n.data !== undefined) v += Number(c.data[n.data]) * (n.times ?? 1);
  if (n.of !== undefined) v += c.s[n.of] * (n.times ?? 1);
  if (n.per) v += statOf(c, n.per) * n.per.n;
  const [lo, hi] = n.roll ?? [0, 0];
  return [finish(n, v + lo), finish(n, v + hi)];
}

/** "+192–272 credits (+12 per Science)". */
function amountText(c: Ctx, sign: '+' | '−', n: Num, what: string): string {
  if (typeof n === 'object' && 'calc' in n) return `${sign}${render(c, n.text)} ${what}`;
  const [lo, hi] = numRange(c, n)!;
  const per = typeof n === 'object' && n.per ? ` (+${n.per.n} per ${STAT_NAMES[n.per.stat]})` : '';
  return `${sign}${lo === hi ? lo : `${lo}–${hi}`} ${what}${per}`;
}

function roll(c: Ctx, p: Prob): boolean {
  if (typeof p === 'number') return chance(c.s, p);
  if ('roll' in p) return p.roll(c);
  return chance(c.s, p.base + statOf(c, p.per) * p.per.n);
}

export function oddsOf(c: Ctx, p: Prob): number {
  const raw = typeof p === 'number' ? p : 'odds' in p ? p.odds(c) : p.base + statOf(c, p.per) * p.per.n;
  return clamp(raw, 0, 1);
}

function probText(c: Ctx, p: Prob): string {
  const pct = `${Math.round(oddsOf(c, p) * 100)}%`;
  if (typeof p === 'number') return pct;
  if ('odds' in p) return `${p.text} (${pct})`;
  return `${STAT_NAMES[p.per.stat]} check (${pct})`;
}

function holds(c: Ctx, k: Cond): boolean {
  if ('have' in k) return c.s[k.have] >= (typeof k.n === 'number' ? k.n : Number(c.data[k.n]));
  if ('stat' in k) {
    const x = who(c, k.of);
    return !!x && effStats(c.s, x)[k.stat] >= k.min;
  }
  if ('exists' in k) return alive(who(c, k.exists));
  return k.test(c);
}

function whyNot(c: Ctx, k: Cond): string {
  if ('have' in k) return `Needs ${typeof k.n === 'number' ? k.n : c.data[k.n]} ${RESOURCE[k.have]}`;
  if ('stat' in k) return `Needs ${STAT_NAMES[k.stat]} ${k.min}`;
  if ('exists' in k) return k.exists === 'heir' ? 'Needs an heir' : 'Nobody to do it';
  return k.why;
}

// ── Applying ──────────────────────────────────────────────────────────────

function apply(c: Ctx, e: Effect, notes: string[]): void {
  const s = c.s;
  if ('deed' in e) {
    recordDeed(s, who(c, e.to), e.deed, e.n ?? 1);
  } else if ('gain' in e) {
    const n = num(c, e.n);
    s[e.gain] += n;
    if (e.as) c.vars[e.as] = n;
  } else if ('lose' in e) {
    let n = num(c, e.n);
    if (e.upTo === 'have') n = Math.min(Math.max(0, s[e.lose]), n);
    s[e.lose] -= n;
    if (e.as) c.vars[e.as] = n;
  } else if ('trait' in e) {
    const x = who(c, e.to);
    const base = traitId(c, e.trait);
    if (e.fresh && x?.traits.includes(base)) return;
    const id = e.p === undefined ? base : roll(c, e.p) ? base : e.or;
    if (!x || !id) return;
    x.traits = addTrait(x.traits, id);
    if (e.say) notes.push(`${x.name} ${e.say} ${TRAITS[id].name}.`);
  } else if ('traitFrom' in e) {
    const id = pick(s, e.traitFrom);
    const x = who(c, e.to);
    if (x) x.traits = addTrait(x.traits, id);
    if (e.as) c.vars[e.as] = TRAITS[id].name;
  } else if ('stat' in e) {
    const x = who(c, e.to);
    if (x) x.base[e.stat] += e.n;
  } else if ('health' in e) {
    const x = who(c, e.to);
    if (x) x.health += e.health;
  } else if ('sicken' in e) {
    const x = who(c, e.sicken);
    if (x) sicken(s, x);
  } else if ('cure' in e) {
    const x = who(c, e.cure);
    if (x) x.traits = x.traits.filter((t) => t !== 'ill');
  } else if ('kill' in e) {
    const x = who(c, e.kill);
    if (x) killCharacter(s, x.id, e.cause);
  } else if ('dev' in e) {
    const reg = regionOf(c, e.region);
    if (reg) reg.dev = clamp(reg.dev + e.dev, 1, 10);
  } else if ('opinion' in e) {
    const k = clanOf(c, e.clan);
    if (k) k.opinion = e.max === undefined ? k.opinion + e.opinion : Math.min(e.max, k.opinion + e.opinion);
  } else if ('remember' in e) {
    remember(s, clanOf(c, e.clan)?.id, e.remember, e.value, e.decay);
  } else if ('feud' in e) {
    const id = clanOf(c, e.feud)?.id;
    if (id && !s.feuds.includes(id)) s.feuds.push(id);
  } else if ('claim' in e) {
    const k = clanOf(c, e.claim);
    const regs = k ? clanRegions(s, k.id).filter((x) => !s.claims.includes(x.id)) : [];
    let name = '';
    if (regs.length) {
      const reg = pick(s, regs);
      s.claims.push(reg.id);
      name = reg.name;
    }
    if (e.as) c.vars[e.as] = name;
  } else if ('item' in e) {
    const id = newId(s, 'i');
    const r = e.item.rarity;
    const rarity = Array.isArray(r) ? (roll(c, r[0]) ? r[1] : r[2]) : r;
    const item = makeItem(s, id, { slot: e.item.slot, rarity, origin: e.item.origin });
    s.items.push(item);
    if (e.as) c.vars[e.as] = item.name;
  } else if ('flag' in e) {
    setFlag(s, e.flag, s.year + num(c, e.in), e.data?.(c) ?? {});
  } else if ('clearFlag' in e) {
    clearFlag(s, e.clearFlag);
  } else if ('pick' in e) {
    c.picks[e.pick] = e.get(c);
  } else if ('set' in e) {
    c.vars[e.set] = roll(c, e.roll) ? 1 : 0;
  } else if ('feel' in e) {
    const a = who(c, e.from);
    const b = who(c, e.to);
    if (a && b) addFeeling(s, a.id, b.id, { why: e.why, value: e.feel, decay: e.decay ?? 1, key: e.key });
  } else if ('forgive' in e) {
    const a = who(c, e.from);
    const b = who(c, e.to);
    if (a && b) forget(s, a.id, b.id, e.forgive);
  } else {
    const note = e.run(c);
    if (note) notes.push(note);
  }
}

function play(c: Ctx, o: Outcome, notes: string[]): Text | undefined {
  for (const e of o.do ?? []) apply(c, e, notes);
  let text = o.text;
  if (o.roll !== undefined || o.if) {
    const ok = o.roll !== undefined ? roll(c, o.roll) : holds(c, o.if!);
    const next = ok ? o.pass : o.fail;
    if (next) text = play(c, next, notes) ?? text;
  }
  return text;
}

function render(c: Ctx, t: Text | undefined): string {
  return typeof t === 'function' ? t(c) : (t ?? '');
}

// ── Describing ────────────────────────────────────────────────────────────

interface Describe {
  c: Ctx;
  /** What picks are called before they're made: "a random courtier". */
  names: Record<string, string>;
}

function nameOf(d: Describe, w: Who = 'root'): string {
  if (w === 'root') return 'you';
  if (w in d.names) return d.names[w];
  return who(d.c, w)?.name ?? (w === 'heir' ? 'your heir' : 'someone');
}

function clanName(d: Describe, key: string): string {
  if (key in d.names) return d.names[key];
  const k = clanOf(d.c, key);
  return k ? `House ${k.name}` : 'a rival house';
}

/** "you become" / "Vula becomes". */
function verb(d: Describe, w: Who | undefined, you: string, them: string): string {
  const n = nameOf(d, w);
  return n === 'you' ? `you ${you}` : `${n} ${them}`;
}

function signed(n: number, text: string): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n)} ${text}`;
}

function describeEffect(d: Describe, e: Effect): string {
  const c = d.c;
  if ('deed' in e) return `${nameOf(d, e.to)}: ${signed(e.n ?? 1, DEED_LABELS[e.deed].toLowerCase())} towards reputation`;
  if ('gain' in e) return amountText(c, '+', e.n, RESOURCE[e.gain]);
  if ('lose' in e) return amountText(c, '−', e.n, RESOURCE[e.lose]);
  if ('trait' in e) {
    const base = traitId(c, e.trait);
    const t = TRAITS[base].name;
    const gain = verb(d, e.to, 'gain', 'gains');
    if (e.fresh && who(c, e.to)?.traits.includes(base)) return '';
    if (e.p === undefined) return `${gain} ${t}`;
    const pct = Math.round(oddsOf(c, e.p) * 100);
    if (!e.or) return `${pct}%: ${gain} ${t}`;
    return `${gain} ${t} or ${TRAITS[e.or].name} (${pct === 50 ? '50/50' : `${pct}% / ${100 - pct}%`})`;
  }
  if ('traitFrom' in e) return `${verb(d, e.to, 'gain', 'gains')} ${e.text}`;
  if ('stat' in e) {
    const n = nameOf(d, e.to);
    return `${n === 'you' ? '' : `${n} `}${signed(e.n, STAT_NAMES[e.stat])}`;
  }
  if ('health' in e) {
    const n = nameOf(d, e.to);
    return `${n === 'you' ? '' : `${n} `}${signed(e.health, 'health')}`;
  }
  if ('sicken' in e) return verb(d, e.sicken, 'fall ill', 'falls ill');
  if ('cure' in e) return verb(d, e.cure, 'are cured', 'is cured');
  if ('kill' in e) return verb(d, e.kill, 'die', 'dies');
  if ('dev' in e) {
    const reg = e.region in d.names ? d.names[e.region] : regionOf(c, e.region)?.name;
    return `${signed(e.dev, 'development')}${reg ? ` in ${reg}` : ''}`;
  }
  if ('opinion' in e)
    return `${clanName(d, e.clan)} ${e.opinion >= 0 ? 'likes you more' : 'likes you less'} (${e.opinion >= 0 ? '+' : '−'}${Math.abs(e.opinion)})`;
  if ('remember' in e) return `${clanName(d, e.clan)} remembers this (${e.value >= 0 ? '+' : '−'}${Math.abs(e.value)})`;
  if ('feud' in e) return `a Blood Feud with ${clanName(d, e.feud)}`;
  if ('claim' in e) return `a claim on land held by ${clanName(d, e.claim)}`;
  if ('item' in e) return e.item.slot === 'relic' ? 'a relic for your treasury' : e.item.slot === 'flagship' ? 'a new flagship' : 'an item for your treasury';
  if ('pick' in e) {
    d.names[e.pick] = render(c, e.text);
    return e.say ? render(c, e.say) : '';
  }
  if ('feel' in e) {
    const to = nameOf(d, e.to);
    const likes = nameOf(d, e.from) === 'you' ? `you like ${to}` : `${nameOf(d, e.from)} likes ${to}`;
    return `${likes} ${e.feel >= 0 ? 'more' : 'less'} (${e.feel >= 0 ? '+' : '−'}${Math.abs(e.feel)})`;
  }
  if ('flag' in e || 'clearFlag' in e || 'set' in e || 'forgive' in e) return '';
  return render(c, e.text);
}

function describeOutcome(d: Describe, o: Outcome): string {
  const parts = (o.do ?? []).map((e) => describeEffect(d, e)).filter(Boolean);
  if (o.roll !== undefined) {
    const pass = o.pass ? describeOutcome(d, o.pass) : '';
    const fail = o.fail ? describeOutcome(d, o.fail) : '';
    parts.push(`${probText(d.c, o.roll)}: ${pass || 'nothing happens'}${fail ? ` · otherwise ${fail}` : ''}`);
  } else if (o.if) {
    const k = o.if;
    const ok = 'test' in k && k.assume !== undefined ? k.assume : holds(d.c, k);
    const next = ok ? o.pass : o.fail;
    const t = next ? describeOutcome(d, next) : '';
    if (t) parts.push(t);
  }
  return parts.join(', ');
}

// ── Bounds (for tests: what an option can do to each resource) ───────────

export type Bounds = Partial<Record<Resource, [number, number]>>;

/** The least and most each resource can change by, without rolling. Unknown (custom) changes leave a resource unbounded. */
export function outcomeBounds(ctx: EventCtx, o: Outcome): Bounds | 'unknown' {
  const c = ctxOf(ctx);
  const walk = (o: Outcome): Bounds[] | 'unknown' => {
    let here: Bounds = {};
    for (const e of o.do ?? []) {
      if ('run' in e) return 'unknown';
      if (!('gain' in e) && !('lose' in e)) continue;
      const r = numRange(c, e.n);
      if (!r) return 'unknown';
      const res = 'gain' in e ? e.gain : e.lose;
      const [lo, hi] = 'gain' in e ? r : e.upTo ? [-r[1], 0] : [-r[1], -r[0]];
      const prev = here[res] ?? [0, 0];
      here = { ...here, [res]: [prev[0] + lo, prev[1] + hi] };
    }
    const nexts = [o.pass, o.fail].filter((x): x is Outcome => !!x);
    if (o.roll === undefined && !o.if) return [here];
    if (nexts.length < 2) nexts.push({});
    const out: Bounds[] = [];
    for (const n of nexts) {
      const sub = walk(n);
      if (sub === 'unknown') return 'unknown';
      for (const b of sub) {
        const merged: Bounds = { ...here };
        for (const [k, v] of Object.entries(b) as [Resource, [number, number]][]) {
          const p = merged[k] ?? [0, 0];
          merged[k] = [p[0] + v[0], p[1] + v[1]];
        }
        out.push(merged);
      }
    }
    return out;
  };
  const paths = walk(o);
  if (paths === 'unknown') return 'unknown';
  const all: Bounds = {};
  for (const b of paths) {
    for (const k of Object.keys(RESOURCE) as Resource[]) {
      const [lo, hi] = b[k] ?? [0, 0];
      const p = all[k];
      all[k] = p ? [Math.min(p[0], lo), Math.max(p[1], hi)] : [lo, hi];
    }
  }
  return all;
}

// ── Compiling to the runtime shape ────────────────────────────────────────

function compile(o: OptionSpec): EventChoice & { spec: OptionSpec } {
  return {
    spec: o,
    label: o.label,
    show: o.show && ((e) => o.show!.every((k) => holds(ctxOf(e), k))),
    available: o.needs && ((e) => o.needs!.every((k) => holds(ctxOf(e), k))),
    run: (e) => {
      const c = ctxOf(e);
      const notes: string[] = [];
      const text = render(c, play(c, o.then, notes));
      return [text, ...notes].filter(Boolean).join(' ');
    },
    describe: (e) => describeOutcome({ c: ctxOf(e), names: {} }, o.then),
    why: (e) => {
      const c = ctxOf(e);
      const k = o.needs?.find((x) => !holds(c, x));
      return k ? whyNot(c, k) : null;
    },
  };
}

export function defineEvent(spec: EventSpec): EventDef {
  const { options, ...rest } = spec;
  return { ...rest, choices: options.map(compile) };
}
