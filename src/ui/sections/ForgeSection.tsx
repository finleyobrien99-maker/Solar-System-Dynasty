import { useState } from 'react';
import { ageOf, alive, bloodlineMembers, isBloodlineClan, isVip } from '../../game/core';
import {
  buildBlocker,
  buildForge,
  buildVats,
  cancelResearch,
  cloneBlocker,
  cloneCharacter,
  cloneCost,
  cloneSources,
  FORGE_COST,
  forgeLevel,
  growVatHeir,
  maxVatGenes,
  researchedGenes,
  RESEARCH_UPKEEP,
  researchable,
  researchNeeded,
  researchRate,
  spliceBlocker,
  spliceChance,
  spliceCost,
  splice,
  stance,
  STANCE_TEXT,
  startResearch,
  VAT_COST,
  vatBlocker,
  vatHeirBlocker,
  vatHeirCost,
  faithName,
} from '../../game/forge';
import { isCloseFamily } from '../../game/life';
import { conflicts, TRAITS } from '../../game/traits';
import { Icon } from '../../svg/Icons';
import { Btn, CostTag, Section, TraitChip } from '../components';
import { useGame } from '../store';

function Research() {
  const { s, act } = useGame();
  const p = s.forge.project;
  const rate = researchRate(s);
  return (
    <div className="card stack" style={{ gap: 'var(--space-10px)' }}>
      <div className="spread">
        <b>Gene research</b>
        <span className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
          {rate} progress per cycle · {RESEARCH_UPKEEP} credits per cycle while running
        </span>
      </div>
      {p ? (
        <div className="stack" style={{ gap: 'var(--space-6px)' }}>
          <div className="spread">
            <span className="row" style={{ gap: 'var(--space-6px)' }}>
              Sequencing <TraitChip id={p.trait} s={s} />
            </span>
            <span className="muted">about {Math.max(1, Math.ceil((p.needed - p.progress) / rate))} cycles left</span>
          </div>
          <div className="bar">
            <span style={{ width: `${Math.min(100, (p.progress / p.needed) * 100)}%`, background: 'linear-gradient(90deg, var(--purple), var(--cyan))' }} />
          </div>
          <div>
            <Btn small kind="ghost" confirm="Tap again to scrap it" onClick={() => act((d) => cancelResearch(d))}>
              Abandon project
            </Btn>
          </div>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 'var(--font-size-0_85rem)' }}>
          No project running. Pick a gene to sequence:
        </div>
      )}
      {!p && (
        <div className="traits">
          {researchable(s).map((id) => (
            <button
              key={id}
              className="btn small"
              onClick={() => act((d) => startResearch(d, id))}
              title={`About ${Math.ceil(researchNeeded(id) / rate)} cycles`}
            >
              {TRAITS[id].name} <span className="muted">~{Math.ceil(researchNeeded(id) / rate)}c</span>
            </button>
          ))}
        </div>
      )}
      {s.forge.researched.length > 0 && (
        <div>
          <h4 style={{ marginBottom: 'var(--space-4px)' }}>Synthesised genes</h4>
          <div className="traits">
            {s.forge.researched.map((id) => (
              <TraitChip key={id} id={id} s={s} />
            ))}
          </div>
          <div className="muted" style={{ fontSize: 'var(--font-size-0_78rem)', marginTop: 'var(--space-4px)' }}>
            These can be locked in the Gene Vault without a living carrier.
          </div>
        </div>
      )}
    </div>
  );
}

function Therapy() {
  const { s, act } = useGame();
  const members = bloodlineMembers(s).sort((a, b) => Number(isCloseFamily(s, b)) - Number(isCloseFamily(s, a)) || b.born - a.born);
  const [who, setWho] = useState(members[0]?.id ?? '');
  const genes = researchedGenes(s);
  const [gene, setGene] = useState(genes[0] ?? '');
  const target = s.characters[who];
  const block = !target ? 'Pick someone.' : !gene ? 'Research a gene first.' : spliceBlocker(s, target, gene);
  return (
    <div className="card stack" style={{ gap: 'var(--space-8px)' }}>
      <b>Gene therapy</b>
      <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
        Rewrite a living relative's genome. Works best on the very young; a rejected splice can leave lasting damage.
      </div>
      <div className="row wrap" style={{ gap: 'var(--space-8px)' }}>
        <select id="splice-who" value={who} onChange={(e) => setWho(e.target.value)} style={{ flex: '1 1 180px', minWidth: 0 }} aria-label="Patient">
          {members.slice(0, 60).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({ageOf(s, c)})
            </option>
          ))}
        </select>
        <select id="splice-gene" value={gene} onChange={(e) => setGene(e.target.value)} style={{ flex: '1 1 140px', minWidth: 0 }} aria-label="Gene">
          {!genes.length && <option value="">No genes researched</option>}
          {genes.map((id) => (
            <option key={id} value={id}>
              {TRAITS[id].name}
            </option>
          ))}
        </select>
      </div>
      <div className="spread">
        <span className="muted" style={{ fontSize: 'var(--font-size-0_82rem)' }}>
          {target ? `${Math.round(spliceChance(s, target) * 100)}% chance it takes` : ''}
        </span>
        <span className="row" style={{ gap: 'var(--space-6px)' }}>
          {gene && <CostTag cost={spliceCost(s, gene)} />}
          <Btn small kind="primary" icon="dna" reason={block} onClick={() => act((d) => splice(d, who, gene))}>
            Splice
          </Btn>
        </span>
      </div>
    </div>
  );
}

