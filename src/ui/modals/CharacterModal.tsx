import { SecretsSection } from '../sections/SecretsSection';
import { affairInfo } from '../courtInfo';
import { retiredRuler } from '../../game/life';
import { RulerLegacy } from '../sections/RulerLegacy';
import { EpithetsSection } from '../sections/EpithetsSection';
import { ageOf, alive, ch, charTitle, childrenOf, fullName, isVip, lifespan, relationTo, ruler, siblingsOf } from '../../game/core';
import {
  augment,
  augmentBlocker,
  augmentCost,
  augmentRisk,
  AUGMENTS,
  canSeekSpouse,
  designateHeir,
  generateSuitors,
  legitimize,
  LEGITIMIZE_COST,
  suitorMode,
} from '../../game/family';
import { canAfford } from '../../game/genetics';
import { runScheme, schemeBlocker, schemeChance } from '../../game/intrigue';
import { FAITHS, PLANET_BY_ID } from '../../game/planets';
import { TRAITS } from '../../game/traits';
import type { Character } from '../../game/types';
import { Btn, CaptivityStatus, CharCard, ClanBadge, Face, HealthBar, InfoDot, Modal, StatBlock, TraitList } from '../components';
import { EduControls } from '../tabs/FamilyTab';
import { useGame } from '../store';
import { FoundCadetPanel } from '../sections/CadetSection';
import { roleOf, ROLES } from '../../game/council';
import { RelationshipsSection } from '../sections/RelationshipsSection';
import { DossierSection } from '../sections/DossierSection';
import { UpbringingSection } from '../sections/UpbringingSection';
import { VipEditor } from '../vip/VipEditor';
import { canEditPortrait } from '../../game/identity';
import { CharacterAppearanceEditor } from '../editors/CharacterAppearanceEditor';

function Links({ label, people }: { label: string; people: Character[] }) {
  const { openChar } = useGame();
  if (!people.length) return null;
  return (
    <div style={{ marginBottom: 'var(--space-6px)' }}>
      <span className="muted">{label}: </span>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <button className="btn ghost small" style={{ padding: '0 6px', minHeight: 24 }} onClick={() => openChar(p.id)}>
            {p.name}
            {!alive(p) && ' †'}
          </button>
        </span>
      ))}
    </div>
  );
}

