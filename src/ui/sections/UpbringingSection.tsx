// Upbringing (wave 2 wards and mentors): who is raising a child, and the
// choices you have about it. Reading it never changes the game.
import { useId, useState } from 'react';
import { ageOf, alive, fullName } from '../../game/core';
import { theFaith } from '../../game/planets';
import type { Character } from '../../game/types';
import {
  appointMentor,
  canBeMentored,
  endMentorship,
  fosterBlocker,
  fosterOptions,
  guardianOf,
  mentorBlocker,
  mentorCandidates,
  mentorshipOf,
  recallWard,
  sendAsWard,
  teachingText,
  wardshipOf,
  WARD_AGES,
} from '../../game/wards';
import { Btn, Section } from '../components';
import { useGame } from '../store';

const years = (n: number) => (n <= 0 ? 'less than a year' : `${n} year${n === 1 ? '' : 's'}`);

export function UpbringingSection({ c }: { c: Character }) {
  const { s, act, toast } = useGame();
  const id = useId();
  const [mentorId, setMentorId] = useState('');
  const [hostId, setHostId] = useState('');
  if (!alive(c) || ageOf(s, c) >= 16) return null;
  const ward = wardshipOf(s, c.id);
  const mentoring = mentorshipOf(s, c.id);
  const mine = c.clanId === s.playerClanId;
  const hostedByYou = ward?.hostId === s.playerClanId;
  const mentorable = canBeMentored(s, c);
  const fosterable = mine && !ward && !c.prisonerOf && ageOf(s, c) >= WARD_AGES[0] && ageOf(s, c) <= WARD_AGES[1];
  if (!ward && !mentoring && !mentorable && !fosterable) return null;

  const guardian = ward && guardianOf(s, ward);
  const mentor = mentoring && s.characters[mentoring.mentorId];
  const candidates = mentorable ? mentorCandidates(s, c.id) : [];
  const chosenMentor = candidates.find((m) => m.id === mentorId) ?? candidates[0];
  const courts = fosterable ? fosterOptions(s, c.id) : [];
  const chosenCourt = courts.find((o) => o.clan.id === hostId) ?? courts[0];

  return (
    <Section
      title="Upbringing"
      icon="study"
      info={`A mentor at your court passes on part of their best skill, perhaps a temperament, and a lasting bond. A ward is raised at another house's court until 16 and comes home with that lord's skill and ways, sometimes their faith, and friends in that family. If you go to war with that house, a ward becomes a hostage.`}
    >
      <div className="card flat stack">
        {ward && !hostedByYou && (
          <div>
            Being raised at the court of <b>House {s.clans[ward.hostId]?.name}</b>
            {guardian ? ` by ${fullName(s, guardian)}` : ''} for {years(s.year - ward.since)}; home at 16 ({years(Math.max(0, ward.due - s.year))} from now).
          </div>
        )}
        {ward && hostedByYou && (
          <div>
            A ward from <b>House {s.clans[ward.homeId]?.name}</b>, raised at your court for {years(s.year - ward.since)}; goes home at 16.
          </div>
        )}
        {mentor && (
          <div>
            Mentored by <b>{mentor.id === s.rulerId ? 'you' : mentor.name}</b> for {years(s.year - mentoring!.since)} ({teachingText(s, mentor)}).
          </div>
        )}
        {!ward && !mentoring && mine && <div className="muted">Raised at home by tutors.</div>}

        {mentorable && candidates.length > 0 && (
          <div className="stack">
            <label htmlFor={id + '-mentor'}>
              {mentoring ? 'Change mentor' : 'Choose a mentor'}
              <select id={id + '-mentor'} style={{ width: '100%', minWidth: 0 }} value={chosenMentor?.id ?? ''} onChange={(e) => setMentorId(e.target.value)}>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === s.rulerId ? 'You' : m.name}: {teachingText(s, m)}
                  </option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <Btn
                small
                reason={chosenMentor ? mentorBlocker(s, c.id, chosenMentor.id) : 'Nobody to choose'}
                onClick={() => chosenMentor && act((d) => appointMentor(d, c.id, chosenMentor.id))}
              >
                Appoint mentor
              </Btn>
              {mentoring && (
                <Btn small kind="ghost" confirm="Tap again to end the lessons" onClick={() => toast(act((d) => endMentorship(d, c.id)) || 'The lessons end.')}>
                  End lessons
                </Btn>
              )}
            </div>
          </div>
        )}

        {fosterable && (
          <div className="stack">
            <label htmlFor={id + '-court'}>
              Send as a ward to
              <select id={id + '-court'} style={{ width: '100%', minWidth: 0 }} value={chosenCourt?.clan.id ?? ''} onChange={(e) => setHostId(e.target.value)}>
                {!courts.length && <option value="">No court will take them</option>}
                {courts.map((o) => (
                  <option key={o.clan.id} value={o.clan.id}>
                    House {o.clan.name} ({Math.round(o.chance * 100)}%): {teachingText(s, o.guardian)}
                    {o.clan.faithId !== c.faithId ? `; ${theFaith(o.clan.faithId)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <Btn
              small
              reason={chosenCourt ? fosterBlocker(s, c.id, chosenCourt.clan.id) : 'No court will take them'}
              onClick={() => chosenCourt && act((d) => sendAsWard(d, c.id, chosenCourt.clan.id))}
            >
              Ask them
            </Btn>
          </div>
        )}

        {ward && !hostedByYou && mine && (
          <div className="btn-row">
            <Btn
              small
              kind="ghost"
              confirm="Tap again: their hosts will be offended"
              onClick={() => toast(act((d) => recallWard(d, c.id)) || 'They come home.')}
            >
              Bring them home early
            </Btn>
          </div>
        )}
      </div>
    </Section>
  );
}
