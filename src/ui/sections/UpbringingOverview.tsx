import { alive, ch, childrenOf, ruler } from '../../game/core';
import { allMentorships, allWardships, wardAtWar, wardshipOf } from '../../game/wards';
import { CharCard, Btn, Section } from '../components';
import { useGame } from '../store';

export function UpbringingOverview() {
  const { s, setUi } = useGame();
  const wards = allWardships(s).filter((w) => (w.homeId === s.playerClanId || w.hostId === s.playerClanId) && alive(ch(s, w.childId)));
  const mentors = allMentorships(s).filter((m) => {
    const c = ch(s, m.childId);
    return alive(c) && (c.clanId === s.playerClanId || wardshipOf(s, c.id)?.hostId === s.playerClanId);
  });
  const young = childrenOf(s, ruler(s)).some((c) => alive(c) && s.year - c.born >= 6 && s.year - c.born < 16);
  if (!wards.length && !mentors.length && !young) return null;
  return (
    <Section
      title="Who raises your children?"
      icon="family"
      info="Choose mentors or foster courts from a child's profile. Mentors take up to two pupils aged 6–15; wards leave aged 6–14 and return at 16. Skills, temperament, faith and real friendships can follow them into adulthood. Away wards study with their hosts: you pay no home tuition and cannot visit them for dinner. War can turn a ward into a hostage."
    >
      {!wards.length && !mentors.length ? (
        <div className="card flat spread wrap">
          <span className="muted">Their upbringing can shape the next reign.</span>
          <Btn small onClick={() => setUi({ tab: 'family' })}>
            Plan their upbringing
          </Btn>
        </div>
      ) : (
        <div className="grid">
          {mentors.map((m) => {
            const c = ch(s, m.childId)!;
            return (
              <CharCard
                key={'mentor-' + m.childId}
                c={c}
                sub={'Mentored by ' + (ch(s, m.mentorId)?.name ?? 'their teacher') + ' · Lessons end in ' + m.due}
                traitsMax={2}
                size={44}
              />
            );
          })}
          {wards.map((w) => {
            const c = ch(s, w.childId)!;
            return (
              <div key={'ward-' + w.childId}>
                <CharCard
                  c={c}
                  sub={
                    (w.hostId === s.playerClanId ? 'Your guest from House ' + s.clans[w.homeId]?.name : 'Fostered at House ' + s.clans[w.hostId]?.name) +
                    ' · Returns in ' +
                    w.due
                  }
                  traitsMax={2}
                  size={44}
                />
                {wardAtWar(s, w) && <p className="bad">Their home and foster court are at war.</p>}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
