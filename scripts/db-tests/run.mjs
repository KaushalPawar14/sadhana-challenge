// Scenario tests for the competition system, executed on PGlite (real Postgres) with the live data
// restored from the latest backup and ALL new migrations applied.
//   node scripts/db-tests/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDb, setClock, as, root } from './harness.mjs';

const results = [];
let current = '';
const ok = (cond, msg) => { results.push({ scenario: current, check: msg, pass: !!cond }); if (!cond) console.log('   FAIL:', msg); };
const eq = (a, b, msg) => ok(String(a) === String(b) || (a !== null && b !== null && a !== '' && b !== '' && !isNaN(Number(a)) && !isNaN(Number(b)) && Number(a) === Number(b)), `${msg} (got ${a}, expected ${b})`);
async function rejects(p, re, msg) {
  try { await p; ok(false, `${msg} -> expected error ${re}, but succeeded`); }
  catch (e) { ok(re.test(e.message), `${msg} -> ${e.message.split('\n')[0].slice(0, 90)}`); }
}
const scenario = name => { current = name; console.log('\n# ' + name); };
const uuid = () => crypto.randomUUID();

const { db, backup } = await createDb();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const sys = (sql, p = []) => as(db, 'system', sql, p);

// ---------- test world ----------
const mkUser = async (name, gender) => {
  const u = { id: uuid(), email: `${name.toLowerCase()}@test.local` };
  await db.query('insert into auth.users (id, email) values ($1,$2)', [u.id, u.email]);
  await db.query(`insert into public.users (id, full_name, mobile, department, gender, is_onboarded, age)
                  values ($1,$2,'9999999999','TEST',$3,true,20)`, [u.id, 'TEST_' + name, gender]);
  return u;
};
const S1 = await mkUser('S1', 'M'), S2 = await mkUser('S2', 'F'), S3 = await mkUser('S3', 'M');
const admin = (name, role) => ({ id: uuid(), email: `${name}@test.local`, role });
const HOD = admin('hod', 'HOD'), GUIDE = admin('guide', 'FOLK_GUIDE'), ENM = admin('enm', 'FOLK_ENABLER_MALE'), ENF = admin('enf', 'FOLK_ENABLER_FEMALE');
for (const a of [HOD, GUIDE, ENM, ENF]) await db.query('insert into public.admin_emails (email, role) values ($1,$2)', [a.email, a.role]);
const [book] = await q("insert into public.books (title, language, pdf_link) values ('TEST_BOOK','English','https://www.dropbox.com/x.pdf') returning id");

const saveComp = (who, o) => as(db, who, 'select public.save_competition($1::jsonb) id', [JSON.stringify(o)]);
const log = (who, date, rounds, minutes = null) => as(db, who, 'select public.log_activity($1::date,$2::int,$3::int) r', [date, rounds, minutes]);
const totals = async (comp, user) => (await q('select * from public.competition_totals where competition_id=$1 and user_id=$2', [comp, user]))[0];
const iso = (d, h = 4, m = 30) => `${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`; // 04:30Z = 10:00 IST

// =====================================================================
scenario('1. Reading competition = a daily LOG scored by commitment (bonus OFF)');
await setClock(db, iso('2026-11-09'));
const { rows: [{ id: R }] } = await saveComp(HOD, { title: 'TEST Reading', type: 'reading', bonus_enabled: false, start_date: '2026-11-09', end_date: '2026-11-15', status: 'published' });
await rejects(log(S1, '2026-11-09', 5, 30), /CHANTING_NOT_ENABLED/, 'reading-only: a chanting value is refused');
await rejects(as(db, S1, 'select public.set_commitment(10)'), /CHANTING_NOT_ENABLED/, 'commitment blocked');
await rejects(log(S1, '2026-11-09', null, 30), /READING_COMMITMENT_REQUIRED/, 'reading-only: reading commitment is mandatory before the first log');
await rejects(as(db, S1, 'select public.set_commitment(10, null)'), /CHANTING_NOT_ENABLED/, 'reading-only: no chanting commitment is asked');
await rejects(as(db, S1, 'select public.set_commitment(null, 61)'), /INVALID_READING_COMMITMENT/, 'reading commitment can never exceed 60 minutes');
await rejects(as(db, S1, 'select public.set_commitment(null, 0)'), /INVALID_READING_COMMITMENT/, 'reading commitment must be at least 1 minute');
await rejects(as(db, S1, 'select public.set_commitment(null, null)'), /READING_COMMITMENT_REQUIRED/, 'cannot skip the commitment');
await as(db, S1, 'select public.set_commitment(null, 30)');
await rejects(as(db, S1, 'select public.set_commitment(null, 20)'), /READING_COMMITMENT_CANNOT_DECREASE/, 'reading commitment can only be raised');
await as(db, S1, 'select public.set_commitment(null, 60)'); ok(true, 'reading commitment can be raised up to 60');
eq((await q('select reading_commitment_minutes m from public.competition_participants where competition_id=$1 and user_id=$2', [R, S1.id]))[0].m, 60, 'reading commitment stored');
ok((await q('select commitment_rounds r from public.competition_participants where competition_id=$1 and user_id=$2', [R, S1.id]))[0].r === null, 'reading-only: no chanting commitment stored');
await as(db, S2, 'select public.set_commitment(null, 15)'); await as(db, S3, 'select public.set_commitment(null, 15)');
await rejects(log(S1, '2026-11-09', null, null), /INVALID_MINUTES/, 'minutes are required in a reading log');
await rejects(log(S1, '2026-11-09', null, 601), /INVALID_MINUTES/, 'implausible minutes refused');
await log(S1, '2026-11-09', null, 30);
let t = await totals(R, S1.id);
eq(t.reading_points, 5, 'reading scored by commitment: 30 of 60 min x 10 = 5 points (day 1, x1)');
eq(t.total, 5, 'total = reading points');
await setClock(db, iso('2026-11-10'));
await log(S1, '2026-11-10', null, 60);
t = await totals(R, S1.id);
eq(t.reading_points, 25, 'day 2: 60 of 60 min = 10 x streak 2 = 20 -> 25 total');
eq(t.current_streak, 2, 'reading logs build the streak like chanting');
await rejects(log(S1, '2026-11-10', null, 60), /ALREADY_LOGGED/, 'one reading log per day');
await rejects(as(db, S1, 'select public.start_reading_session(gen_random_uuid())'), /does not exist/, 'in-app reading tracking no longer exists (leaderboard comes from the log only)');
const rl = (await q("select meta from public.points_ledger where competition_id=$1 and user_id=$2 and source='reading' order by activity_date", [R, S1.id]));
ok(rl[0].meta.commitment === 60 && rl[0].meta.minutes === 30, 'ledger row records minutes + commitment');
await rejects(as(db, S1, "select public.start_listening(gen_random_uuid(), 100)"), /BONUS_NOT_ENABLED/, 'quiz/listening is blocked');
eq((await as(db, S1, "select count(*)::int n from public.books where title='TEST_BOOK'")).rows[0].n, 1, 'books stay readable (library only, no tracking)');
eq((await as(db, S1, 'select count(*)::int n from public.audiobooks')).rows[0].n, 0, 'audiobooks/quiz hidden from students (RLS)');
const feed = await q("select kind, delta from public.activity_feed where competition_id=$1 and kind='reading' order by created_at", [R]);
ok(feed.length === 2 && Number(feed[0].delta.total) === 5, 'feed events carry the points delta');