export function CharacterModal({ id }: { id: string }) {
  const { s, act, openChar, setUi, toast } = useGame();
  const c = s.characters[id] ?? s.suitors?.list.find((x) => x.char.id === id)?.char;
  if (!c) return null;
  const r = ruler(s);
  const isDynasty = c.clanId === s.playerClanId;
  const isRuler = c.id === r.id;
  const rel = relationTo(s, c);
  const title = charTitle(s, c);
  const living = alive(c);
  const parents = [ch(s, c.fatherId), ch(s, c.motherId)].filter((x): x is Character => !!x);
  const spouse = ch(s, c.spouseId);
  const affair = affairInfo(s, c);
  const kids = childrenOf(s, c);
  const sibs = siblingsOf(s, c);
  const cyberOpen = living && (isDynasty || c.id === r.spouseId);

  return (
    <Modal title={fullName(s, c)} onClose={() => openChar(undefined)} wide>
      <div className="hero">
        <div>
          <Face c={c} size={150} />
        </div>
        <div className="stack" style={{ gap: 'var(--space-8px)' }}>
          <div>
            <div className="gold">{[rel, title].filter(Boolean).join(' · ')}</div>
            <div className="muted" style={{ fontSize: 'var(--font-size-0_86rem)' }}>
              {living ? `Age ${ageOf(s, c)}` : `${c.born}–${c.died}, ${c.deathCause}`} · {c.gender === 'M' ? 'Male' : 'Female'} ·{' '}
              {PLANET_BY_ID[c.planetId]?.adjective} · {FAITHS[c.faithId]?.name}
              {living && <InfoDot text={`Expected lifespan around ${lifespan(c)}.`} />}
            </div>
            <div className="row wrap" style={{ marginTop: 'var(--space-6px)' }}>
              <ClanBadge clanId={c.clanId} />
              {retiredRuler(s, c.id) && (
                <span className="pill gold">
                  {s.dynasty.rulers.find((r) => r.id === c.id && r.to !== undefined)?.end === 'deposed' ? 'Deposed ruler' : 'Retired ruler'}
                </span>
              )}
              {c.bastard && <span className="pill red">Unsanctioned birth</span>}
              {living && c.prisonerOf === s.playerClanId && <span className="pill red">Held by your house</span>}
              {s.dynasty.designatedHeir === c.id && <span className="pill gold">Designated heir</span>}
              {roleOf(s, c.id) && <span className="pill cyan">{ROLES[roleOf(s, c.id)!].name}</span>}
              {c.cloneOf && <span className="pill">Clone of {s.characters[c.cloneOf]?.name ?? 'an ancestor'}</span>}
            </div>
          </div>
          <CaptivityStatus c={c} />
          {living && <HealthBar s={s} c={c} />}
          <StatBlock s={s} c={c} />
          <TraitList c={c} s={s} collapseOnPhone />
          {isDynasty && c.traits.some((t) => TRAITS[t]?.cat === 'genetic') && (
            <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)' }}>
              Genetic traits can be locked into the bloodline from the Bloodline tab while {c.name} is alive.
            </div>
          )}
        </div>
      </div>
      {canEditPortrait(s, c) && <CharacterAppearanceEditor key={c.id + '-appearance'} c={c} />}
      {isVip(s) && <VipEditor key={c.id} c={c} />}
      <hr className="divider" />
      <Links label="Parents" people={parents} />
      <Links label="Spouse" people={spouse ? [spouse] : []} />
      {affair && (
        <div className="card flat" style={{ marginBottom: 'var(--space-8px)' }}>
          <Links label="Lover" people={[affair.lover]} />
          <span className={affair.status === 'Exposed affair' ? 'bad' : 'muted'}>{affair.status}</span>
          <InfoDot text="This link appears only when you are a participant or know evidence about these lovers. Private evidence can buy a favour; public evidence cannot." />
        </div>
      )}
      <Links label="Betrothed" people={c.betrothedId && s.characters[c.betrothedId] ? [s.characters[c.betrothedId]] : []} />
      <Links label="Children" people={kids} />
      <Links label="Siblings" people={sibs} />
      {(c.reputation || s.dynasty.rulers.some((r) => r.id === c.id)) && <RulerLegacy c={c} />}
      <EpithetsSection c={c} />
      <RelationshipsSection c={c} />
      <DossierSection c={c} />
      <SecretsSection key={c.id} c={c} />
      <UpbringingSection key={'upbringing-' + c.id} c={c} />

      {living && isDynasty && c.edu && (
        <div className="card flat" style={{ marginTop: 'var(--space-8px)' }}>
          <h4>Education</h4>
          <EduControls c={c} />
        </div>
      )}

      {living && isDynasty && !isRuler && (
        <div className="btn-row" style={{ marginTop: 'var(--space-10px)' }}>
          {!canSeekSpouse(s, c) && ageOf(s, c) >= 3 && (
            <Btn
              icon="heart"
              onClick={() => {
                act((d) => generateSuitors(d, c.id));
                openChar(undefined);
                setUi({ panel: 'suitors' });
              }}
            >
              {suitorMode(s, c) === 'marry' ? 'Arrange marriage' : 'Arrange betrothal'}
            </Btn>
          )}
          {c.bastard && (
            <Btn reason={canAfford(s, LEGITIMIZE_COST) ? null : 'Need 150 prestige'} onClick={() => act((d) => legitimize(d, c.id))}>
              Legitimise (150 prestige)
            </Btn>
          )}
          {s.dynasty.law === 'designated' && !c.bastard && s.dynasty.designatedHeir !== c.id && (
            <Btn kind="good" reason={retiredRuler(s, c.id) ? 'Retired rulers cannot inherit again.' : null} onClick={() => act((d) => designateHeir(d, c.id))}>
              Designate as heir
            </Btn>
          )}
        </div>
      )}
      {living && isRuler && canSeekSpouse(s, c) === null && (
        <div className="btn-row" style={{ marginTop: 'var(--space-10px)' }}>
          <Btn
            kind="primary"
            icon="heart"
            onClick={() => {
              act((d) => generateSuitors(d, c.id));
              openChar(undefined);
              setUi({ panel: 'suitors' });
            }}
          >
            Find a spouse
          </Btn>
        </div>
      )}

      {living && c.clanId === s.playerClanId && !isRuler && ageOf(s, c) >= 18 && !c.marriedIn && <FoundCadetPanel c={c} />}

      {cyberOpen && (
        <details style={{ marginTop: 'var(--space-12px)' }}>
          <summary className="gold">Cybernetic augments</summary>
          <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)', margin: '6px 0' }}>
            Implants are never inherited. Risk of complications: {Math.round(augmentRisk(s, c) * 100)}% (lower with more Science).
            {s.clans[s.playerClanId].faithId === 'machine' && ' Machine Synod discount: 30% off.'}
          </div>
          <div className="grid tight">
            {AUGMENTS.map((a) => {
              const t = TRAITS[a.id];
              const block = augmentBlocker(s, c, a.id);
              return (
                <div key={a.id} className="card flat" style={{ padding: 'var(--space-8px)' }}>
                  <b>{t.name}</b>
                  <div className="muted" style={{ fontSize: 'var(--font-size-0_75rem)' }}>
                    {t.desc}
                  </div>
                  <div className="spread" style={{ marginTop: 'var(--space-4px)' }}>
                    <span className="pill gold">{augmentCost(s, a.id)}</span>
                    <Btn small reason={block} onClick={() => act((d) => augment(d, c.id, a.id))}>
                      Install
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {living && !isDynasty && c.id !== r.spouseId && (
        <div className="card flat" style={{ marginTop: 'var(--space-12px)' }}>
          <h4>Intrigue</h4>
          <div className="btn-row">
            {c.gender !== r.gender && ageOf(s, c) >= 16 && (
              <Btn small icon="heart" reason={schemeBlocker(s, 'seduce', c.id)} onClick={() => act((d) => runScheme(d, 'seduce', c.id))}>
                Seduce ({Math.round(schemeChance(s, 'seduce', c.id) * 100)}%)
              </Btn>
            )}
            <Btn
              small
              kind="danger"
              icon="scheme"
              reason={schemeBlocker(s, 'assassinate', c.id)}
              confirm="Tap again to send it"
              onClick={() => {
                act((d) => runScheme(d, 'assassinate', c.id));
                toast('The drone is away.');
              }}
            >
              Assassin drone ({Math.round(schemeChance(s, 'assassinate', c.id) * 100)}%)
            </Btn>
          </div>
        </div>
      )}
      {spouse && !alive(spouse) && (
        <div className="dim" style={{ marginTop: 'var(--space-8px)' }}>
          Widowed.
        </div>
      )}
      {isRuler && kids.length > 0 && (
        <div style={{ marginTop: 'var(--space-12px)' }}>
          <h4>Children</h4>
          <div className="grid tight">
            {kids.slice(0, 6).map((k) => (
              <CharCard key={k.id} c={k} size={44} traitsMax={2} />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
