// Shared shapes for the Web of Houses (WAVE-5-CONTRACT.md). The engine lane
// fills these in; the war, save and UI lane stores and shows them.

/** Why a house is called: the sovereign at the top of the realm, a sworn house of it, or any house of a world standing united. */
export type RealmRole = 'sovereign' | 'vassal' | 'planet';

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
}

/** What a house actually did, saved with the war. */
export interface RealmCallAnswer extends RealmCallOffer {
  answer: 'accepted' | 'refused' | 'blocked' | 'pending';
  /** The actual person who decided; never reconstructed after a succession. */
  rulerId?: string;
  year: number;
}
