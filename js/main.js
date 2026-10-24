/*
 * main.js — the app: switches between screens, handles account creation and
 * login, decides which session is next, and runs a session with jsPsych.
 *
 * Participants do everything at home, on their own, so the software (not a
 * researcher) decides each session's number, type and form, using the rules
 * in CONFIG.SCHEDULE.
 *
 * Order of a session ("battery" = the tasks in CONFIG.BATTERY.order, js/battery.js):
 *   familiarization: welcome → pre-session facts → pre VAS → battery with practice → post VAS → end
 *   baseline:        welcome → pre-session facts → pre VAS → battery → post VAS → end
 *   test-rest /      welcome → pre-session facts → pre VAS
 *   test-fatigue:    → [video OR fatigue task: placeholder until M3]
 *                    → fatigue VAS (manipulation check) → battery → post VAS → end
 * (The one-time intake questions are on the Create account page instead.)
 *
 * Accounts, intake answers and session data are stored online in Firebase
 * (js/storage.js), under the participant CODE (never name or email):
 *   - when a session starts, a session record is created (complete: false);
 *   - after EVERY trial, that trial is uploaded, and the data so far is also
 *     kept in the browser as a backup copy;
 *   - at the end, once every trial has reached the server, the session is
 *     marked complete. Only complete sessions move the schedule forward.
 * Because progress lives online, a participant can switch devices between sessions.
 */

// ?dev=1 in the URL = test mode: shorter tasks, no 24 h wait, dev=true on every row.
// The local emulator (?emulator=1, see firebase-setup.js) is always dev mode.
const PARAMS = new URLSearchParams(window.location.search);

// ?quick=1 = QUICK TEST MODE, for trying out the tasks while building them:
// no login, straight into a session, NOTHING uploaded (data stays in this
// browser's backup copy only), participant code QUICKTEST. Only works on this
// computer (localhost), never on the hosted site. Always dev mode.
// Optional: &type=baseline (or test-rest, test-fatigue), &form=B,
// &calibrate=1 or 2 (TloadDback calibration at the end), &std=900 (T-fatigue pace in ms).
const QUICK = IS_LOCAL && PARAMS.get("quick") === "1";

const DEV = PARAMS.get("dev") === "1" || USE_EMULATOR || QUICK;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const SCREENS = ["home", "signup", "login", "dashboard"];

function show(name) {
  for (const s of SCREENS) document.getElementById("screen-" + s).hidden = s !== name;
  document.getElementById("jspsych-target").hidden = true;
  document.querySelectorAll(".errors").forEach((ul) => { ul.innerHTML = ""; });
  window.scrollTo(0, 0);
  if (name === "dashboard") renderDashboard();
}

function showErrors(form, errors) {
  form.querySelector(".errors").innerHTML = errors.map((msg) => `<li>${msg}</li>`).join("");
}

// ---------------------------------------------------------------------------
// Create account
// ---------------------------------------------------------------------------

async function onSignup(e) {
  e.preventDefault();
  const form = e.target;
  const v = (name) => form.elements[name].value.trim();
  const errors = [];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) errors.push("Enter a valid email address.");
  if (form.password.value.length < 8) errors.push("Password must be at least 8 characters.");
  if (form.password.value !== form.confirm_password.value) errors.push("The two passwords don't match.");
  if (!v("first_name")) errors.push("Enter your first name.");
  if (!v("last_name")) errors.push("Enter your last name.");

  // The intake fields carry their own rules (required, min, max) in survey.js.
  const intakeFields = [...document.querySelectorAll("#intake-fields input, #intake-fields select")];
  if (intakeFields.some((el) => !el.checkValidity())) {
    errors.push("Answer every question under \"About you\" (check that numbers are in a sensible range).");
  }
  showErrors(form, errors);
  if (errors.length) return;

  const intake = Object.fromEntries(intakeFields.map((el) => [el.name, el.value]));
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const result = await createAccount({
    email: v("email"), password: form.password.value,
    first_name: v("first_name"), last_name: v("last_name"),
    intake, dev: DEV
  });
  button.disabled = false;

  if (!result.ok) return showErrors(form, [result.error]);
  form.reset(); // clears the passwords from the page
  show("dashboard"); // Firebase logs the new account in automatically
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function onLogin(e) {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const result = await login(form.email.value, form.password.value);
  button.disabled = false;
  form.password.value = "";
  if (!result.ok) return showErrors(form, [result.error]);
  form.reset();
  show("dashboard");
}