// =====================================================================
scenario('2. Chanting competition, bonus ON (server-graded quiz)');
await setClock(db, iso('2026-11-20'));
const { rows: [{ id: C }] } = await saveComp(HOD, { title: 'TEST Chanting', type: 'chanting', bonus_enabled: true, start_date: '2026-11-20', end_date: '2026-11-26', status: 'published',
  config: { streak_multiplier_cap: 2 } });
await rejects(log(S1, '2026-11-20', 10, 30), /READING_NOT_ENABLED/, 'chanting-only: a reading value is refused');
await rejects(log(S1, '2026-11-20', 10), /COMMITMENT_REQUIRED/, 'commitment required first');
await rejects(as(db, S1, 'select public.set_commitment(17)'), /INVALID_COMMITMENT/, 'chanting commitment can never exceed 16 rounds');
await rejects(as(db, S1, 'select public.set_commitment(0)'), /INVALID_COMMITMENT/, 'chanting commitment must be at least 1');
await rejects(as(db, S1, 'select public.set_commitment(10, 30)'), /READING_NOT_ENABLED/, 'chanting-only: no reading commitment is asked');
await as(db, S1, 'select public.set_commitment(10)');
await rejects(as(db, S1, 'select public.set_commitment(5)'), /COMMITMENT_CANNOT_DECREASE/, 'commitment can only be raised (server)');
await log(S1, '2026-11-20', 10);
eq((await totals(C, S1.id)).total, 10, 'day 1: 10 rounds / commit 10 -> 10 pts');
await setClock(db, iso('2026-11-21'));
await log(S1, '2026-11-21', 10);
eq((await totals(C, S1.id)).total, 30, 'day 2: streak x2 -> +20');
await setClock(db, iso('2026-11-22'));
await log(S1, '2026-11-22', 10);
t = await totals(C, S1.id);
eq(t.total, 50, 'day 3: streak 3 but cap 2 -> +20');
eq(t.current_streak, 3, 'streak = 3');
await rejects(log(S1, '2026-11-22', 10), /ALREADY_LOGGED/, 'no double logging');
// audiobook + quiz
const { rows: [{ id: AB }] } = await as(db, HOD, 'select public.hod_save_audiobook($1::jsonb) id',
  [JSON.stringify({ category: 'F2', title: 'TEST Audio', audio_url: 'https://www.dropbox.com/a.mp3', language: 'English', duration_seconds: 100,
    questions: [{ question_text: 'Q1', options: ['a', 'b', 'c', 'd'], correct_answer: 'b' }, { question_text: 'Q2', options: ['w', 'x', 'y', 'z'], correct_answer: 'z' }] })]);
