import type { ReactNode } from 'react';
import { homePlanet } from '../../game/core';
import { itemEffectText, RARITY_COLOR, SLOT_NAMES } from '../../game/items';
import { buyItem, equip, isEquipped, priceOf, sellItem, unequip, type EquipSlot } from '../../game/realm';
import type { Item } from '../../game/types';
import { ItemIcon } from '../../svg/ItemIcon';
import { Btn, Section } from '../components';
import { useGame } from '../store';

const SLOTS: { id: EquipSlot; label: string }[] = [
  { id: 'head', label: 'Crown' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'suit', label: 'Armour' },
  { id: 'flagship', label: 'Flagship' },
  { id: 'relic', label: 'Relic I' },
  { id: 'relic2', label: 'Relic II' },
];

function ItemTile({ item, children }: { item: Item; children?: ReactNode }) {
  return (
    <div className="item-tile">
      <ItemIcon item={item} size={56} />
      <div className="grow">
        <div className="nm" style={{ color: RARITY_COLOR[item.rarity] }}>{item.name}</div>
        <div className="muted" style={{ fontSize: '0.75rem' }}>
          {item.rarity} {SLOT_NAMES[item.slot].toLowerCase()}
          {item.origin ? ` · ${item.origin}` : ''}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#a8e6c1' }}>{itemEffectText(item.fx)}</div>
        {children && <div className="btn-row" style={{ marginTop: 6 }}>{children}</div>}
      </div>
    </div>
  );
}

export function TreasuryTab() {
  const { s, act } = useGame();
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const unequipped = s.items.filter((i) => !isEquipped(s, i.id));
  return (
    <div>
      <Section title="Equipped" icon="crown" info="Only your ruler benefits from equipped items. The whole treasury passes to each new heir, so relics build up over generations.">
        <div className="grid">
          {SLOTS.map((slot) => {
            const id = s.equipped[slot.id];
            const item = id ? byId.get(id) : undefined;
            return item ? (
              <ItemTile key={slot.id} item={item}>
                <Btn small kind="ghost" onClick={() => act((d) => unequip(d, item.id))}>
                  Unequip
                </Btn>
              </ItemTile>
            ) : (
              <div key={slot.id} className="item-tile">
                <div className="slot-empty">{slot.label}</div>
                <span className="dim">Empty</span>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title={`Treasury (${unequipped.length})`} icon="treasury">
        {!unequipped.length && <div className="empty">Nothing stored. Buy relics at the bazaar, or find them in events and hunts.</div>}
        <div className="grid">
          {unequipped.map((item) => (
            <ItemTile key={item.id} item={item}>
              {item.slot === 'relic' ? (
                <>
                  <Btn small kind="good" onClick={() => act((d) => equip(d, item.id, 'relic'))}>Equip I</Btn>
                  <Btn small kind="good" onClick={() => act((d) => equip(d, item.id, 'relic2'))}>Equip II</Btn>
                </>
              ) : (
                <Btn small kind="good" onClick={() => act((d) => equip(d, item.id))}>
                  Equip
                </Btn>
              )}
              <Btn small kind="ghost" confirm="Tap again to sell" onClick={() => act((d) => sellItem(d, item.id))}>
                Sell ({Math.round(item.price * 0.45)})
              </Btn>
            </ItemTile>
          ))}
        </div>
      </Section>
      <Section title="Occator Bazaar" icon="credits" info={`New stock arrives every cycle from the Belt.${homePlanet(s) === 'ceres' ? ' As a Belter you get 20% off.' : ''}`}>
        <div className="grid">
          {s.shop.items.map((item) => (
            <ItemTile key={item.id} item={item}>
              <Btn small kind="primary" reason={s.credits < priceOf(s, item) ? `Need ${priceOf(s, item)} credits` : null} onClick={() => act((d) => buyItem(d, item.id))}>
                Buy ({priceOf(s, item)})
              </Btn>
            </ItemTile>
          ))}
          {!s.shop.items.length && <div className="empty">Sold out until next cycle.</div>}
        </div>
      </Section>
    </div>
  );
}
