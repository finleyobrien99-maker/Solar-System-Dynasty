// The VIP console: top up resources, buff the ruler and the whole bloodline,
// and switch the cheats off again.

import { bloodlineMembers, fmt, ruler } from '../../game/core';
import { fleetCap } from '../../game/economy';
import { cleanseBloodline, disableVip, fillFleet, give, godTierBloodline, healBloodline, lockGodGenes, makeGodTier, rejuvenate, setImmortal, type Resource } from '../../game/vip';
import { Icon } from '../../svg/Icons';
import { Btn, Modal } from '../components';
import { useGame } from '../store';

const TOP_UPS: [Resource, string, number[]][] = [
  ['credits', 'Credits', [1000, 10000, 100000]],
  ['prestige', 'Prestige', [500, 5000, 50000]],
  ['faith', 'Faith', [500, 5000, 50000]],
];

export function VipModal() {
  const { s, act, setUi, openChar, toast } = useGame();
  const r = ruler(s);
  const immortal = !!s.vip?.immortal;
  const kin = bloodlineMembers(s).length;
  return (
    <Modal title="VIP console" onClose={() => setUi({ panel: null })} icon="relic" wide>
      <div className="card flat vip-banner" style={{ marginBottom: 12 }}>
        <b className="gold">VIP mode is on.</b> Edit anyone's traits, stats and age from their profile. The Gene-Forge is fully built, every good gene is sequenced, and every
        procedure is free, always works, and upsets no one. The Gene Vault has no slot limit and needs no carriers. None of it ever helps an AI house.
      </div>

      <h3>Resources</h3>
      <div className="vip-grid">
        {TOP_UPS.map(([res, label, amounts]) => (
          <div key={res} className="card flat stack" style={{ gap: 6, padding: 10 }}>
            <span className="row" style={{ gap: 6 }}>
              <Icon name={res} size={15} /> <b>{label}</b> <span className="muted">{fmt(s[res])}</span>
            </span>
            <div className="row wrap" style={{ gap: 6 }}>
              {amounts.map((n) => (
                <Btn key={n} small onClick={() => act((d) => give(d, res, n))}>
                  +{fmt(n)}
                </Btn>
              ))}
            </div>
          </div>
        ))}
        <div className="card flat stack" style={{ gap: 6, padding: 10 }}>
          <span className="row" style={{ gap: 6 }}>
            <Icon name="fleet" size={15} /> <b>Fleet</b>{' '}
            <span className="muted">
              {fmt(s.fleet)} / {fmt(fleetCap(s))}
            </span>
          </span>
          <Btn small reason={s.fleet >= fleetCap(s) ? 'Already at capacity' : null} onClick={() => act((d) => fillFleet(d))}>
            Fill to capacity
          </Btn>
        </div>
      </div>

      <h3 style={{ marginTop: 14 }}>{r.name}</h3>
      <div className="btn-row">
        <Btn
          kind="primary"
          icon="prestige"
          onClick={() => {
            act((d) => makeGodTier(d, d.rulerId));
            toast(`${r.name} is now god-tier.`);
          }}
        >
          Make god-tier
        </Btn>
        <Btn icon="age" onClick={() => act((d) => rejuvenate(d))}>
          Rejuvenate (10 years younger)
        </Btn>
        <Btn kind={immortal ? 'good' : undefined} icon="health" onClick={() => act((d) => setImmortal(d, !immortal))}>
          Immortal: {immortal ? 'ON' : 'off'}
        </Btn>
        <Btn
          kind="ghost"
          icon="eye"
          onClick={() => {
            setUi({ panel: null });
            openChar(r.id);
          }}
        >
          Open the trait editor
        </Btn>
      </div>
      <div className="dim" style={{ fontSize: '0.76rem', marginTop: 4 }}>
        Immortal rulers never die, so the crown never passes on. Switch it off when you want an heir to take over.
      </div>

      <h3 style={{ marginTop: 14 }}>The bloodline ({fmt(kin)} living)</h3>
      <div className="btn-row">
        <Btn kind="good" icon="lock" onClick={() => {
            act((d) => lockGodGenes(d));
            toast('Every top-rung gene is locked in. Every child is born with them.');
          }}>
          Lock every top gene
        </Btn>
        <Btn icon="purge" onClick={() => toast(`Cleansed ${act((d) => cleanseBloodline(d))} relatives of bad genes.`)}>
          Cleanse bad genes
        </Btn>
        <Btn icon="health" onClick={() => toast(`Healed ${act((d) => healBloodline(d))} relatives.`)}>
          Heal everyone
        </Btn>
        <Btn kind="primary" icon="dna" confirm="Tap again: everyone" onClick={() => toast(`${act((d) => godTierBloodline(d))} relatives are now god-tier.`)}>
          God-tier the whole bloodline
        </Btn>
      </div>

      <hr className="divider" />
      <div className="spread">
        <span className="muted" style={{ fontSize: '0.82rem' }}>Switch it off to play by the normal rules again. You can turn it back on from the menu any time.</span>
        <Btn
          kind="danger"
          confirm="Tap again to switch off"
          onClick={() => {
            act((d) => disableVip(d));
            setUi({ panel: null });
            toast('VIP mode is off.');
          }}
        >
          Turn VIP off
        </Btn>
      </div>
    </Modal>
  );
}