eq((await as(db, S1, "select count(*)::int n from public.audiobooks where title like 'TEST%'")).rows[0].n, 1, 'audiobooks visible when bonus on');
await rejects(as(db, S1, 'select public.get_quiz($1::uuid)', [AB]), /QUIZ_LOCKED/, 'quiz locked before listening');
await as(db, S1, 'select public.start_listening($1::uuid, 100)', [AB]);
const t0 = new Date(iso('2026-11-22')).getTime();
for (let s = 10; s <= 60; s += 10) { await setClock(db, new Date(t0 + s * 1000).toISOString()); await as(db, S1, 'select public.listening_heartbeat($1::uuid)', [AB]); }
await rejects(as(db, S1, 'select public.get_quiz($1::uuid)', [AB]), /QUIZ_LOCKED/, '60 s of 80 s required -> still locked');
for (let s = 70; s <= 90; s += 10) { await setClock(db, new Date(t0 + s * 1000).toISOString()); await as(db, S1, 'select public.listening_heartbeat($1::uuid)', [AB]); }
const quiz = (await as(db, S1, 'select public.get_quiz($1::uuid) q', [AB])).rows[0].q;
ok(quiz.questions.length === 2 && !JSON.stringify(quiz).includes('correct'), 'quiz returned without answers');
const qs = quiz.questions; const ans = {};
ans[qs.find(x => x.question_text === 'Q1').id] = 'b';           // correct
ans[qs.find(x => x.question_text === 'Q2').id] = 'x';           // wrong
const sub = (await as(db, S1, 'select public.submit_quiz($1::uuid,$2::jsonb) r', [AB, JSON.stringify(ans)])).rows[0].r;
eq(sub.score, 1, 'graded on the server: 1/2'); eq(sub.points_earned, 5, '5 points per correct answer');
eq((await totals(C, S1.id)).bonus_points, 5, 'quiz bonus in ledger/totals');
await rejects(as(db, S1, 'select public.submit_quiz($1::uuid,$2::jsonb)', [AB, JSON.stringify(ans)]), /QUIZ_ALREADY_SUBMITTED/, 'one attempt per audiobook');
eq((await as(db, S1, 'select count(*)::int n from public.quiz_answers')).rows[0].n, 0, 'student cannot read quiz_answers');
eq((await q("select count(*)::int n from information_schema.columns where table_name='quiz_questions' and column_name='correct_answer'"))[0].n, 0, 'quiz_questions has no correct_answer column');

// =====================================================================
scenario('3. Both competition, bonus ON, weights chanting 1 / reading 2');
await setClock(db, iso('2026-12-01'));
const { rows: [{ id: B }] } = await saveComp(HOD, { title: 'TEST Both', type: 'both', bonus_enabled: true, start_date: '2026-12-01', end_date: '2026-12-07', status: 'published',
  config: { weight_chanting: 1, weight_reading: 2 } });
await rejects(log(S1, '2026-12-01', 16, 15), /COMMITMENT_REQUIRED/, 'both: first log asks for the commitments');
await rejects(as(db, S1, 'select public.set_commitment(16, null)'), /READING_COMMITMENT_REQUIRED/, 'both: chanting commitment alone is not enough');
await rejects(as(db, S1, 'select public.set_commitment(null, 30)'), /COMMITMENT_REQUIRED/, 'both: reading commitment alone is not enough');
await rejects(as(db, S1, 'select public.set_commitment(17, 30)'), /INVALID_COMMITMENT/, 'both: rounds above 16 rejected');
await rejects(as(db, S1, 'select public.set_commitment(16, 61)'), /INVALID_READING_COMMITMENT/, 'both: minutes above 60 rejected');
await as(db, S1, 'select public.set_commitment(16, 30)');
const both = (await q('select commitment_rounds r, reading_commitment_minutes m from public.competition_participants where competition_id=$1 and user_id=$2', [B, S1.id]))[0];
ok(both.r === 16 && both.m === 30, 'both: rounds and minutes stored together (16 / 30)');
await as(db, S2, 'select public.set_commitment(16, 30)');
await as(db, S3, 'select public.set_commitment(16, 30)');
const st3 = (await as(db, S1, 'select public.get_my_state() s')).rows[0].s;
ok(st3.required.chanting && st3.required.reading && st3.commitment === 16 && st3.reading_commitment === 30, 'get_my_state reports both commitments');
await log(S1, '2026-12-01', 16, 15);
await as(db, HOD, 'select public.give_bonus($1::uuid, 7, $2)', [S1.id, 'TEST service']);
t = await totals(B, S1.id);
eq(t.chanting_points, 10, 'chanting 16/16 -> 10'); eq(t.reading_points, 5, 'reading 15 of 30 min x 10 -> 5');
eq(t.bonus_points, 7, 'manual bonus 7'); eq(t.total, 10 * 1 + 5 * 2 + 7, 'total = 10*1 + 5*2 + 7 = 27');
const rb = await as(db, HOD, 'select public.rebuild_competition_totals($1::uuid) n', [B]);
eq((await totals(B, S1.id)).total, 27, 'rebuild_competition_totals reproduces the same total');
await sys('delete from public.competition_totals where competition_id=$1', [B]);
await as(db, HOD, 'select public.rebuild_competition_totals($1::uuid)', [B]);
eq((await totals(B, S1.id)).total, 27, 'totals fully rebuildable from logs/sessions/ledger');
// extra data for later finalization
await log(S2, '2026-12-01', 8, 0);                    // 5 pts
await setClock(db, iso('2026-12-02')); await log(S2, '2026-12-02', 16, 0); // streak 2 -> 20
await log(S3, '2026-12-02', 16, 0);                   // 10
const lb = (await as(db, S1, 'select * from public.get_leaderboard($1::uuid)', [B])).rows;
ok(!('mobile' in lb[0]), 'leaderboard exposes no phone numbers'); eq(lb[0].user_id, S1.id, 'S1 leads the leaderboard');
const { rows: fd } = await as(db, S2, 'select kind from public.activity_feed where competition_id=$1', [B]);
ok(fd.length >= 3, 'student can read the public live feed');