// ---------------------------------------------------------------------------
// Which session is next?
// ---------------------------------------------------------------------------

// The full list of session types for one participant, in order, e.g.
// [familiarization, baseline ×5, test-rest, test-fatigue].
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

// Rough length shown on the participant home page, in minutes.
function sessionMinutes(next) {
  if (next.type === "familiarization") return 30;
  if (next.type === "test-rest" || next.type === "test-fatigue") return 40;
  return next.calibration ? 35 : 20;
}

// ---------------------------------------------------------------------------
// Participant home
// ---------------------------------------------------------------------------

async function renderDashboard() {
  const status = document.getElementById("dash-status");
  const greeting = document.getElementById("dash-greeting");
  greeting.textContent = "";
  status.innerHTML = `<p class="muted">Loading…</p>`;

  let account, record;
  try {
    account = await getCurrentAccount();
    if (account) record = await loadSessionRecord(account.participant_id);
  } catch (err) {
    console.error(err);
    // permission-denied here means the account's records are missing or
    // don't match (e.g. a participant record was deleted), not a network problem.
    if (err.code === "permission-denied") return showBrokenAccount(status);
    status.innerHTML = `<p class="errors">Couldn't load your account. Check your internet connection and reload the page.</p>`;
    return;
  }
  if (!account) {
    // Logged in to Firebase but no identity record (e.g. deleted by hand).
    if (DEV && fbAuth.currentUser) return showBrokenAccount(status);
    await logout();
    return show("home");
  }

  // textContent (not innerHTML) because the name was typed by the user.
  greeting.textContent = `Hi, ${account.first_name}`;

  const next = nextSession(record);
  // Milestone 1: only one session exists, so the text never mentions other sessions.
  if (next.finished) {
    status.innerHTML = `<p>You have completed the session. Thank you for taking part!</p>`;
  } else if (next.availableAt) {
    status.innerHTML = `
      <p>Thank you! Your next session opens on <b>${next.availableAt.toLocaleString([], {
        weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>.
      Please come back then.</p>`;
  } else {
    status.innerHTML = `
      <p>Your session is ready.</p>
      <p class="muted">Find a quiet place where you won't be interrupted, and allow about ${sessionMinutes(next)} minutes.</p>
      <button type="button" class="jspsych-btn big-btn" id="start-btn">Start session</button>`;
    const startBtn = document.getElementById("start-btn");
    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true; // no double starts
      const started = await startSession(account, next);
      if (!started) {
        startBtn.disabled = false;
        status.insertAdjacentHTML("beforeend",
          `<p class="errors">Couldn't start the session. Check your internet connection and try again.</p>`);
      }
    });
  }
}

// The login exists but its records are missing (usually because test data was
// deleted by hand in the console). Such a login can never be repaired, because
// the rules allow only one identity per login, ever.
// DEV MODE ONLY: offer to delete the login, which frees the email for a new
// sign-up. Any leftover identities/participants docs must still be deleted by
// hand in the console. Real participants just see the message.
async function showBrokenAccount(status) {
  status.innerHTML = `<p class="errors">Your account's records couldn't be found. Please contact the researcher.</p>`;
  if (!DEV) return;
  status.insertAdjacentHTML("beforeend", `<p class="muted" id="dev-diagnosis">Checking…</p>`);
  document.getElementById("dev-diagnosis").textContent = await diagnoseAccount();
  status.insertAdjacentHTML("beforeend", `
    <form id="dev-delete-form" class="form">
      <p class="muted">Dev mode: delete this login so the email can be used to sign up again.
      Leftover records must still be deleted in the Firebase console.</p>
      <label>Password (to confirm)
        <input name="password" type="password" autocomplete="current-password" required></label>
      <ul class="errors"></ul>
      <button type="submit" class="jspsych-btn">Delete this login and start over</button>
    </form>`);
  const form = document.getElementById("dev-delete-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = fbAuth.currentUser;
    try {
      // Firebase only lets a login delete itself right after a login, so
      // confirm the password first (this counts as a fresh login).
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, form.password.value);
      await user.reauthenticateWithCredential(credential);
      await user.delete();
      show("home");
    } catch (err) {
      form.password.value = "";
      showErrors(form, [friendlyAuthError(err)]);
    }
  });
}

