// The in-game guide. The original game's biggest complaint was that nobody
// explains what anything does, so this spells it all out.

import { useId, useState } from 'react';
import { ACTIVITIES } from '../../game/activities';
import { SCHEMES } from '../../game/intrigue';
import { FAITHS, PLANETS } from '../../game/planets';
import { STAT_HELP, STAT_NAMES, TRAIT_LIST, traitEffectText, type TraitCat } from '../../game/traits';
import { STAT_KEYS } from '../../game/types';
import { PlanetArt } from '../../svg/PlanetArt';
import { Tabs } from '../Tabs';
import { Modal, TraitChip } from '../components';

type Page = 'basics' | 'starts' | 'resources' | 'family' | 'bloodline' | 'forge' | 'realm' | 'court' | 'war' | 'intrigue' | 'traits' | 'worlds';

const PAGES: [Page, string][] = [
  ['basics', 'Basics'],
  ['starts', 'Starts & VIP mode'],
  ['resources', 'Resources & stats'],
  ['family', 'Family & succession'],
  ['bloodline', 'Bloodline & Gene Vault'],
  ['forge', 'Gene-Forge'],
  ['realm', 'Ranks & realm'],
  ['court', 'Council, cadets & trade'],
  ['war', 'War'],
  ['intrigue', 'Schemes & activities'],
  ['traits', 'All traits'],
  ['worlds', 'Worlds & faiths'],
];

const CATS: [TraitCat, string][] = [
  ['genetic', 'Genetic (heritable, lockable)'],
  ['personality', 'Personality (heritable, lockable)'],
  ['education', 'Education'],
  ['acquired', 'Acquired'],
  ['cyber', 'Cybernetic'],
];