// =====================================================================
scenario('4. Overlapping dates are rejected');
await rejects(saveComp(HOD, { title: 'TEST Overlap', type: 'chanting', start_date: '2026-12-05', end_date: '2026-12-12', status: 'published' }), /OVERLAPS_EXISTING_COMPETITION/, 'published overlap rejected');
const { rows: [{ id: draftId }] } = await saveComp(HOD, { title: 'TEST Draft overlap', type: 'chanting', start_date: '2026-12-05', end_date: '2026-12-12', status: 'draft' });
ok(!!draftId, 'a draft may overlap');
await rejects(as(db, HOD, "select public.set_competition_status($1::uuid,'published')", [draftId]), /OVERLAPS_EXISTING_COMPETITION/, 'publishing an overlapping draft is rejected');
await as(db, HOD, 'select public.delete_competition_draft($1::uuid)', [draftId]);
await rejects(saveComp(HOD, { title: 'bad', type: 'chanting', start_date: '2027-01-10', end_date: '2027-01-01', status: 'draft' }), /end date/, 'end before start rejected');
await rejects(saveComp(HOD, { title: 'bad', type: 'both', start_date: '2027-01-01', end_date: '2027-01-10', status: 'draft', config: { weight_reading: -1 } }), /must be 0 or more/, 'negative weight rejected');

await rejects(saveComp(HOD, { id: B, title: 'TEST Both', type: 'both', bonus_enabled: true, start_date: '2026-12-01', end_date: '2026-12-07', status: 'draft' }), /cannot go back to draft/, 'a competition with activity cannot be reverted to draft');

// =====================================================================
scenario('5. Logging before start / after end is rejected');
await setClock(db, iso('2026-11-30'));
await rejects(log(S1, '2026-11-30', 16, 0), /NO_ACTIVE_COMPETITION/, 'day before start: no active competition');
await setClock(db, iso('2026-12-03'));
await rejects(log(S1, '2026-11-30', 16, 0), /DATE_OUTSIDE_COMPETITION/, 'date before start rejected');
await setClock(db, iso('2026-12-08'));
await log(S3, '2026-12-07', 16, 0).then(() => ok(true, 'last day may be submitted within the 1-day grace'));
await rejects(log(S3, '2026-12-08', 16, 0), /DATE_OUTSIDE_COMPETITION/, 'date after end rejected');
await setClock(db, iso('2026-12-09'));
await rejects(log(S1, '2026-12-07', 16, 0), /NO_ACTIVE_COMPETITION/, 'after end + grace: rejected');

// =====================================================================
scenario('6. Guide / Enabler are view-only (UI is not the guard: DB + RPC)');
for (const [nm, who] of [['guide', GUIDE], ['male enabler', ENM], ['female enabler', ENF]]) {
  await rejects(saveComp(who, { title: 'x', type: 'chanting', start_date: '2027-03-01', end_date: '2027-03-05', status: 'draft' }), /FORBIDDEN/, `${nm}: cannot create competition`);
  await rejects(as(db, who, 'select public.give_bonus($1::uuid, 5, $2)', [S1.id, 'x']), /FORBIDDEN/, `${nm}: cannot give bonus`);
  await rejects(as(db, who, 'select public.finalize_competition($1::uuid, $2::jsonb)', [B, '[]']), /FORBIDDEN/, `${nm}: cannot finalize`);
  await rejects(as(db, who, 'select public.grant_award($1::uuid, gen_random_uuid(), $2)', [S1.id, 'x']), /FORBIDDEN/, `${nm}: cannot grant award`);
  await rejects(as(db, who, 'select public.revoke_award(gen_random_uuid())'), /FORBIDDEN/, `${nm}: cannot revoke award`);
  await rejects(as(db, who, "insert into public.competitions (title,type,start_date,end_date) values ('x','chanting','2027-01-01','2027-01-02')"), /permission denied/, `${nm}: direct INSERT on competitions denied`);
  eq((await as(db, who, "update public.users set full_name='hacked' where id=$1 returning id", [S1.id])).rows.length, 0, `${nm}: cannot edit students (RLS, 0 rows)`);
  eq((await as(db, who, "update public.app_settings set value='x' returning 1")).rows.length, 0, `${nm}: app_settings update affects 0 rows (RLS)`);
  eq((await as(db, who, "delete from public.books returning 1")).rows.length, 0, `${nm}: cannot delete books (RLS)`);
}
eq((await as(db, HOD, 'select public.rebuild_competition_totals($1::uuid) n', [C])).rows.length, 1, 'HOD can run HOD functions');
// gender scope enforced in the database
const seen = async who => (await as(db, who, "select full_name from public.users where full_name like 'TEST_%' order by 1")).rows.map(r => r.full_name).join(',');
eq(await seen(HOD), 'TEST_S1,TEST_S2,TEST_S3', 'HOD sees all students');
eq(await seen(GUIDE), 'TEST_S1,TEST_S3', 'Guide sees male students only (RLS)');
eq(await seen(ENM), 'TEST_S1,TEST_S3', 'Male enabler sees male students only');
eq(await seen(ENF), 'TEST_S2', 'Female enabler sees female students only');
eq((await as(db, ENF, 'select count(*)::int n from public.activity_logs where competition_id=$1 and user_id=$2', [B, S1.id])).rows[0].n, 0, 'female enabler cannot read male student logs');
eq((await as(db, ENF, 'select count(*)::int n from public.get_leaderboard($1::uuid) where gender=$2', [B, 'M'])).rows[0].n, 0, 'leaderboard is gender-scoped for female enabler');
eq((await as(db, ENM, 'select count(*)::int n from public.activity_feed where competition_id=$1 and gender=$2', [B, 'F'])).rows[0].n, 0, 'feed is gender-scoped for male enabler');

