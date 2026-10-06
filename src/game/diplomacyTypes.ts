// Shared shapes for the Web of Houses (WAVE-5-CONTRACT.md). The engine lane
// fills these in; the war, save and UI lane stores and shows them.

/**
 * Why a house is called: the sovereign at the top of the realm, a sworn house
 * of it, any house of a world standing united, or a treaty partner (a
 * defensive pact, a guarantee, or tribute it is paid) bound to defend.
 */
export type RealmRole = 'sovereign' | 'vassal' | 'planet' | 'pact';

/** A public-safe explanation: what counted, and by how much if it is a number worth showing. */
export interface Reason {
  label: string;
  value?: number;
}

/** What a house would do if called now. Pure description: computing it never rolls dice or changes anything. */
export interface RealmCallOffer {
  clanId: string;
  /** The house's direct liege when called (it may differ from the realm's sovereign). */
  liegeId?: string;
  role: RealmRole;
  /** 0 to 1. 1 is a duty it cannot decline (the sovereign, a united world); 0 when blocked. */
  chance: number;
  reasons: Reason[];
  /** A hard inability (captive, child, already at war, sworn peace with the attacker...). Not a refusal. */
  blocker?: string;
  /** Ships it would send: half its available home fleet. */
  proposedShips: number;
  /** For a treaty partner: the treaty that binds it. Staying home breaks it. */
  treatyId?: string;
}

/** What a house actually did, saved with the war. */
export interface RealmCallAnswer extends RealmCallOffer {
  answer: 'accepted' | 'refused' | 'blocked' | 'pending';
  /** The actual person who decided; never reconstructed after a succession. */
  rulerId?: string;
  year: number;
}

// ── Treaties (slice 2) ────────────────────────────────────────────────────

/**
 * - nonAggression: neither declares war on the other.
 * - defensive: each defends the other when attacked.
 * - trade: both earn credits each cycle; ends with any war between them.
 * - guarantee: `a` (the protector) defends `b` (the protected) from anyone.
 * - tribute: `b` (the payer) pays `a` (the recipient) each cycle; `a` will not attack `b` and defends it.
 */
export type TreatyKind = 'nonAggression' | 'defensive' | 'trade' | 'guarantee' | 'tribute';

/** What a proposal asks for. For guarantee and tribute, `a` is the stronger side (protector, recipient). */
export interface TreatyTerms {
  kind: TreatyKind;
  a: string;
  b: string;
  /** Cycles it runs for. */
  years: number;
  /** Tribute paid each cycle. */
  amount?: number;
}

export interface Treaty extends TreatyTerms {
  id: string;
  signed: number;
  /** It lapses when the year reaches this. */
  until: number;
}

/** An offer waiting for your answer. Its exact terms are saved, and revalidated when you answer. */
export interface TreatyProposal extends TreatyTerms {
  id: string;
  from: string;
  to: string;
  year: number;
  /** It lapses unanswered when the year reaches this. */
  expires: number;
}

/** What one house remembers of another (both AI). What AI houses remember of you stays in Clan.memories. */
export interface HouseMemory {
  observer: string;
  subject: string;
  text: string;
  year: number;
  value: number;
  decay: number;
  grave?: boolean;
}

export interface DiplomacyState {
  treaties: Treaty[];
  proposals: TreatyProposal[];
  memories: HouseMemory[];
  /** How far `observer` trusts `subject`, -100 to 100, keyed `observer>subject`. Absent is neutral (0). */
  trust: Record<string, number>;
  /** The year trust last grew between a pair (keyed by the pair), so it grows at most once a cycle. */
  trustYear: Record<string, number>;
}

/**
 * What a demand asks for. These are the cede and tribute shapes of the war
 * lane's WarGoal (warGoals.ts), so a refused demand becomes a war goal unchanged.
 */
export type DemandGoal = { kind: 'cede'; regionId: string } | { kind: 'tribute'; amount: number; years: number };

/**
 * An ultimatum waiting for your answer (slice 3). AI targets answer at once,
 * so only yours wait. A refusal leaves this record; the war lane keeps the
 * justification it gives (warGoals.ts, `warJustifications`).
 */
export interface SavedUltimatum {
  id: string;
  from: string;
  to: string;
  goal: DemandGoal;
  year: number;
  /** It lapses unanswered when the year reaches this. */
  expires: number;
}

export interface ForeignPolicyState {
  ultimatums: SavedUltimatum[];
  /** The lord each AI house had when it last reviewed its treaties, so a new lord's review happens once. */
  heads: Record<string, string>;
}