// DEV MODE ONLY: says which of this login's records exist, to explain a broken account.
async function diagnoseAccount() {
  const user = fbAuth.currentUser;
  const lines = [`Logged in as ${user.email}.`];
  try {
    const identity = await fbDb.doc(`identities/${user.uid}`).get();
    if (!identity.exists) return [...lines, "Identity record: MISSING (identities/" + user.uid + ")."].join(" ");
    const code = identity.data().participant_id;
    lines.push(`Identity record: found, points to participant ${code}.`);
    try {
      await fbDb.doc(`participants/${code}`).get();
      lines.push(`Participant record ${code}: found.`);
      try {
        const snap = await loadSessionRecord(code);
        lines.push(`Session list: readable (${snap.sessions.length} sessions).`);
      } catch (err) {
        lines.push(`Session list: REFUSED (${err.code}). Check that the rules published in the ` +
                   `Firebase console match firestore.rules (they must include "match /sessions/{sid}").`);
      }
    } catch (err) {
      // The rules refuse to read a participant record that doesn't exist (or isn't yours).
      lines.push(`Participant record ${code}: MISSING or belongs to another login (${err.code}).`);
    }
  } catch (err) {
    lines.push(`Couldn't check (${err.code || err.message}).`);
  }
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const WELCOME = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>Welcome</h2>
    <p>Thanks for taking part.</p>
    <p>First a few short questions, then some short tasks.<br>
    Please put your phone away and sit comfortably.</p>`,
  choices: ["Start"],
  data: { task: "welcome" }
};

const END = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>All done. Thank you!</h2>
    <p>Your answers have been saved.</p>`,
  choices: ["Finish"],
  data: { task: "end" }
};