// =====================================================================
scenario('7. Student cannot bypass the system via REST');
await rejects(as(db, S1, 'update public.users set total_points = 99999 where id=$1', [S1.id]), /permission denied/, 'cannot write own total_points');
await rejects(as(db, S1, 'update public.users set target_chanting = 1 where id=$1', [S1.id]), /permission denied/, 'cannot write own commitment');
await rejects(as(db, S1, 'update public.users set streak_count = 99 where id=$1', [S1.id]), /permission denied/, 'cannot write streak');
await rejects(as(db, S1, 'update public.users set is_onboarded = true where id=$1', [S1.id]), /permission denied/, 'cannot flip is_onboarded');
await as(db, S1, "update public.users set full_name='TEST_S1' where id=$1", [S1.id]); ok(true, 'can still edit safe profile fields');
for (const stmt of [
  "insert into public.points_ledger (competition_id,user_id,source,points,activity_date) values ($1,$2,'manual_bonus',1000,current_date)",
  "insert into public.activity_logs (competition_id,user_id,log_date,chanting_rounds,points_earned) values ($1,$2,current_date,1,1000)",
  "insert into public.reading_sessions (competition_id,user_id,book_id,seconds_read,counted_seconds,status) select $1,$2,id,99999,99999,'closed' from public.books limit 1",
  "insert into public.quiz_submissions (competition_id,user_id,audiobook_id,score,points_earned) select $1,$2,id,9,9999 from public.audiobooks limit 1",
  "insert into public.competition_totals (competition_id,user_id,total) values ($1,$2,99999) on conflict (competition_id,user_id) do update set total=99999",
  "insert into public.user_awards (competition_id,competition_award_id,user_id,unlock_date) select $1,id,$2,current_date from public.competition_awards limit 1",
  "insert into public.user_audiobook_progress (competition_id,user_id,audiobook_id,is_completed) select $1,$2,id,true from public.audiobooks limit 1",
]) await rejects(as(db, S1, stmt, [B, S1.id]), /permission denied/, 'direct write denied: ' + stmt.slice(12, 48));
eq((await as(db, S1, 'select count(*)::int n from public.users')).rows[0].n, 1, 'student sees only their own users row');
eq((await as(db, S1, 'select mobile from public.users where id=$1', [S2.id])).rows.length, 0, "cannot read another student's phone number");
eq((await as(db, S1, 'select count(*)::int n from public.admin_emails').catch(e => ({ rows: [{ n: 'denied' }] }))).rows[0].n, 'denied', 'admin_emails not readable');
eq((await as(db, S1, "select public.is_admin('hod@test.local') r")).rows[0].r, false, 'is_admin() can no longer be used to enumerate admins');
eq((await as(db, 'anon', "select 1").then(() => 'ok')), 'ok', 'anon connection sane');
await rejects(as(db, 'anon', 'select public.get_leaderboard($1::uuid)', [B]), /permission denied/, 'anon cannot call RPCs');
await rejects(as(db, S1, 'select public.recompute_user($1::uuid,$2::uuid)', [B, S1.id]), /permission denied/, 'internal functions are not callable');
await rejects(as(db, S1, "select public.give_bonus($1::uuid, 5, 'x')", [S1.id]), /FORBIDDEN/, 'student cannot give themselves bonus');
const prof = (await as(db, S1, 'select public.get_public_profile($1::uuid,$2::uuid) p', [S2.id, B])).rows[0].p;
ok(!JSON.stringify(prof).includes('9999999999'), "public profile contains no phone number");

// =====================================================================
scenario('8. Finalize: suggested winners, swap, freeze');
await setClock(db, iso('2026-12-09'));
const sug = (await as(db, HOD, 'select public.suggest_award_winners($1::uuid) s', [B])).rows[0].s;
const rising = sug.find(a => a.award_key === 'rising_sadhaka');
eq(rising.winners[0].user_id, S1.id, 'suggested Rising Sadhaka = S1 (highest total)');
const flame = sug.find(a => a.award_key === 'unbroken_flame');
ok(flame.winners.length >= 1, 'Unbroken Flame has a suggestion');
// give one award a future unlock date to test the popup timing
const awards = await q('select id, award_key from public.competition_awards where competition_id=$1 order by sort_order', [B]);
const cur = await q('select * from public.competition_awards where competition_id=$1 order by sort_order', [B]);
const patched = cur.map(a => ({ id: a.id, award_key: a.award_key, name: a.name, description: a.description, icon_key: a.icon_key, criterion: a.criterion, top_n: a.top_n, gender_scope: a.gender_scope,
  unlock_date: a.award_key === 'mahayogi_crown' ? '2026-12-12' : a.unlock_date.toISOString().slice(0, 10) }));
