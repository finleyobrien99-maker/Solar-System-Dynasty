// Noble dossiers (wave 1, NEXT-WAVES.md): what *you* know about a person,
// split into facts, rumours, leverage you hold, and what they have on you.
// It reads only what your ruler could know: public positions and deeds,
// grudges people have told you about, exposed scandals, whispers with a named
// source. A secret nobody has found out never appears, and a rumour is never
// presented as fact. Pure and dice-free, so the UI can call it while rendering.
//
// Evidence and hooks use the same personal knowledge gates as the actions.
// Other people knowing a secret does not make it public.

import { aiAmbition } from './aiAmbition';
import { pactsOf } from './aiCourt';
import { ageOf, alive, ch, charTitle, childrenOf, clanRegions, ruler } from './core';
import { ROLES, roleOf } from './council';
import { isRival } from './memory';
import { closeKin, feelingNow, opinionLines, opinionOf } from './relations';
import { hooksOf, secretLabel, secretsKnownTo } from './secrets';
import type { Character, Feeling, GameState } from './types';

export type Tone = 'good' | 'bad' | 'neutral';

export interface DossierLine {
  text: string;
  /** Where it comes from: "public record", "Mira Okafor's family", "they told you so". */
  source: string;
  tone: Tone;
  /** Someone the line is about, for a link. */
  personId?: string;
}

export interface Dossier {
  /** Established facts your ruler knows, including private evidence. */
  facts: DossierLine[];
  /** Talked about, never proven. */
  rumours: DossierLine[];
  /** What you could use: favours owed, kin in your cells, secrets you share. */
  leverage: DossierLine[];
  /** What they have on you. */
  againstYou: DossierLine[];
}

const now = (s: GameState, f: Feeling) => Math.round(feelingNow(f, s.year));

function feelings(s: GameState, fromId: string, toId: string): Feeling[] {
  return s.relations[fromId]?.[toId]?.feelings ?? [];
}

function kinWord(target: Character, kin: Character): string {
  if (kin.spouseId === target.id) return kin.gender === 'M' ? 'husband' : 'wife';
  if (kin.fatherId === target.id || kin.motherId === target.id) return kin.gender === 'M' ? 'son' : 'daughter';
  if (target.fatherId === kin.id || target.motherId === kin.id) return kin.gender === 'M' ? 'father' : 'mother';
  return kin.gender === 'M' ? 'brother' : 'sister';
}

/** Public evidence of this actual pair, not another spouse's private feelings. */
export function affairExposed(s: GameState, a: Character, b: Character): boolean {
  return secretsKnownTo(s).some(
    (x) => x.kind === 'affair' && x.exposedYear !== undefined && ((x.subjectId === a.id && x.otherId === b.id) || (x.subjectId === b.id && x.otherId === a.id)),
  );
}

/** People holding a feeling about `target` whose key starts with `prefix`, with the feeling. */
function heldAbout(s: GameState, targetId: string, test: (f: Feeling) => boolean): { holder: Character; f: Feeling }[] {
  const out: { holder: Character; f: Feeling }[] = [];
  for (const [id, row] of Object.entries(s.relations)) {
    const f = row[targetId]?.feelings.find((x) => test(x) && feelingNow(x, s.year) !== 0);
    const holder = s.characters[id];
    if (f && alive(holder)) out.push({ holder, f });
  }
  return out;
}