// Stand-in for the 16-min video / TloadDback task until Milestone 3.
// It is clearly labelled in the data so it can never pass for the real thing.
// Stand-in for the 16-min neutral video (T-rest) until a video is chosen.
// It is clearly labelled in the data so it can never pass for the real thing.
function manipulationPlaceholder() {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Placeholder</h2>
      <p>In the finished version, the 16-minute neutral video plays here.</p>
      <p class="muted">(Built in Milestone 3. Not for real data collection.)</p>`,
    choices: ["Continue"],
    data: { task: "manipulation_placeholder" }
  };
}

// next: { number, type, form, calibration (1, 2 or null), tload ({ std, source }, T-fatigue only) }
function buildTimeline(jsPsych, next) {
  const isFamiliarization = next.type === "familiarization";

  const timeline = [WELCOME];
  timeline.push(preSessionFacts());
  timeline.push(VAS_INSTRUCTIONS, ...preSessionVas());

  // Test sessions: 16-min fatigue task or video, then the fatigue rating (manipulation check).
  if (next.type === "test-fatigue") timeline.push(buildTloadMain({ stdMs: next.tload.std, source: next.tload.source }));
  if (next.type === "test-rest") timeline.push(manipulationPlaceholder());
  if (next.type === "test-fatigue" || next.type === "test-rest") timeline.push(postManipulationVas());

  // The task battery (js/battery.js). Practice only in familiarization;
  // later sessions go straight to the real blocks.
  timeline.push(buildBattery(jsPsych, { practice: isFamiliarization, form: next.form }));
  timeline.push(...postSessionVas());

  // End of baselines 4 and 5: TloadDback calibration, AFTER the battery and its
  // ratings, so it cannot affect that day's battery data.
  if (next.calibration) timeline.push(buildTloadCalibration(jsPsych, { which: next.calibration }));

  timeline.push(END);
  return timeline;
}

// ---------------------------------------------------------------------------
// Run a session
// ---------------------------------------------------------------------------

// ID of one session attempt, e.g. P017_S03_baseline_2026-10-09_154210 (local
// start time). Dev sessions start with DEV_. Code only: no name or email.
// Used as the Firestore doc ID and (plus ".csv") as the backup copy's name.
function makeSessionId(participant_id, next, startDate) {
  const p = (n) => String(n).padStart(2, "0");
  const d = startDate;
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
                `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${DEV ? "DEV_" : ""}${participant_id}_S${p(next.number)}_${next.type}_${stamp}`;
}

// Columns added to EVERY row of the data. Participant code only: never name or email.
function rowMetadata(participant_id, next, startDate) {
  return {
    participant_id,
    session_number: next.number,
    session_type: next.type,
    form: next.form,
    version: CONFIG.VERSION,
    dev: DEV,
    session_start: startDate.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, // to recover local time of day
    // Device info: at home everyone uses their own device, so this records which. Not personal data.
    user_agent: navigator.userAgent,
    screen_w: window.screen.width,
    screen_h: window.screen.height,
    device_pixel_ratio: window.devicePixelRatio
  };
}

// Runs one session. Returns true once it is running, or false if it couldn't
// be started (the session record couldn't be saved online, e.g. no internet).
async function startSession(account, next) {
  const participant_id = account.participant_id;
  const startDate = new Date();
  const session_id = makeSessionId(participant_id, next, startDate);
  const target = document.getElementById("jspsych-target");

  // T-fatigue: the pace comes from the calibrations at the end of baselines 4 and 5.
  if (next.type === "test-fatigue" && !QUICK) {
    try {
      next = { ...next, tload: chooseTloadStd(await loadCalibrationResults(participant_id)) };
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // Log this attempt online BEFORE the first trial, so an interrupted session
  // still shows up as an incomplete attempt (and trials have a session to go in).
  if (!QUICK) try {
    await createSessionDoc(participant_id, session_id, {
      participant_id, session_number: next.number, session_type: next.type, form: next.form,
      version: CONFIG.VERSION, dev: DEV,
      start: startDate.toISOString(), end: null, complete: false, n_trials: null
    });
  } catch (err) {
    console.error(err);
    return false;
  }

  const uploads = []; // one promise per trial upload
  const jsPsych = initJsPsych({
    display_element: target,
    on_trial_finish: (data) => {
      data.timestamp = new Date().toISOString(); // when this trial ended (UTC)
      // jsPsych's stored copy of this trial includes the rowMetadata columns.
      const row = jsPsych.data.get().last(1).values()[0];
      if (!QUICK) uploads.push(uploadTrial(participant_id, session_id, row));
      saveSessionData(session_id, jsPsych.data.get().csv(), false); // backup copy
    },
    on_finish: () => finishSession(jsPsych, participant_id, session_id, uploads, target)
  });
  jsPsych.data.addProperties(rowMetadata(participant_id, next, startDate));

  for (const s of SCREENS) document.getElementById("screen-" + s).hidden = true;
  // Remove the previous session's "Session complete" screen first, so it can't
  // flash up (or be tapped) before jsPsych draws the first screen.
  target.innerHTML = "";
  target.hidden = false;
  window.scrollTo(0, 0);
  if (!QUICK) window.addEventListener("beforeunload", warnOnLeave);
  keepScreenOn();

  jsPsych.run(buildTimeline(jsPsych, next));
  return true;
}

// End of a session: wait until every trial is on the server, then mark the
// session complete. The participant sees "Saving…" until then.
async function finishSession(jsPsych, participant_id, session_id, uploads, target) {
  const end = new Date().toISOString();
  jsPsych.data.get().addToAll({ session_end: end });
  saveSessionData(session_id, jsPsych.data.get().csv(), true); // backup copy
  if (QUICK) return showSessionDone(target, "quick");
  showSessionDone(target, "saving");

  // If the connection dropped, Firestore keeps retrying in the background;
  // after 10 s, tell the participant to keep the page open.
  const slow = setTimeout(() => showSessionDone(target, "slow"), 10000);
  let saved = true;
  try {
    // Every trial must be on the server BEFORE the session is marked
    // complete; after that, the database refuses new trials for it.
    await Promise.all(uploads);
    await completeSessionDoc(participant_id, session_id, end, jsPsych.data.get().count());
  } catch (err) {
    console.error(err);
    saved = false;
  }
  clearTimeout(slow);
  // Only now is it safe to leave the page.
  window.removeEventListener("beforeunload", warnOnLeave);
  showSessionDone(target, saved ? "saved" : "failed");
}

// state: "saving" | "slow" | "saved" | "failed" | "quick"
function showSessionDone(target, state) {
  if (state === "quick") {
    target.innerHTML = `
      <div class="done-screen">
        <h2>Quick test finished</h2>
        <p>Nothing was uploaded. The data is only in this browser's backup copy.</p>
        <button type="button" class="jspsych-btn big-btn" id="done-btn">Run again</button>
      </div>`;
    target.querySelector("#done-btn").addEventListener("click", () => location.reload());
    return;
  }
  const message = {
    saving: "<p>Saving your answers…</p>",
    slow: "<p><b>Still saving.</b> Please keep this page open and check your internet connection.</p>",
    saved: "<p>Thank you! Your session has been saved.</p>",
    failed: "<p class=\"errors\"><b>Your session could not be uploaded.</b> A copy is kept in this browser. Please let the researcher know.</p>"
  }[state];
  const done = state === "saved" || state === "failed";
  target.innerHTML = `
    <div class="done-screen">
      <h2>Session complete</h2>
      ${message}
      ${done ? `<button type="button" class="jspsych-btn big-btn" id="done-btn">Back to home</button>` : ""}
    </div>`;
  // jsPsych keeps its CSS class on the target; this button simply swaps screens back.
  if (done) target.querySelector("#done-btn").addEventListener("click", () => show("dashboard"));
}

// ---------------------------------------------------------------------------
// Device housekeeping
// ---------------------------------------------------------------------------

// Keep the screen awake so the device doesn't auto-lock mid-task.
// (Screen Wake Lock: Safari 16.4+, Chrome. If not supported, nothing happens.)
async function keepScreenOn() {
  try {
    if ("wakeLock" in navigator) await navigator.wakeLock.request("screen");
  } catch (e) { /* not allowed or not supported */ }
}

// Safari ignores user-scalable=no, so block the pinch gesture directly.
document.addEventListener("gesturestart", (e) => e.preventDefault());

// Warn if someone tries to leave or reload while a session is running.
function warnOnLeave(e) { e.preventDefault(); e.returnValue = ""; }

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

function setup() {
  if (DEV) {
    const banner = document.getElementById("dev-banner");
    banner.hidden = false;
    // Say which Firebase is in use, so a failed login is easy to explain.
    if (USE_EMULATOR) banner.textContent += " (local emulator: it must be running)";
    if (QUICK) banner.textContent = "QUICK TEST: no login, nothing uploaded";
  }
  document.getElementById("intake-fields").innerHTML = INTAKE_FORM_HTML;

  // Any button with data-go="signup" etc. switches to that screen.
  document.querySelectorAll("[data-go]").forEach((btn) =>
    btn.addEventListener("click", () => show(btn.dataset.go)));

  document.getElementById("signup-form").addEventListener("submit", onSignup);
  document.getElementById("login-form").addEventListener("submit", onLogin);
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    show("home");
  });

  if (QUICK) return startQuickSession();

  // Still logged in on this tab (e.g. after a reload)? Go straight to their page.
  waitForAuth().then((user) => show(user ? "dashboard" : "home"));
}

// QUICK TEST MODE (see QUICK at the top): run a session straight away as QUICKTEST.
function startQuickSession() {
  const types = ["familiarization", "baseline", "test-rest", "test-fatigue"];
  const type = types.includes(PARAMS.get("type")) ? PARAMS.get("type") : "familiarization";
  const form = PARAMS.get("form") === "B" ? "B" : "A";
  // &calibrate=1 or 2: add that TloadDback calibration at the end.
  const calibration = ["1", "2"].includes(PARAMS.get("calibrate")) ? Number(PARAMS.get("calibrate")) : null;
  // T-fatigue pace: &std=900 (ms per item), else the slowest pace.
  const std = Number(PARAMS.get("std")) || CONFIG.TLOAD.maxStdMs;
  startSession({ participant_id: "QUICKTEST" }, { number: 0, type, form, calibration, tload: { std, source: "quick-test" } });
}

setup();