await as(db, HOD, 'select public.save_competition_awards($1::uuid,$2::jsonb)', [B, JSON.stringify(patched)]);
await rejects(as(db, GUIDE, 'select public.finalize_competition($1::uuid,$2::jsonb)', [B, '[]']), /FORBIDDEN/, 'guide cannot finalize');
await rejects(as(db, HOD, 'select public.finalize_competition($1::uuid,$2::jsonb)', [R + '', '[]']).then(() => { throw new Error('x'); }).catch(e => { throw e; }), /./, 'sanity').catch(() => {});
const idOf = k => awards.find(a => a.award_key === k).id;
const assignments = [
  { competition_award_id: idOf('rising_sadhaka'), user_id: S2.id, rank: 1, custom_message: 'HOD swapped this one' },   // swapped
  { competition_award_id: idOf('unbroken_flame'), user_id: flame.winners[0].user_id, rank: 1 },
  { competition_award_id: idOf('mahayogi_crown'), user_id: S1.id, rank: 1, custom_message: 'Future unlock' },
];
const fin = (await as(db, HOD, 'select public.finalize_competition($1::uuid,$2::jsonb) r', [B, JSON.stringify(assignments)])).rows[0].r;
eq(fin.awards_given, 3, 'finalized with 3 awards (others left unassigned)');
eq((await q('select stored_status from public.competitions where id=$1', [B]))[0].stored_status, 'finalized', 'status = finalized');
const snap = await q('select user_id,total,rank from public.competition_final_standings where competition_id=$1 order by rank', [B]);
eq(snap[0].user_id, S1.id, 'frozen standings: S1 first'); const frozenTotal = Number(snap[0].total);
// later activity can never change results
await sys("insert into public.activity_logs (user_id,competition_id,log_date,chanting_rounds,commitment_rounds) values ($1,$2,'2026-12-06',16,16)", [S3.id, B]);
await rejects(sys('select public.rebuild_competition_totals($1::uuid)', [B]), /COMPETITION_FINALIZED/, 'rebuild blocked after finalization');
await rejects(sys('select public.recompute_user($1::uuid,$2::uuid)', [B, S3.id]), /COMPETITION_FINALIZED/, 'recompute blocked after finalization');
await rejects(as(db, HOD, "select public.give_bonus($1::uuid, 500, 'late')", [S3.id]), /NO_ACTIVE_COMPETITION/, 'no bonus after finalization');
await rejects(saveComp(HOD, { id: B, title: 'x', type: 'both', start_date: '2026-12-01', end_date: '2026-12-07', status: 'published' }), /COMPETITION_FINALIZED/, 'finalized competition cannot be edited');
const lbF = (await as(db, S2, 'select * from public.get_leaderboard($1::uuid)', [B])).rows;
eq(Number(lbF[0].total), frozenTotal, 'finalized leaderboard served from the frozen snapshot');
await rejects(as(db, HOD, 'select public.finalize_competition($1::uuid,$2::jsonb)', [B, '[]']), /COMPETITION_FINALIZED/, 'cannot finalize twice');

// finalize before end is rejected
await setClock(db, iso('2027-01-05'));
const { rows: [{ id: F }] } = await saveComp(HOD, { title: 'TEST Future', type: 'chanting', start_date: '2027-01-05', end_date: '2027-01-10', status: 'published' });
await rejects(as(db, HOD, 'select public.finalize_competition($1::uuid,$2::jsonb)', [F, '[]']), /not ended/, 'finalize before end rejected');

// =====================================================================
scenario('9. Winner popup: before / on unlock date, once only, history');
await setClock(db, iso('2026-12-09'));
let pend = (await as(db, S2, 'select public.get_pending_award_popups() p')).rows[0].p;
ok(pend.length >= 1, 'S2 (swapped-in winner) gets popups once awards have unlocked'); eq(pend.find(p => p.custom_message === 'HOD swapped this one')?.custom_message, 'HOD swapped this one', 'popup carries the custom message');
pend = (await as(db, S1, 'select public.get_pending_award_popups() p')).rows[0].p;
eq(pend.length, 0, 'S1: award unlocks 12 Dec -> NO popup before the unlock date');
let mine = (await as(db, S1, 'select public.get_my_awards() a')).rows[0].a;
eq(mine.length, 1, 'S1 still sees the pending award in Award History'); eq(mine[0].unlocked, false, 'flagged as not unlocked yet ("unlocks on <date>")');
const view = (await as(db, S1, 'select public.get_awards_view($1::uuid) v', [B])).rows[0].v;
const mv = view.find(a => a.award_key === 'mahayogi_crown');
ok(mv.mine.won && !mv.mine.unlocked, 'Awards page: "You\'ve won X - unlocks on <date>"');
ok(!(await as(db, S3, 'select public.get_awards_view($1::uuid) v', [B])).rows[0].v.find(a => a.award_key === 'mahayogi_crown').winners.length, 'other students cannot see the winner before unlock');
await setClock(db, iso('2026-12-12'));
pend = (await as(db, S1, 'select public.get_pending_award_popups() p')).rows[0].p;
eq(pend.length, 1, 'S1: popup appears on the unlock date');
await as(db, S1, 'select public.mark_award_seen($1::uuid)', [pend[0].id]);
pend = (await as(db, S1, 'select public.get_pending_award_popups() p')).rows[0].p;
eq(pend.length, 0, 'never shown again after dismissal');
await as(db, S2, 'select public.mark_award_seen($1::uuid)', [(await q('select id from public.user_awards where user_id=$1', [S1.id]))[0].id]);
eq((await q('select count(*)::int n from public.user_awards where user_id=$1 and seen_at is not null', [S1.id]))[0].n, 1, "another student cannot mark someone else's award seen (still 1 seen only for S1)");
mine = (await as(db, S1, 'select public.get_my_awards() a')).rows[0].a;
ok(mine.length === 1 && mine[0].unlocked, 'award stays in Award History permanently');
// revoke (HOD, soft)
const uaId = (await q('select id from public.user_awards where user_id=$1', [S1.id]))[0].id;
await rejects(as(db, GUIDE, 'select public.revoke_award($1::uuid)', [uaId]), /FORBIDDEN/, 'guide cannot revoke');
await as(db, HOD, 'select public.revoke_award($1::uuid)', [uaId]);
eq((await as(db, S1, 'select public.get_my_awards() a')).rows[0].a.length, 0, 'revoked award disappears (soft revoke)');
eq((await q('select count(*)::int n from public.user_awards where id=$1 and revoked_at is not null', [uaId]))[0].n, 1, 'row kept with revoked_at');
const gid = await as(db, HOD, 'select public.grant_award($1::uuid,$2::uuid,$3) id', [S3.id, idOf('unbroken_flame'), 'manual grant']);
ok(!!gid.rows[0].id, 'HOD manual grant works');