export function CodexModal({ onClose }: { onClose: () => void }) {
  const panelId = useId();
  const [page, setPage] = useState<Page>('basics');
  return (
    <Modal title="Codex" onClose={onClose} wide icon="codex">
      <Tabs label="Guide pages" items={PAGES.map(([id, label]) => ({ id, label }))} value={page} onChange={setPage} panelId={panelId} />
      <div className="codex" id={panelId} role="tabpanel" aria-label={PAGES.find(([id]) => id === page)?.[1]}>
        {page === 'basics' && (
          <>
            <h3>The idea</h3>
            <p>
              You are the head of a minor house on one of the ten worlds of the Sol system. Every press of <b>Age Up</b> is one cycle (a year). Events pop up,
              children are born, rivals scheme, wars rage. When your ruler dies you carry on as their heir. Your goal is whatever you want: rule a planet, unite
              the system on the Solar Throne, or breed the most perfect bloodline the stars have ever seen.
            </p>
            <h3>A ruler's purpose</h3>
            <p>
              Choose one of three coronation vows on Life. They suit your ruler's personality and measure their own deeds after the choice: children, building,
              battle, study, research, charity, income, peace or conquest. Success gives 80–120 prestige and Fulfilled (+1 Diplomacy); death, retirement or
              deposition records an unfinished vow in their memorial. Your heir chooses their own.
            </p>
            <h3>A disputed inheritance</h3>
            <p>
              When a ruler dies, a free adult child or sibling can contest a free adult heir. Ambition, neglect, hostility and being passed over raise the risk;
              closeness and contentment lower it. The strongest potential claimant gets one roll, capped at 35%. Check Succession outlook on Life before the
              handover.
            </p>
            <p>
              You have two cycles to act. A settlement costs 120 + 60 per rank and guarantees withdrawal. A council hearing uses a 50% base, +2.5% per point of
              Diplomacy advantage and +8% or −8% per living councillor's support, capped at 15–85%. It can be tried once. A usable personal hook forces
              withdrawal and is consumed. Conceding costs 20% prestige and continues play as the claimant.
            </p>
            <p>
              Unsettled claims become civil wars. Rebels take 30% of the house fleet and 35% from up to three backing vassals, physically removing those ships
              from their fleets. Battles use ships, Command (+4% per point) and an 80–120% loyalist roll. Winning adds 35 support, losing removes 35: at +70 the
              claimant is imprisoned, at −70 or an empty loyal fleet the crown changes hands. Battles cost real ships and happen once per cycle, automatically
              on Age Up if needed. After six war cycles, support and surviving fleets decide. Surviving rebel ships return to the houses that contributed them.
              AI houses use their own money, councillors and fleets.
            </p>
            <h3>Who raises the next ruler?</h3>
            <p>
              Give a child aged 6-15 a mentor at your court, or send one aged 6-14 to a willing foreign house. Mentors can raise two pupils. Upbringing can pass
              on skills, temperament, faith and lasting friendships; a harsh guardian can leave scars. Wards return at 16, with letters and homecoming choices
              along the way. War may turn a ward into a hostage. Life lists your arrangements and foreign children you are hosting; open a child's profile to
              manage them.
            </p>
            <p>
              While your ward is abroad, their host supplies household lessons. You pay no home tuition or court upkeep for them, your home scientist does not
              teach them, and visits and local childhood events wait until they return. They can still keep in touch through letters. A recall can upset the
              host. Foreign captivity is preserved when an heir inherits.
            </p>
            <h3>Know your family</h3>
            <p>
              The matchmaker checks five generations of recorded parents. Close-family warnings come from real shared ancestors, never matching genes or
              surnames. It shows the prospective children's estimated inbreeding coefficient: 25% for full siblings or parent/child, 12.5% for half-siblings,
              6.25% for first cousins. Unknown ancestry stays unknown. This first warning does not yet change inheritance or health.
            </p>
            <h3>The tabs</h3>
            <ul>
              <li>
                <b>Life</b>: your ruler, your heir and the chronicle of everything that has happened.
              </li>
              <li>
                <b>Family</b>: marriages, children, schooling, succession laws and the wider dynasty.
              </li>
              <li>
                <b>Bloodline</b>: the Gene Vault. Lock traits into your bloodline forever, or purge bad ones.
              </li>
              <li>
                <b>Realm</b>: titles, wars and battles, your fleet, regions, vassals, prisoners, faith.
              </li>
              <li>
                <b>System</b>: the map. Inspect every planet and house, declare war, forge claims.
              </li>
              <li>
                <b>Actions</b>: galas, hunts, pilgrimages and schemes.
              </li>
              <li>
                <b>Treasury</b>: relics, weapons, crowns and flagships, plus the bazaar.
              </li>
            </ul>
            <h3>Saves</h3>
            <p>
              The game saves itself after every action, with a verified backup of the previous save in each slot. Use the menu to keep extra slots or export a
              file.
            </p>
          </>
        )}
        {page === 'resources' && (
          <>
            <h3>Credits</h3>
            <p>
              Money. Earned from your regions (boosted by Economy) and vassals' tribute. Spent on ships, development, activities, implants, bribes, relics and
              the Gene Vault. Fall into debt and 10% of your fleet deserts every cycle.
            </p>
            <h3>Fleet</h3>
            <p>
              Your warships. Battle strength = ships × (1 + 4% per Command point) × bonuses (Mars, traits, flagship, leading personally). Each ship costs 0.8
              credits a cycle to keep. Capacity grows with regions and rank.
            </p>
            <h3>Prestige</h3>
            <p>
              Your fame. Earned from rank, traits, crowns, children and locked genes. Spent on titles, Gene Vault locks, law changes, legitimising bastards,
              fealty demands and naked conquest. Above 100 it starts making every clan like you more.
            </p>
            <h3>Faith</h3>
            <p>
              Your standing with the church. Earned slowly from devotion, Zealous and Pilgrim traits, relics and pilgrimages. Spent on holy wars, divorce,
              prayers in events, converting, and conditioning personality traits in the Gene Vault.
            </p>
            <h3>Health</h3>
            <p>
              Drifts toward a maximum that falls with age (and rises with Robust genes, armour and implants). Below 30 death becomes likely. Illness drains it
              every cycle until cured.
            </p>
            <h3>The five stats</h3>
            <ul>
              {STAT_KEYS.map((k) => (
                <li key={k}>
                  <b>{STAT_NAMES[k]}</b>: {STAT_HELP[k].split(': ')[1]}
                </li>
              ))}
            </ul>
          </>
        )}
        {page === 'family' && (
          <>
            <h3>Marriage</h3>
            <p>
              Use the matchmaker to pick a spouse. They join your house, so the children are your dynasty. Highborn candidates (a clan head's child) cost
              prestige but bring an alliance. Always check their genes.
            </p>
            <h3>Children</h3>
            <p>
              Each cycle a married couple may have a child (better odds with Fecund or Lustful parents, worse after 35). From 6, children study under a tutor in
              a focus of your choice; at 16 they earn an education trait (tier 1 to 4) and their personality settles.
            </p>
            <h3>Relationships</h3>
            <p>
              A character's profile shows how they feel about close family and people they have history with, from -100 to +100. Open each relationship to see
              the reasons: personality, family, faith, looks and remembered feelings. Opinions can differ in each direction.
            </p>
            <p>
              On Life, spend time with up to three different people each cycle, once each: dinner, sparring or stargazing. Their personality changes how much
              they enjoy it (0 to 15 warmth); you gain 5 towards them. Time together fades by one point per cycle and clears neglect. Children aged 15 or under
              feel neglected after five cycles without a visit (-15, deepening by 4 each cycle to -45).
            </p>
            <p>
              Friends, rivals and nemeses settle each cycle, up to three of each: friends need +50 opinion and recent time together; rivals need -40 and a
              hurtful memory; nemeses need -80 and a grave grievance. Taking a lover hurts your spouse, and resentful married couples have fewer children.
            </p>
            <h3>Affairs</h3>
            <p>
              Lovers can give you unsanctioned children. They cannot inherit unless legitimised for 150 prestige. Character profiles link to lovers you know
              about and distinguish private evidence from a publicly exposed affair; other houses have love lives too.
            </p>
            <h3>Noble dossiers</h3>
            <p>
              Open another character's profile to see known facts, rumours with their source, leverage you hold and threats you know about. Proven secrets say
              whether the evidence is private or public. Spending a hook keeps the proof but removes the favour; your heir inherits neither private knowledge
              nor hooks. Gratitude is goodwill, rather than a guaranteed favour. An AI's undisclosed evidence stays hidden until a demand reveals it.
            </p>
            <h3>Justice petitions</h3>
            <p>
              Named nobles bring disputes about debts, inheritances, insults and alleged crimes. Your rulings build a reputation for justice or caprice, and
              leave gratitude or resentment in the people involved. Fines and bribes draw from the offending house's actual treasury, up to what it can afford;
              compensation and blood money reach the house that was wronged. A murder allegation alone creates no secret or hook.
            </p>
            <h3>Captive relatives</h3>
            <p>
              Family lists your relatives held by other houses. Their cards and profiles show who holds them and their ransom price. A captor's envoy can offer
              release: pay, refuse or attempt a rescue. The demanded price is fixed when the envoy arrives. The usual price is 100 credits, plus 80 per house
              rank, plus 100 for its ruler or 50 for the ruler's spouse or child. Captors may execute, ransom, free or keep captives; some escape.
            </p>
            <h3>Marriage ties between houses</h3>
            <p>
              House profiles show their ties by marriage. A ruler's, child's or sibling's marriage into another ruler's blood binds the houses. Kin send a
              quarter of their fleet in defence and 15% in attack; anyone related to both sides stays home. Ties lapse as people die. Treacherous, hostile
              rulers can betray even their in-laws.
            </p>
            <h3>Earned epithets</h3>
            <p>
              Every house head can earn 57 names from their deeds: the Just, the Cruel, the Conqueror, the Builder and more. Your profile lists every earned
              epithet, the year and the actions behind it, plus the full catalogue and its requirements. More defining names appear beside a ruler's name.
              Equally notable newer names take precedence, while every older epithet remains in their history, even after death.
            </p>
            <p>
              Deeds belong to a person: heirs and clones start their own reputations. AI heads use the same rules, based on their actual wars, schemes, families
              and governance. Old saves start recording new deeds from this update; inherited wealth and titles do not count as achievements.
            </p>
            <h3>Succession</h3>
            <p>
              When your ruler dies, the next in line inherits everything. Laws decide the order: Primogeniture (eldest), Ultimogeniture (youngest), Meritocracy
              (best total stats) or Designated (you choose). A gender law can favour sons or daughters. If no legitimate dynasty member is alive, the game ends.
            </p>
            <h3>Pass the torch</h3>
            <p>
              On Life, Abdicate lets an adult ruler hand over to their free, adult heir, including in VIP mode. The old ruler stays alive and takes a vacant
              council seat if one is available. They retire from the succession line. The normal handover costs 10% prestige and lowers each vassal's opinion by
              10.
            </p>
            <h3>A reign remembered</h3>
            <p>
              Succession and the end of a dynasty show the old ruler's life, family, earned epithets and recorded deeds. The same legacy is available in ruler
              profiles, including rivals. These are personal achievements, never the dynasty's totals; older saves can only show deeds recorded since the
              epithet update.
            </p>
            <h3>Sprawling dynasties</h3>
            <p>
              At the start of a run you pick <b>Sprawling</b> (no limit on dynasty size) or <b>Tight family</b> (distant kin have fewer children once the
              dynasty passes 30 people). With auto-matchmaking on, adult kin you haven't married off find their own spouses across the system. Depending on your
              gender law, some bring the spouse home and some marry into other houses, scattering your blood across every world.
            </p>
          </>
        )}
        {page === 'bloodline' && (
          <>
            <h3>Genes</h3>
            <p>
              Genetic traits sit on ladders (Dim, Slow, Quick, Brilliant, Genius). A child gets a parent's gene 40% of the time, 75% if both parents share it,
              and has a 12% chance to climb a rung when both parents share the same tier. Every birth has a 5% chance of a random mutation, which is where rare
              genes like Psionic Ascendant and Ageless come from.
            </p>
            <h3>The Gene Vault</h3>
            <ul>
              <li>
                <b>Lock</b> a trait and every child born into your dynasty gets it, guaranteed, forever. You need a living dynasty member who carries it.
              </li>
              <li>
                <b>Purge</b> a trait and no dynasty child will ever inherit it. You can purge something nobody has yet, as insurance.
              </li>
              <li>Locking a gene replaces any other lock on the same ladder (lock Genius and your Quick lock is swapped out).</li>
              <li>Personality locks (Brave, Just, Ambitious…) work by conditioning: they also reshape your kids under 16 straight away.</li>
              <li>Each lock or purge takes a vault slot. Buy more slots in the Bloodline tab (up to 12).</li>
              <li>Spouses from other houses are not affected, so marry for good genes.</li>
              <li>Children of kin who marry into other houses belong to those houses, so your locks do not reach them.</li>
            </ul>
            <h3>Bloodline grade</h3>
            <p>
              The average genetic tier across your living dynasty, plus a bonus for each good gene locked. Every good genetic lock also gives +2 prestige a
              cycle.
            </p>
          </>
        )}
        {page === 'starts' && (
          <>
            <h3>Starting rank</h3>
            <p>When you found a dynasty you choose how high up the ladder you begin:</p>
            <ul>
              <li>
                <b>Governor</b>: a minor house with a region or two, sworn to the planet's monarch. The classic climb from the bottom.
              </li>
              <li>
                <b>Viceroy</b>: a great house with three regions, the viceroy's title and two lesser houses already sworn to you.
              </li>
              <li>
                <b>Monarch</b>: the planet's royal house. You hold the capital and every house on the world is your vassal.
              </li>
              <li>
                <b>Solar Emperor</b>: you rule your homeworld and its two nearest neighbours from the Solar Throne. The royal houses you deposed hold a grudge.
              </li>
            </ul>
            <p>
              You also set your ruler's age (16 to 70), their looks, and whether they start single, married, or married with children. Older rulers start better
              schooled but have fewer years left.
            </p>
            <h3>VIP mode</h3>
            <p>A sandbox for building a super dynasty. Pick it when you start, or switch it on or off any time from the menu.</p>
            <ul>
              <li>
                <b>VIP builder</b>: when founding a dynasty, pick any genes, personality, honours and implants, set talents up to 30, choose top-tier schooling,
                or hit <b>Make god-tier</b> for all of it at once.
              </li>
              <li>
                <b>VIP editor</b>: every character's profile gets an editor. Add or remove any trait, change stats, age and name, heal them, or make them
                god-tier. Works on anyone, rivals included.
              </li>
              <li>
                <b>Unlimited Gene-Forge</b>: fully built from the start, every good gene already sequenced, splices always work, vat heirs take any number of
                genes, and nothing costs a credit or upsets a faith.
              </li>
              <li>
                <b>Unlimited Gene Vault</b>: no slot limit, everything free, and no living carrier needed to lock a gene.
              </li>
              <li>
                <b>VIP console</b> (the gold VIP button up top): add credits, prestige and faith, fill your fleet, rejuvenate or immortalise your ruler, lock
                every top gene, or cleanse and god-tier the whole bloodline.
              </li>
            </ul>
            <p>None of it ever helps an AI house. Saves made in VIP mode are marked VIP.</p>
          </>
        )}
        {page === 'forge' && (
          <>
            <h3>Rival bloodlines</h3>
            <p>
              Other landed houses choose a bloodline action once every eight cycles. They prefer talented, healthy marriage candidates within their political
              matches; they pay the same vault, laboratory, splice and vat prices as you. Each house starts with two vault slots and no laboratory. Research
              costs 40 credits every cycle and stops if their treasury cannot pay.
            </p>
            <p>
              Splices have the standard age-based failure risk. Older heirless rulers may build vats, grow a child or clone an exceptional original of their own
              house. Zealous rulers whose faith condemns the Forge avoid it unless succession is threatened. Condemning heads hold personal resentment towards
              the ruler responsible. Open a house to see its bloodline programme; private laboratory notices stay in that court.
            </p>
            <p>
              Research uses that head's Science, without your councillors, relics or VIP benefits. Viceroy titles cost rivals 500 credits and 300 prestige at
              three regions; they already receive Viceroy rank at that size. Rival rulers cannot claim the Solar Throne yet.
            </p>
            <h3>The Gene-Forge</h3>
            <p>Build it from the Bloodline tab (600 credits, 150 prestige). It lets you go beyond what breeding gives you.</p>
            <ul>
              <li>
                <b>Research</b>: sequence any good gene, even one nobody in your family has ever carried. Each project takes a few cycles (faster with high
                Science and a Chief Scientist) and costs 40 credits a cycle. Once synthesised, a gene can be locked in the Gene Vault without a living carrier.
              </li>
              <li>
                <b>Gene therapy</b>: splice a researched gene into a living relative. Babies take it best (80%), adults worst (45%). A rejected splice can leave
                them Sickly or with Gene-Rot.
              </li>
              <li>
                <b>Vat Complex</b> (1,200 credits, 300 prestige): grow a designer heir from one parent's genome with up to three researched genes built in, or
                clone any member of your bloodline, living or long dead. Clones are raised as your own children. It also lets mothers have children into their
                late fifties.
              </li>
            </ul>
            <h3>Faith and heresy</h3>
            <p>
              The Machine Synod embraces gene-forging: procedures are 25% cheaper and earn faith. The Solar Orthodoxy and the Abyssal Choir condemn it: every
              procedure costs you faith, and every house of those faiths remembers it.
            </p>
          </>
        )}
        {page === 'court' && (
          <>
            <h3>The council</h3>
            <p>
              Five seats in the Realm tab, filled from your bloodline (cadets included) and their spouses. Councillors slowly improve their stat while they
              serve.
            </p>
            <ul>
              <li>
                <b>Envoy</b> (Diplomacy): every house likes you more; better alliance and peace odds.
              </li>
              <li>
                <b>Admiral</b> (Command): extra fleet strength, and commands any battle you don't lead in person.
              </li>
              <li>
                <b>Treasurer</b> (Economy): extra region income and more trade route slots.
              </li>
              <li>
                <b>Spymaster</b> (Intrigue): better scheme odds, fewer exposures, and protection against rival plots.
              </li>
              <li>
                <b>Chief Scientist</b> (Science): faster schooling, faster gene research, safer implants and splices.
              </li>
            </ul>
            <h3>Cadet branches</h3>
            <p>
              Open an adult relative's card (not your heir) and grant them one of your regions. They found a new house of your bloodline: sworn to you, paying
              tribute, sending 35% of their fleet to your wars, and sharing your Gene Vault's locks. Treat them badly and they can still revolt. If your main
              line ever dies out, the strongest cadet branch rejoins the main house and takes the crown.
            </p>
            <h3>Grudges and rivals</h3>
            <p>
              Every house keeps a record of what you did to it: murders, executions, stolen regions, insults, broken alliances, but also gifts, marriages and
              freed prisoners. Memories fade every cycle, favours fastest and killings slowest, and they pass to the next head of the house. When a house's
              grudges reach -40 it becomes a <b>Sworn Rival</b>: rivals plot assassinations, sabotage your docks, rob your treasury and declare war on you from
              anywhere in the system. Check the System tab to see who hates you.
            </p>
            <h3>Trade routes</h3>
            <p>
              Run convoys from one of your regions to a partner house on another world (Realm tab). Value grows with distance and with both ports' development;
              allies pay 15% more and Belters 20% more. Every world has its export, from Mercurian alloys to Plutonian cryo-crystals. You get 1 route plus 1 per
              rank, plus more with a good Treasurer. Partners must like you (opinion 0+), war closes the route, and pirates raid convoys unless your fleet is
              big enough to scare them off.
            </p>
          </>
        )}
        {page === 'realm' && (
          <>
            <h3>Ranks</h3>
            <ul>
              <li>
                <b>Governor</b>: you hold one or two regions. You answer to the ruler of your home planet and pay them 15% of your income.
              </li>
              <li>
                <b>Viceroy</b>: hold 3 regions, then create the title (500 credits, 300 prestige). Lets you demand fealty from weaker houses.
              </li>
              <li>
                <b>Sovereign</b>: take a planet's throne-region (marked with a crown) and you rule that planet. Every other house there becomes your vassal.
              </li>
              <li>
                <b>Solar Emperor</b>: rule the thrones of 3 planets and forge the Solar Throne (3000 credits, 1500 prestige).
              </li>
            </ul>
            <h3>Vassals</h3>
            <p>
              Vassals pay tribute and send ships to your wars if they like you. If their opinion drops below -40 they may revolt. You can arrest a vassal's
              leader (if it fails, they revolt), then execute, ransom or release them.
            </p>
            <h3>Independence</h3>
            <p>Tired of your liege? Declare independence from the Realm tab. Win the war and you answer to no one.</p>
            <h3>Regions</h3>
            <p>Each pays 20 + 12 × development credits a cycle. Develop them (up to 10) to grow your economy.</p>
          </>
        )}
        {page === 'war' && (
          <>
            <h3>Declaring war</h3>
            <p>
              Pick a region on the System map. You need a justification: a <b>claim</b> (forge one with a scheme), a <b>blood feud</b> (from insults or caught
              assassins), a <b>holy war</b> against another faith (150 faith), or <b>naked conquest</b> (120 prestige, everyone likes you less).
            </p>
            <h3>Battles</h3>
            <p>
              Launch one battle per war per cycle; the enemy also attacks once a cycle. Each win pushes the war score toward +100 and kills more of their ships.
              At +100 you win the region (or independence). At -100 you lose. Allies send 30% of their fleets; loyal vassals 20%. If a vassal is attacked by an
              outsider, their liege helps them.
            </p>
            <h3>War weariness</h3>
            <p>
              Each house gains 3 weariness per active campaign each cycle, capped at 9 for three or more wars. Actual battles add 3 plus 20 times the fraction
              of participating ships lost, rounded up. It caps at 100, reducing fleet strength by up to 25% and regional income by up to 15%. Civil wars and
              their real backers count too.
            </p>
            <p>
              Weariness survives a new ruler. Beginning a cycle at peace recovers 8; active campaigns prevent recovery. Realm shows your number and penalties,
              rival profiles show theirs, and income breakdowns show War-weary lands. AI uses its own fatigue and the same multipliers. Old saves start at zero,
              with no reconstructed campaign costs.
            </p>
            <h3>Peace oaths</h3>
            <p>
              Every victory, defeat or white peace swears a five-cycle truce between the two houses, including independence and revolts. It survives inheritance
              and changing region owners. The end year is the first year you may declare again. Claims and blood feuds do not bypass it; old saves begin with no
              invented historical treaties.
            </p>
            <p>
              Realm lists your peace oaths; house profiles show theirs. In System, an ordinary War button is locked during a truce. Break truce and attack
              requires a second tap and 200 prestige plus the usual war cost. The actual ruler earns one broken-oath deed, other houses lose 10 opinion of a
              player breaker, and the victim remembers the betrayal. Independence uses the same gate.
            </p>
            <p>
              AI houses pay the same 200 prestige from their own treasury of honour. Only free adult rulers can break one. Wrathful or deceitful lords with a
              real personal hatred may occasionally do so; honourable rulers wait. An AI offence changes feelings towards that AI ruler, never house memories
              falsely blaming you.
            </p>
            <h3>Leading in person</h3>
            <p>+15% strength and extra prestige, with a chance of glory (War Hero), wounds, scars or death.</p>
            <h3>Peace</h3>
            <p>
              Offer peace once a cycle. With a big lead the enemy may hand over the prize; around zero they may accept a white peace. Wars end on their own
              after 7 cycles.
            </p>
          </>
        )}
        {page === 'intrigue' && (
          <>
            <h3>Secrets and hooks</h3>
            <p>
              Open a character profile to investigate. One investigation per ruler per cycle costs 40 credits even when nothing is found. The chance is 35%,
              plus 3.5 percentage points per Intrigue advantage and 1 point per spymaster Intrigue, capped at 10-85%. Your spymaster can also uncover one piece
              of proof each cycle (4% plus 0.6 points per Intrigue, capped at 20%).
            </p>
            <p>
              Only actual affairs and murders create evidence. A private discovery gives that person one hook. Spend it to demand payment (20 credits and a
              scheme action; the hook is spent even on refusal), or arrange a marriage with a ruler's grown child. No captive, existing marriage, betrothal,
              close kin, house head or heir can be taken. The new spouse joins your court and resents the coercion; it buys no friendship or automatic alliance.
            </p>
            <p>
              Expose proof to damage the culprit's prestige (15 for an affair, 30 for murder) and inform the betrayed family. Exposure destroys all leverage on
              that secret. Hooks are personal, expire with death and do not pass to your heir. AI rulers investigate with their own money and knowledge and can
              use the same favours against your house.
            </p>
            <h3>Schemes</h3>
            <p>
              Up to 3 per cycle. Your Intrigue against the target's decides the odds; Deceitful, psionics, Venusian birth and relics help, while Paranoid and
              Plutonian targets resist. Getting caught makes enemies.
            </p>
            <ul>
              {Object.values(SCHEMES).map((x) => (
                <li key={x.name}>
                  <b>{x.name}</b>: {x.desc}
                </li>
              ))}
            </ul>
            <h3>Activities</h3>
            <ul>
              {Object.values(ACTIVITIES).map((a) => (
                <li key={a.name}>
                  <b>{a.name}</b>: {a.desc}
                </li>
              ))}
            </ul>
          </>
        )}
        {page === 'traits' &&
          CATS.map(([cat, label]) => (
            <div key={cat}>
              <h3>{label}</h3>
              <table className="plain">
                <tbody>
                  {TRAIT_LIST.filter((t) => t.cat === cat).map((t) => (
                    <tr key={t.id}>
                      <td style={{ width: 160 }}>
                        <TraitChip id={t.id} />
                      </td>
                      <td>
                        {t.desc} <span className="good">{traitEffectText(t)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {page === 'worlds' && (
          <>
            {PLANETS.map((p) => (
              <div key={p.id} className="row top" style={{ marginBottom: 'var(--space-10px)' }}>
                <PlanetArt planetId={p.id} size={56} />
                <div>
                  <b>
                    {p.name}: {p.faction}
                  </b>
                  <p style={{ margin: 0 }}>{p.blurb}</p>
                  <p className="good" style={{ margin: 0 }}>
                    {p.bonus}
                  </p>
                </div>
              </div>
            ))}
            <h3>Faiths</h3>
            {Object.values(FAITHS).map((f) => (
              <p key={f.id}>
                <b style={{ color: f.color }}>{f.name}</b>: {f.blurb} <span className="muted">Virtues: {f.virtues.join(', ')}.</span>
              </p>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