function facts(s: GameState, c: Character, me: Character): DossierLine[] {
  const out: DossierLine[] = [];
  const house = s.clans[c.clanId];
  const title = charTitle(s, c);
  if (title && house) out.push({ text: `${title}, head of House ${house.name}`, source: 'public record', tone: 'neutral' });
  else if (house && !house.isPlayer) {
    const head = ch(s, house.headId);
    const eldest =
      head &&
      childrenOf(s, head)
        .filter((k) => alive(k) && k.clanId === house.id)
        .sort((a, b) => a.born - b.born)[0];
    if (head && eldest?.id === c.id) out.push({ text: `Heir to House ${house.name}`, source: 'public record', tone: 'neutral', personId: head.id });
  }
  const role = roleOf(s, c.id);
  if (role) out.push({ text: `Sits on your council as ${ROLES[role].name}`, source: 'public record', tone: 'neutral' });
  if (c.prisonerOf) {
    const captor = s.clans[c.prisonerOf];
    if (captor) out.push({ text: captor.isPlayer ? 'Held in your cells' : `Held captive by House ${captor.name}`, source: 'public record', tone: 'bad' });
  }

  // Where they stand with you, and the biggest reason why.
  if (c.id !== me.id) {
    const op = opinionOf(s, c, me);
    const why = opinionLines(s, c, me)[0];
    const mood =
      op >= 40 ? 'Thinks highly of you' : op >= 10 ? 'Well disposed to you' : op > -10 ? 'Indifferent to you' : op > -40 ? 'Dislikes you' : 'Hates you';
    out.push({
      text: `${mood} (${op > 0 ? '+' : ''}${op})${why ? `: mostly "${why.label}"` : ''}`,
      source: 'how they treat you',
      tone: op >= 10 ? 'good' : op <= -10 ? 'bad' : 'neutral',
    });
    for (const f of feelings(s, c.id, me.id).filter((f) => f.grave && now(s, f) < 0))
      out.push({ text: `Will not forgive you: ${f.why.toLowerCase()}`, source: 'they have said so', tone: 'bad' });
  }

  // Friends, rivals and blood feuds are talked about openly. Lovers are not.
  for (const [id, rel] of Object.entries(s.relations[c.id] ?? {})) {
    const o = s.characters[id];
    if (!alive(o) || o.id === me.id) continue;
    if (rel.kind === 'friend') out.push({ text: `Friends with ${o.name}`, source: 'seen together at court', tone: 'neutral', personId: o.id });
    if (rel.kind === 'rival' || rel.kind === 'nemesis')
      out.push({ text: `${rel.kind === 'nemesis' ? 'Nemesis' : 'Rival'} of ${o.name}`, source: 'common knowledge', tone: 'bad', personId: o.id });
    const blood = rel.feelings.find((f) => f.grave && now(s, f) < 0 && !f.key?.startsWith('suspect:'));
    if (blood) out.push({ text: `Sworn enemy of ${o.name}: ${blood.why.toLowerCase()}`, source: 'common knowledge', tone: 'bad', personId: o.id });
  }

  out.push(...knownSecretLines(s, c, me));

  if (house && !house.isPlayer && house.headId === c.id) {
    out.push({ text: `Ambition: ${aiAmbition(s, house).text}`, source: 'their reputation', tone: 'neutral' });
    for (const id of pactsOf(s, house.id)) out.push({ text: `House bound by marriage to House ${s.clans[id].name}`, source: 'public record', tone: 'neutral' });
    if (isRival(house)) out.push({ text: `Their house is your sworn rival`, source: 'public record', tone: 'bad' });
    if (!clanRegions(s, house.id).length) out.push({ text: 'Their house has lost all its land', source: 'public record', tone: 'bad' });
  }
  return out;
}

function rumours(s: GameState, c: Character): DossierLine[] {
  const out: DossierLine[] = [];
  // A family that suspects someone of a killing talks about it.
  for (const { holder, f } of heldAbout(s, c.id, (f) => !!f.key?.startsWith('suspect:'))) {
    const victim = s.characters[f.key!.slice('suspect:'.length)];
    const text = `Rumoured to be behind the death of ${victim?.name ?? 'someone close to the court'}`;
    if (!out.some((l) => l.text === text)) out.push({ text, source: `${holder.name} suspects it`, tone: 'bad', personId: victim?.id });
  }
  // People squeezed for money complain.
  for (const { holder } of heldAbout(s, c.id, (f) => f.key === `blackmail:${c.id}`))
    out.push({ text: `Said to have blackmailed ${holder.name}`, source: `${holder.name}'s complaints`, tone: 'bad', personId: holder.id });
  return out;
}