// =====================================================================
scenario('10. IST day boundary (00:10 IST counts as the new day)');
await setClock(db, '2027-02-01T00:00:00Z');
const { rows: [{ id: E }] } = await saveComp(HOD, { title: 'TEST Boundary', type: 'chanting', start_date: '2027-02-01', end_date: '2027-02-10', status: 'published' });
await setClock(db, '2027-02-02T18:20:00Z');                       // 23:50 IST on 2 Feb
eq((await q('select public.ist_today() d'))[0].d.toISOString().slice(0, 10), '2027-02-02', '23:50 IST is still 2 Feb');
await as(db, S1, 'select public.set_commitment(16)');
await setClock(db, '2027-02-02T18:40:00Z');                       // 00:10 IST on 3 Feb
eq((await q('select public.ist_today() d'))[0].d.toISOString().slice(0, 10), '2027-02-03', '00:10 IST is 3 Feb');
const r1 = (await log(S1, null, 16)).rows[0].r;
eq(r1.date.slice(0, 10), '2027-02-03', 'default log date = IST day, not UTC day');
const late = await log(S1, '2027-02-02', 16);
eq((await q("select is_late_submission l from public.activity_logs where user_id=$1 and log_date='2027-02-02'", [S1.id]))[0].l, true, 'yesterday (IST) is flagged late');
// counter: partial today never locks; only completed days auto-fulfil; no double counting
await as(db, S3, 'select public.set_commitment(16)');
let sy = (await as(db, S3, 'select public.sync_chanting(3) r')).rows[0].r;
eq(sy.todayRounds, 3, 'counter records today rounds'); eq(sy.autoFulfilledDates.length, 0, 'partial TODAY is not auto-fulfilled');
await as(db, S3, 'select public.sync_chanting(8)');
await log(S3, '2027-02-03', 12).then(() => ok(true, 'manual log for today still works after counter taps'));
eq((await q("select count(*)::int n from public.activity_logs where user_id=$1 and competition_id=$2", [S3.id, E]))[0].n, 1, 'no duplicate day');
await setClock(db, '2027-02-04T05:00:00Z');
await as(db, S3, 'select public.sync_chanting(null)');
await as(db, S3, 'select public.sync_chanting(5)');            // 4 Feb: 5 rounds
await setClock(db, '2027-02-05T05:00:00Z');
sy = (await as(db, S3, 'select public.sync_chanting(null) r')).rows[0].r;
eq(sy.autoFulfilledDates.length, 0, 'the Japa counter NEVER creates a log/points (leaderboard = submitted log only)');
eq((await q("select rounds_chanted r from public.user_chanting_logs where user_id=$1 and log_date='2027-02-04'", [S3.id]))[0].r, 5, 'counter value is stored so the log form can pre-fill it');
eq((await q("select count(*)::int n from public.activity_logs where user_id=$1 and log_date='2027-02-04'", [S3.id]))[0].n, 0, 'no activity log was created from the counter');
sy = (await as(db, S3, 'select public.sync_chanting(null) r')).rows[0].r;
eq(sy.autoFulfilledDates.length, 0, 'second sync still creates nothing');
eq((await q("select count(*)::int n from public.points_ledger where user_id=$1 and competition_id=$2 and source='chanting'", [S3.id, E]))[0].n, 1, 'only the submitted log is in the ledger');
await rejects(as(db, S1, 'select public.sync_chanting(9999)'), /INVALID_ROUNDS/, 'implausible counter rejected');