function Vats() {
  const { s, act, toast } = useGame();
  const adults = bloodlineMembers(s).filter((c) => ageOf(s, c) >= 16 && isBloodlineClan(s, c.clanId));
  const [parent, setParent] = useState(s.rulerId);
  const [genes, setGenes] = useState<string[]>([]);
  const sources = cloneSources(s);
  const [src, setSrc] = useState(sources[0]?.id ?? '');
  const vb = vatHeirBlocker(s, parent, genes);
  const cb = src ? cloneBlocker(s, src) : 'Pick someone to clone.';
  const max = maxVatGenes(s);
  const toggle = (id: string) =>
    setGenes((g) => {
      if (g.includes(id)) return g.filter((x) => x !== id);
      const next = g.filter((x) => !conflicts(x, id));
      return next.length >= max ? g : [...next, id];
    });
  const options = researchedGenes(s);
  return (
    <div className="grid">
      <div className="card stack" style={{ gap: 'var(--space-8px)' }}>
        <b>Grow a designer heir</b>
        <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
          A child grown from one parent's genome, with {max === Infinity ? 'any number of' : `up to ${max}`} researched genes designed in (one per ladder), plus
          everything locked in your vault.
        </div>
        <select id="vat-parent" value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Genome donor">
          {adults.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({ageOf(s, c)})
            </option>
          ))}
        </select>
        <div className="traits">
          {options.map((id) => (
            <button
              key={id}
              onClick={() => toggle(id)}
              aria-pressed={genes.includes(id)}
              style={{ background: 'none', border: 0, padding: 0, opacity: genes.includes(id) ? 1 : 0.4 }}
            >
              <span className="trait genetic good-t">{TRAITS[id].name}</span>
            </button>
          ))}
          {!options.length && <span className="dim">Research genes to design them in.</span>}
        </div>
        <div className="spread">
          <CostTag cost={vatHeirCost(s, genes.length)} />
          <Btn
            small
            kind="primary"
            icon="birth"
            reason={vb}
            onClick={() => {
              if (act((d) => growVatHeir(d, parent, genes))) {
                setGenes([]);
                toast('The vat begins to glow.');
              }
            }}
          >
            Grow heir
          </Btn>
        </div>
      </div>
      <div className="card stack" style={{ gap: 'var(--space-8px)' }}>
        <b>Clone a member of the bloodline</b>
        <div className="muted" style={{ fontSize: 'var(--font-size-0_84rem)' }}>
          An exact genetic copy, raised as your own child. The dead work too: the vault keeps every ruler's DNA.
        </div>
        <select id="clone-src" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Clone source">
          {sources.slice(0, 80).map((c) => (
            <option key={c.id} value={c.id}>
              {s.dynasty.rulers.some((r) => r.id === c.id) ? '♛ ' : ''}
              {c.name} {alive(c) ? `(${ageOf(s, c)})` : `(${c.born}–${c.died})`}
            </option>
          ))}
        </select>
        {src && s.characters[src] && (
          <div className="traits">
            {s.characters[src].traits
              .filter((t) => TRAITS[t]?.cat === 'genetic')
              .map((t) => (
                <TraitChip key={t} id={t} s={s} />
              ))}
          </div>
        )}
        <div className="spread">
          <CostTag cost={cloneCost(s)} />
          <Btn small kind="primary" icon="dna" reason={cb} confirm="Tap again to clone" onClick={() => act((d) => cloneCharacter(d, src))}>
            Clone
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function ForgeSection() {
  const { s, act } = useGame();
  const st = stance(s);
  return (
    <Section
      title="Gene-Forge"
      icon="dna"
      info="Research genes nobody in your family carries, splice them into living kin, and with the Vat Complex grow designer heirs or clone your ancestors. Every procedure shocks houses whose faith condemns it, and they will remember."
    >
      {isVip(s) ? (
        <div className="card flat vip-banner" style={{ marginBottom: 'var(--space-10px)', fontSize: 'var(--font-size-0_86rem)' }}>
          <Icon name="relic" size={14} /> <b className="gold">VIP: unlimited Gene-Forge.</b> Fully built, every good gene already sequenced, every procedure
          free and certain to work, and no faith will ever hear about it.
        </div>
      ) : (
        <div className="card flat" style={{ marginBottom: 'var(--space-10px)', fontSize: 'var(--font-size-0_86rem)' }}>
          <Icon name="faith" size={14} /> Your faith, {faithName(s)},{' '}
          <b className={st === 'condemn' ? 'bad' : st === 'embrace' ? 'good' : ''}>{STANCE_TEXT[st]}</b>.
          <span className="muted"> Houses of the Solar Orthodoxy and the Abyssal Choir resent every procedure.</span>
        </div>
      )}
      {forgeLevel(s) === 0 ? (
        <div className="card spread">
          <span className="muted">Build the forge to start sequencing genes.</span>
          <span className="row" style={{ gap: 'var(--space-6px)' }}>
            <CostTag cost={FORGE_COST} />
            <Btn kind="primary" icon="dna" reason={buildBlocker(s)} onClick={() => act((d) => buildForge(d))}>
              Build Gene-Forge
            </Btn>
          </span>
        </div>
      ) : (
        <div className="stack">
          {!isVip(s) && <Research />}
          <Therapy />
          {forgeLevel(s) < 2 ? (
            <div className="card spread">
              <span className="muted">
                The Vat Complex lets you grow designer heirs, clone the dead, and lets mothers bear children into their late fifties.
              </span>
              <span className="row" style={{ gap: 'var(--space-6px)' }}>
                <CostTag cost={VAT_COST} />
                <Btn kind="primary" reason={vatBlocker(s)} onClick={() => act((d) => buildVats(d))}>
                  Build Vat Complex
                </Btn>
              </span>
            </div>
          ) : (
            <Vats />
          )}
        </div>
      )}
    </Section>
  );
}
