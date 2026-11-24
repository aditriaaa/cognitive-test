/*
 * schedule.js — which session a participant does next (protocol rules).
 *
 * Participants do everything at home, on their own, so the software (not a
 * researcher) decides each session's number, type and form, using the rules
 * in CONFIG.SCHEDULE:
 *   session 1 = familiarization, then the baselines, then the two test
 *   sessions (rest and fatigue) in the order given by TEST_ORDER.
 * Sessions must be at least CONFIG.SCHEDULE.minHoursBetweenSessions apart
 * (not enforced in dev mode). Tested by tests/schedule.test.mjs.
 *
 * Uses DEV (set in main.js) when called.
 */

// The full list of session types for one participant, in order, e.g.
// [familiarization, baseline x5, test-rest, test-fatigue].
// Which test session comes first is read from TEST_ORDER (js/forms.js): a
// random list made in blocks of 4, one entry per participant number
// ("R" = rest first, "F" = fatigue first). P and D codes have separate lists.
function sessionPlan(participant_id) {
  const S = CONFIG.SCHEDULE;
  const n = Number(participant_id.slice(1));
  const order = TEST_ORDER[participant_id[0]][n - 1];
  const tests = order === "R" ? ["test-rest", "test-fatigue"] : ["test-fatigue", "test-rest"];
  return ["familiarization", ...Array(S.baselineSessions).fill("baseline"), ...tests];
}

// The next session for a participant, from their session record
// ({ participant_id, sessions: [...] }, see loadSessionRecord in storage.js).
// Returns { finished: true } or { number, type, form, calibration, availableAt }.
// Only COMPLETED sessions count. If someone quits halfway, that attempt is kept
// (marked incomplete) and they redo the same session number next time.
// Dev-mode test runs and real sessions are counted separately, so testing
// never moves a real participant forward in their schedule.
function nextSession(record) {
  const S = CONFIG.SCHEDULE;
  const plan = sessionPlan(record.participant_id);
  const done = record.sessions.filter((s) => s.complete && Boolean(s.dev) === DEV);
  if (done.length >= Math.min(plan.length, S.sessionsAvailable)) return { finished: true };

  const number = done.length + 1;
  let availableAt = null;
  const last = done[done.length - 1];
  if (last && !DEV) {
    const opens = new Date(last.end).getTime() + S.minHoursBetweenSessions * 3600 * 1000;
    if (opens > Date.now()) availableAt = new Date(opens);
  }
  return {
    finished: false,
    number,
    type: plan[number - 1],
    form: S.formOrder[(number - 1) % S.formOrder.length],
    calibration: calibrationFor(number),
    availableAt
  };
}

// TloadDback calibration at the end of the LAST TWO baseline sessions (B4 and
// B5 with 5 baselines): 1 = first calibration (with familiarization), 2 = second.
// Session 1 is familiarization, so baseline k is session k + 1.
function calibrationFor(sessionNumber) {
  const lastBaseline = CONFIG.SCHEDULE.baselineSessions + 1;
  if (sessionNumber === lastBaseline - 1) return 1;
  if (sessionNumber === lastBaseline) return 2;
  return null;
}

// Number of sessions in the study (as offered).
function totalSessions(participant_id) {
  return Math.min(sessionPlan(participant_id).length, CONFIG.SCHEDULE.sessionsAvailable);
}

// Rough length shown on the participant home page, in minutes.
function sessionMinutes(next) {
  if (next.type === "familiarization") return 30;
  if (next.type === "test-rest" || next.type === "test-fatigue") return 40;
  return next.calibration ? 35 : 20;
}