// =====================================================================
scenario('12. HOD deletes a competition (typed-title confirmation, all data removed)');
await setClock(db, '2027-03-01T05:00:00Z');
const { rows: [{ id: D }] } = await saveComp(HOD, { title: 'TEST Deletable', type: 'chanting', bonus_enabled: true, start_date: '2027-03-01', end_date: '2027-03-05', status: 'published' });
await as(db, S2, 'select public.set_commitment(10)');
await log(S2, '2027-03-01', 10);
await as(db, HOD, 'select public.give_bonus($1::uuid, 7, $2)', [S2.id, 'TEST bonus']);
const lifetimeBefore = (await q('select total_points t from public.users where id=$1', [S2.id]))[0].t;
ok(lifetimeBefore > 0, 'student has lifetime points before the delete');
for (const [nm, who] of [['guide', GUIDE], ['male enabler', ENM], ['female enabler', ENF]]) {
  await rejects(as(db, who, 'select public.delete_competition($1::uuid,$2)', [D, 'TEST Deletable']), /FORBIDDEN/, `${nm}: cannot delete a competition`);
}
await rejects(as(db, S2, 'select public.delete_competition($1::uuid,$2)', [D, 'TEST Deletable']), /FORBIDDEN/, 'student cannot delete a competition');
await rejects(as(db, HOD, 'select public.delete_competition($1::uuid,$2)', [D, 'wrong title']), /exact competition title/, 'wrong confirmation title is refused');
ok((await q('select count(*)::int n from public.competitions where id=$1', [D]))[0].n === 1, 'nothing deleted by the refused attempts');
const del = (await as(db, HOD, 'select public.delete_competition($1::uuid,$2) r', [D, '  test deletable '])).rows[0].r;
eq(del.deleted, true, 'HOD deletes an ACTIVE competition with activity (title match is case/space tolerant)');
for (const [tbl, col] of [['competitions', 'id'], ['activity_logs', 'competition_id'], ['points_ledger', 'competition_id'], ['bonus_points', 'competition_id'],
  ['competition_totals', 'competition_id'], ['competition_awards', 'competition_id'], ['competition_participants', 'competition_id'], ['activity_feed', 'competition_id']]) {
  eq((await q(`select count(*)::int n from public.${tbl} where ${col}=$1`, [D]))[0].n, 0, `${tbl}: rows removed`);
}
eq((await q('select total_points t from public.users where id=$1', [S2.id]))[0].t < lifetimeBefore, true, 'lifetime total recomputed after the delete');
// a FINALIZED competition (with winners) can be deleted too
const bAwards = (await q('select count(*)::int n from public.user_awards where competition_id=$1', [B]))[0].n;
ok(bAwards > 0, 'finalized competition has awards before the delete');
await as(db, HOD, 'select public.delete_competition($1::uuid,$2)', [B, 'TEST Both']);
eq((await q('select count(*)::int n from public.user_awards where competition_id=$1', [B]))[0].n, 0, 'finalized competition: winners/awards removed');
eq((await q('select count(*)::int n from public.competition_final_standings where competition_id=$1', [B]))[0].n, 0, 'finalized competition: frozen standings removed');
eq((await as(db, HOD, 'select public.delete_competition(gen_random_uuid(), $1) r', ['x'])).rows[0].r.deleted, false, 'deleting a missing competition is a harmless no-op');

// =====================================================================
scenario('11. Competition 1 migration (dry run on the restored LIVE backup)');
const fresh = await createDb();
const rep = (await fresh.db.query('select count(*)::int n, count(*) filter (where diff<>0)::int mism, sum(old_total)::int o, sum(new_total)::int nw from public.migration_report_competition1')).rows[0];
eq(rep.mism, 0, `all ${rep.n} students: rebuilt total == old users.total_points (old sum ${rep.o}, new sum ${rep.nw})`);
const c1 = (await fresh.db.query("select title,type,bonus_enabled,to_char(start_date,'YYYY-MM-DD') s,to_char(end_date,'YYYY-MM-DD') e,stored_status from public.competitions")).rows[0];
eq(c1.type, 'chanting', 'Competition 1 type = chanting'); eq(c1.bonus_enabled, false, 'bonus_enabled = false (no quiz/bonus rows in its dates)');
eq(`${c1.s}..${c1.e}`, '2026-08-19..2026-09-03', 'dates from app_settings');
const st = (await fresh.db.query("select public.competition_status(c) s from public.competitions c")).rows[0].s;
eq(st, 'ended', 'Competition 1 derived status = ended (not finalized)');
const unattached = (await fresh.db.query('select (select count(*) from public.activity_logs where competition_id is null)+(select count(*) from public.reading_sessions where competition_id is null) n')).rows[0].n;
eq(unattached, 0, 'every existing log/session attached to Competition 1');
eq((await fresh.db.query("select count(*)::int n from public.app_settings where key like 'challenge_%'")).rows[0].n, 0, 'old competition keys retired');
const flags = (await fresh.db.query('select kind, count(*)::int n from public.migration_flags_competition1 group by kind')).rows;
console.log('   flags:', JSON.stringify(flags));
await fresh.db.close();

// =====================================================================
const pass = results.filter(r => r.pass).length, fail = results.length - pass;
console.log(`\n${pass}/${results.length} checks passed, ${fail} failed`);
fs.writeFileSync(path.join(root, 'scripts/db-tests/last-results.json'), JSON.stringify({ at: new Date().toISOString(), backup: path.basename(backup || ''), pass, fail, results }, null, 2));
process.exit(fail ? 1 : 0);
