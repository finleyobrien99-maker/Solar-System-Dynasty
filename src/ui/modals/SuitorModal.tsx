import { kinship } from '../../game/ancestry';
import { ageOf, ch, clanRank } from '../../game/core';
import { acceptSuitor, refreshSuitors, suitorRefreshCost } from '../../game/family';
import { PLANET_BY_ID } from '../../game/planets';
import { TRAITS } from '../../game/traits';
import { Portrait } from '../../svg/Portrait';
import { Sigil } from '../../svg/Sigil';
import { Btn, InfoDot, Modal, StatBlock, TraitList } from '../components';
import { useGame } from '../store';

export function SuitorModal() {
  const { s, act, setUi, toast } = useGame();
  const sl = s.suitors;
  const close = () => setUi({ panel: null });
  if (!sl) {
    return (
      <Modal title="Matchmaker" onClose={close}>
        <div className="empty">No candidates right now.</div>
      </Modal>
    );
  }
  const target = ch(s, sl.forId);
  const cost = suitorRefreshCost(s, sl.forId);
  return (
    <Modal title={`${sl.mode === 'marry' ? 'Marriage' : 'Betrothal'} for ${target?.name ?? ''}`} onClose={close} wide icon="heart">
      <div className="spread" style={{ marginBottom: 'var(--space-10px)' }}>
        <span className="muted" style={{ fontSize: 'var(--font-size-0_86rem)' }}>
          The spouse joins your house, so all children are your dynasty. Check their genes: that is what your grandchildren get.
          <InfoDot text="Highborn candidates are a clan head's own child: they cost prestige but bring an alliance (allies fight with you). Others are cheaper kin with no alliance. Betrothed children marry automatically at 16." />
        </span>
        <Btn small reason={s.credits < cost ? `Need ${cost} credits` : null} onClick={() => act((d) => refreshSuitors(d, sl.forId))}>
          New candidates {cost ? `(${cost})` : '(free)'}
        </Btn>
      </div>
      <div className="grid">
        {sl.list.map((sug, i) => {
          const c = sug.char;
          const clan = s.clans[c.clanId];
          const kin = target ? kinship(s, target, c) : undefined;
          const genes = c.traits.filter((t) => TRAITS[t]?.cat === 'genetic');
          const goodGenes = genes.filter((t) => TRAITS[t].good).length;
          const badGenes = genes.filter((t) => TRAITS[t].good === false).length;
          return (
            <div key={c.id} className={`card ${sug.highborn ? 'hl' : ''}`}>
              <div className="row top">
                <Portrait c={c} year={s.year} clanColor={clan?.color} trim={clan?.sigil.c2} size={84} />
                <div className="grow">
                  <b>
                    {c.name} {clan?.name}
                  </b>
                  <div className="muted" style={{ fontSize: 'var(--font-size-0_8rem)' }}>
                    {ageOf(s, c)} yrs · {PLANET_BY_ID[c.planetId].adjective}
                  </div>
                  <div className="row wrap" style={{ marginTop: 'var(--space-4px)', gap: 'var(--space-4px)' }}>
                    {clan && <Sigil spec={clan.sigil} size={20} />}
                    {sug.highborn ? <span className="pill gold">Highborn · alliance</span> : <span className="pill">Lesser kin</span>}
                    {clan && <span className="pill">rank {clanRank(s, clan.id)}</span>}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-0_78rem)', marginTop: 'var(--space-4px)' }}>
                    <span className="good">
                      {goodGenes} good gene{goodGenes === 1 ? '' : 's'}
                    </span>
                    {badGenes > 0 && <span className="bad"> · {badGenes} bad</span>}
                  </div>
                </div>
              </div>
              <div style={{ margin: '8px 0' }}>
                <TraitList c={c} s={s} />
              </div>
              {kin && (
                <div className={kin.close ? 'card flat bad' : 'muted'} style={{ margin: '8px 0', fontSize: 'var(--font-size-0_8rem)' }}>
                  {kin.coefficient > 0
                    ? (kin.close ? 'Close family: ' : 'Related: ') + kin.label.toLowerCase() + ' · ' + (kin.coefficient * 100).toFixed(2) + '%'
                    : kin.label + ' (five generations)'}
                  <InfoDot text="This is the prospective children's estimated inbreeding coefficient: independent paths to shared ancestors, using up to five generations of known parents. Shared traits or surnames do not establish kinship. Missing ancestry stays unknown. This warning does not yet alter inheritance or health." />
                </div>
              )}
              <StatBlock s={s} c={c} />
              <div className="spread" style={{ marginTop: 'var(--space-8px)' }}>
                <span className="muted">{sug.prestigeCost ? `${sug.prestigeCost} prestige` : 'No cost'}</span>
                <Btn
                  kind="primary"
                  reason={s.prestige < sug.prestigeCost ? 'Not enough prestige' : null}
                  onClick={() => {
                    if (act((d) => acceptSuitor(d, i))) {
                      toast(`${target?.name} will wed ${c.name}!`);
                      close();
                    }
                  }}
                >
                  {sl.mode === 'marry' ? 'Marry' : 'Betroth'}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