function leverage(s: GameState, c: Character, me: Character): DossierLine[] {
  const out: DossierLine[] = [];
  // Gratitude you can call on.
  for (const f of feelings(s, c.id, me.id)) {
    const v = now(s, f);
    if (v >= 15 && f.key !== 'lover') out.push({ text: `Owes you: ${f.why.toLowerCase()} (+${v})`, source: 'gratitude; not a spendable hook', tone: 'good' });
  }
  // Their family in your cells.
  for (const k of closeKin(s, c))
    if (k.prisonerOf === s.playerClanId) out.push({ text: `You hold their ${kinWord(c, k)}, ${k.name}`, source: 'your cells', tone: 'good', personId: k.id });
  // A secret you share.
  if (c.loverId === me.id && me.loverId === c.id) {
    const known = affairExposed(s, c, me);
    out.push({
      text: known ? 'Your lover, and everyone knows it' : 'Your lover; no public evidence',
      source: 'you',
      tone: known ? 'neutral' : 'good',
    });
  }
  for (const hook of hooksOf(s, me.id).filter((x) => x.targetId === c.id)) {
    const secret = secretsKnownTo(s, me.id).find((x) => x.id === hook.secretId)!;
    out.push({
      text: `One-use hook: ${secretLabel(s, secret, me.id)}`,
      source: 'your evidence; demand payment or a marriage in Secrets & hooks',
      tone: 'good',
    });
  }
  return out;
}

/** Private proof stays known after spending a hook or ending an affair. */
function knownSecretLines(s: GameState, c: Character, me: Character): DossierLine[] {
  return secretsKnownTo(s, me.id)
    .filter((x) => x.subjectId === c.id)
    .map((secret) => ({
      text: `${secret.exposedYear === undefined ? 'Private' : 'Public'} evidence: ${secretLabel(s, secret, me.id)}`,
      source: secret.exposedYear === undefined ? `your evidence, cycle ${secret.year}` : `published in cycle ${secret.exposedYear}`,
      tone: 'bad',
      personId: secret.otherId,
    }));
}

function againstYou(s: GameState, c: Character, me: Character): DossierLine[] {
  const out: DossierLine[] = [];
  for (const f of feelings(s, c.id, me.id)) {
    if (now(s, f) >= 0) continue;
    if (f.key?.startsWith('suspect:')) out.push({ text: `Suspects you: ${f.why.toLowerCase()}`, source: 'their manner', tone: 'bad' });
    if (f.key?.startsWith('seduced:')) out.push({ text: `Knows you ${f.why.toLowerCase()}`, source: 'they found out', tone: 'bad' });
  }
  if (feelings(s, me.id, c.id).some((f) => f.key === `blackmail:${c.id}`))
    out.push({ text: 'Has blackmailed you before', source: 'you remember it', tone: 'bad' });
  // Knowing that another person knows your secret requires an observable demand.
  // Do not reveal the AI's private hooks just because we can read the ledger.
  const letter = s.pending.find((p) => p.kind === 'event' && p.eventId === 'blackmail_letter' && p.subjectId === c.id);
  if (letter?.kind === 'event') {
    const hook = hooksOf(s, c.id).find((x) => x.id === letter.data?.hookId && x.targetId === me.id && x.secretId === letter.data?.secretId);
    const secret = hook && s.secrets.find((x) => x.id === hook.secretId);
    if (secret)
      out.push({
        text: `Threatening to expose: ${secretLabel(s, secret, c.id)}`,
        source: 'their blackmail letter; one-use hook',
        tone: 'bad',
      });
  }
  // Your family in their house's cells.
  const house = s.clans[c.clanId];
  if (house && !house.isPlayer && house.headId === c.id)
    for (const k of Object.values(s.characters))
      if (alive(k) && k.prisonerOf === house.id && k.clanId === s.playerClanId)
        out.push({ text: `Their house holds ${k.name} captive`, source: 'their ransom letters', tone: 'bad', personId: k.id });
  return out;
}

/** Everything your ruler knows about `targetId`. */
export function dossier(s: GameState, targetId: string): Dossier {
  const c = s.characters[targetId];
  const me = ruler(s);
  if (!c || !alive(me)) return { facts: [], rumours: [], leverage: [], againstYou: [] };
  if (c.id === me.id) return { facts: facts(s, c, me), rumours: rumours(s, c), leverage: [], againstYou: [] };
  return { facts: facts(s, c, me), rumours: rumours(s, c), leverage: leverage(s, c, me), againstYou: againstYou(s, c, me) };
}

/** Whether a dossier is worth showing: living adults, other than you. */
export function hasDossier(s: GameState, c: Character): boolean {
  return alive(c) && c.id !== s.rulerId && ageOf(s, c) >= 12;
}
