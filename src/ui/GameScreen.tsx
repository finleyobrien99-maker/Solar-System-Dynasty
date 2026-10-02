import { ageOf, clanTitle, fmt, ruler } from '../game/core';
import { creditLines, faithLines, fleetCap, prestigeLines, sum, type Line } from '../game/economy';
import { ageUp, canAgeUp } from '../game/tick';
import { Icon } from '../svg/Icons';
import { Tip, Face } from './components';
import { CharacterModal } from './modals/CharacterModal';
import { ClanModal } from './modals/ClanModal';
import { CodexModal } from './modals/CodexModal';
import { GameOverModal } from './modals/GameOverModal';
import { MenuModal } from './modals/MenuModal';
import { PendingModal } from './modals/PendingModal';
import { SavesModal } from './modals/SavesModal';
import { SuitorModal } from './modals/SuitorModal';
import { TreeModal } from './modals/TreeModal';
import { useGame, type Tab } from './store';
import { ActionsTab } from './tabs/ActionsTab';
import { BloodlineTab } from './tabs/BloodlineTab';
import { FamilyTab } from './tabs/FamilyTab';
import { LifeTab } from './tabs/LifeTab';
import { RealmTab } from './tabs/RealmTab';
import { SystemTab } from './tabs/SystemTab';
import { TreasuryTab } from './tabs/TreasuryTab';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'life', label: 'Life', icon: 'age' },
  { id: 'family', label: 'Family', icon: 'family' },
  { id: 'bloodline', label: 'Bloodline', icon: 'dna' },
  { id: 'realm', label: 'Realm', icon: 'realm' },
  { id: 'system', label: 'System', icon: 'map' },
  { id: 'actions', label: 'Actions', icon: 'scheme' },
  { id: 'treasury', label: 'Treasury', icon: 'treasury' },
];

function Lines({ lines, unit }: { lines: Line[]; unit: string }) {
  return (
    <div style={{ marginTop: 6 }}>
      {lines.map((l) => (
        <div key={l.label} className="line">
          <span>{l.label}</span>
          <span className={l.value < 0 ? 'bad' : 'good'}>
            {l.value >= 0 ? '+' : ''}
            {l.value}
          </span>
        </div>
      ))}
      <div className="line" style={{ borderTop: '1px solid #ffffff22', marginTop: 4, paddingTop: 4 }}>
        <b>Per cycle</b>
        <b>
          {sum(lines) >= 0 ? '+' : ''}
          {sum(lines)} {unit}
        </b>
      </div>
    </div>
  );
}

function TopBar() {
  const { s, openChar, setUi } = useGame();
  const r = ruler(s);
  const dc = sum(creditLines(s));
  const dp = sum(prestigeLines(s));
  const df = sum(faithLines(s));
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="who" onClick={() => openChar(r.id)}>
          <Face c={r} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="name">
              {r.name} {s.clans[s.playerClanId].name}
            </div>
            <div className="title">
              {clanTitle(s, s.playerClanId, r.gender)} · {ageOf(s, r)} yrs · Year {s.year}
            </div>
          </div>
        </div>
        <div className="resources">
          <Tip text={<><b>Credits</b><div>Money. Pays for ships, building up regions, activities, implants, bribes and the Gene Vault. If you go into debt your crews start deserting.</div><Lines lines={creditLines(s)} unit="credits" /></>}>
            <span className={`res credits ${s.credits < 0 ? 'neg' : ''}`}>
              <Icon name="credits" size={15} />
              {fmt(s.credits)}
              <span className="delta">{dc >= 0 ? '+' : ''}{dc}</span>
            </span>
          </Tip>
          <Tip text={<><b>Fleet</b><div>Warships. Your strength in every battle, multiplied by your Command. Allies and loyal vassals add some of their ships. Each ship costs 0.8 credits a cycle.</div><div style={{ marginTop: 4 }}>Capacity: {s.fleet} / {fleetCap(s)} (grows with regions and rank)</div></>}>
            <span className="res fleet">
              <Icon name="fleet" size={15} />
              {fmt(s.fleet)}
            </span>
          </Tip>
          <Tip text={<><b>Prestige</b><div>Fame and legitimacy. Spent on creating titles, locking genes, changing laws, demanding vassalage and wars of conquest. High prestige makes every clan like you more.</div><Lines lines={prestigeLines(s)} unit="prestige" /></>}>
            <span className={`res prestige ${s.prestige < 0 ? 'neg' : ''}`}>
              <Icon name="prestige" size={15} />
              {fmt(s.prestige)}
              <span className="delta">{dp >= 0 ? '+' : ''}{dp}</span>
            </span>
          </Tip>
          <Tip text={<><b>Faith</b><div>Your standing with the church. Spent on holy wars, divorces, prayers in events, converting, and conditioning personality traits in the Gene Vault.</div><Lines lines={faithLines(s)} unit="faith" /></>}>
            <span className="res faith">
              <Icon name="faith" size={15} />
              {fmt(s.faith)}
              <span className="delta">{df >= 0 ? '+' : ''}{df}</span>
            </span>
          </Tip>
        </div>
        <button className="btn ghost small menu-btn" onClick={() => setUi({ panel: 'menu' })} aria-label="Menu">
          <Icon name="menu" size={18} />
        </button>
      </div>
    </header>
  );
}

export function GameScreen() {
  const { s, act, ui, setUi } = useGame();
  const ready = canAgeUp(s);
  const doAgeUp = () => {
    act((d) => ageUp(d));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const warBadge = s.wars.length;
  return (
    <div className="app">
      <TopBar />
      <main className="main">
        {ui.tab === 'life' && <LifeTab />}
        {ui.tab === 'family' && <FamilyTab />}
        {ui.tab === 'bloodline' && <BloodlineTab />}
        {ui.tab === 'realm' && <RealmTab />}
        {ui.tab === 'system' && <SystemTab />}
        {ui.tab === 'actions' && <ActionsTab />}
        {ui.tab === 'treasury' && <TreasuryTab />}
      </main>
      {!s.gameOver && (
        <button className="ageup" onClick={doAgeUp} disabled={!ready} aria-label="Age up one cycle">
          <Icon name="next" size={20} />
          <span>
            AGE UP
            <small>to {s.year + 1}</small>
          </span>
        </button>
      )}
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {TABS.map((t) => (
            <button key={t.id} className={ui.tab === t.id ? 'active' : ''} onClick={() => setUi({ tab: t.id })} aria-current={ui.tab === t.id}>
              <Icon name={t.icon} size={20} />
              {t.label}
              {t.id === 'realm' && warBadge > 0 && <span className="badge">{warBadge}</span>}
            </button>
          ))}
        </div>
      </nav>
      {ui.charId && <CharacterModal id={ui.charId} />}
      {ui.clanId && <ClanModal id={ui.clanId} />}
      {ui.panel === 'saves' && <SavesModal />}
      {ui.panel === 'codex' && <CodexModal onClose={() => setUi({ panel: null })} />}
      {ui.panel === 'tree' && <TreeModal />}
      {ui.panel === 'suitors' && <SuitorModal />}
      {ui.panel === 'menu' && <MenuModal />}
      {s.pending.length > 0 && <PendingModal />}
      {s.gameOver && s.pending.length === 0 && !ui.panel && !ui.charId && !ui.clanId && <GameOverModal />}
    </div>
  );
}
