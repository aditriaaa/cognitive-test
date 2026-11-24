/*
 * main.js — the participant app: switches between screens, handles account
 * creation and login, shows the participant home page, and runs a session
 * with jsPsych.
 *
 * Where the rest lives:
 *   which session is next ......... js/schedule.js
 *   saving (Firebase + backup) .... js/storage.js
 *   the tasks ..................... js/battery.js and the task files
 *   developer/test tools .......... js/dev-tools.js (never seen by participants)
 *
 * Order of a session ("battery" = the tasks in CONFIG.BATTERY.order, js/battery.js):
 *   familiarization: welcome → pre-session facts → pre VAS → battery with practice → post VAS → end
 *   baseline:        welcome → pre-session facts → pre VAS → battery → post VAS
 *                    (→ TloadDback calibration at the end of baselines 4 and 5) → end
 *   test-rest /      welcome → pre-session facts → pre VAS
 *   test-fatigue:    → 16-min video (rest) OR 16-min TloadDback (fatigue)
 *                    → fatigue VAS (manipulation check) → battery → post VAS → end
 * (The one-time intake questions are on the Create account page instead.)
 *
 * Saving, under the participant CODE (never name or email):
 *   - when a session starts, a session record is created online (complete: false);
 *   - after EVERY trial, that trial is uploaded, and the data so far is also
 *     kept in the browser as a backup copy;
 *   - at the end, once every trial has reached the server, the session is
 *     marked complete. Only complete sessions move the schedule forward.
 * Because progress lives online, a participant can switch devices between sessions.
 */

const PARAMS = new URLSearchParams(window.location.search);

// ?quick=1 = quick test mode (js/dev-tools.js): no login, nothing uploaded.
// Only on this computer (localhost), never on the hosted site.
const QUICK = IS_LOCAL && PARAMS.get("quick") === "1";

// ?dev=1 = test mode: shorter tasks, no 24 h wait, dev=true on every row.
// The local emulator (?emulator=1) and quick mode are always dev mode.
const DEV = PARAMS.get("dev") === "1" || USE_EMULATOR || QUICK;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const SCREENS = ["home", "signup", "login", "reset", "dashboard"];

function show(name) {
  for (const s of SCREENS) document.getElementById("screen-" + s).hidden = s !== name;
  document.getElementById("jspsych-target").hidden = true;
  document.querySelectorAll(".errors").forEach((ul) => { ul.innerHTML = ""; });
  document.getElementById("reset-sent").hidden = true;
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
  const intakeFields = [...document.querySelectorAll("#intake-fields input, #intake-fields select")];

  // Before IRB/SRC approval, only dev/test accounts can be made (CONFIG.ENROLLMENT_OPEN).
  if (!CONFIG.ENROLLMENT_OPEN && !DEV) return showErrors(form, ["This study isn't open to new participants yet."]);

  const errors = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) errors.push("Enter a valid email address.");
  if (form.password.value.length < 8) errors.push("Password must be at least 8 characters.");
  if (form.password.value !== form.confirm_password.value) errors.push("The two passwords don't match.");
  if (!v("first_name")) errors.push("Enter your first name.");
  if (!v("last_name")) errors.push("Enter your last name.");
  // The intake fields carry their own rules (required, min, max) in survey.js.
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
// Forgot password
// ---------------------------------------------------------------------------

async function onResetPassword(e) {
  e.preventDefault();
  const form = e.target;
  const sent = document.getElementById("reset-sent");
  sent.hidden = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim())) return showErrors(form, ["Enter a valid email address."]);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  const result = await sendPasswordReset(form.email.value);
  button.disabled = false;
  if (!result.ok) return showErrors(form, [result.error]);
  showErrors(form, []);
  // Same message whether or not the email has an account.
  sent.textContent = "If there is an account for this email, a link to reset the password is on its way. " +
    "Check your inbox (and spam folder), then come back and log in.";
  sent.hidden = false;
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
  const total = totalSessions(account.participant_id);
  if (next.finished) {
    status.innerHTML = `<p>You have completed all ${total} sessions. Thank you for taking part!</p>`;
  } else if (next.availableAt) {
    status.innerHTML = `
      <p>Thank you! Session ${next.number} of ${total} opens on <b>${next.availableAt.toLocaleString([], {
        weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>.
      Please come back then.</p>`;
  } else {
    status.innerHTML = `
      <p>Session ${next.number} of ${total} is ready.</p>
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

// The login exists but its records are missing (usually test data deleted by
// hand). Participants see only the message; dev mode adds tools (dev-tools.js).
function showBrokenAccount(status) {
  status.innerHTML = `<p class="errors">Your account's records couldn't be found. Please contact the researcher.</p>`;
  if (DEV) showDevAccountTools(status);
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

// T-rest: the 16-min neutral nature video (js/plugin-rest-video.js, settings
// in CONFIG.REST_VIDEO). Same length as the TloadDback task in T-fatigue.
function restVideo() {
  const V = CONFIG.REST_VIDEO;
  return {
    type: jsPsychRestVideo,
    sources: V.sources,
    credit: V.credit,
    start_seconds: V.startSeconds,
    watch_seconds: DEV ? CONFIG.DEV.restVideoSeconds : V.watchSeconds,
    max_wall_minutes: V.maxWallMinutes,
    data: { task: "rest_video" }
  };
}

// next: { number, type, form, calibration (1, 2 or null), tload ({ std, source }, T-fatigue only) }
function buildTimeline(jsPsych, next) {
  const timeline = [WELCOME, preSessionFacts(), VAS_INSTRUCTIONS, ...preSessionVas()];

  // Test sessions: 16-min fatigue task or video, then the fatigue rating (manipulation check).
  if (next.type === "test-fatigue") timeline.push(buildTloadMain({ stdMs: next.tload.std, source: next.tload.source }));
  if (next.type === "test-rest") timeline.push(restVideo());
  if (next.type === "test-fatigue" || next.type === "test-rest") timeline.push(postManipulationVas());

  // The task battery (js/battery.js). Practice only in familiarization;
  // later sessions go straight to the real blocks.
  timeline.push(buildBattery(jsPsych, { practice: next.type === "familiarization", form: next.form }));
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

// "YYYY-MM-DD HH:MM:SS" in the device's own time zone.
function localDateTime(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
    session_start: startDate.toISOString(),                     // UTC
    // Local clock time the session started, e.g. "2026-11-23 19:04:12", for
    // checking the protocol's "same 2-hour time-of-day window" in the analysis
    // (recorded only; the app does not enforce it).
    session_start_local: localDateTime(startDate),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Device info: at home everyone uses their own device, so this records which. Not personal data.
    user_agent: navigator.userAgent,
    screen_w: window.screen.width,
    screen_h: window.screen.height,
    device_pixel_ratio: window.devicePixelRatio
  };
}

// Runs one session. Returns true once it is running, or false if it couldn't
// be started (e.g. no internet). In quick mode nothing is uploaded.
async function startSession(account, next) {
  const participant_id = account.participant_id;
  const startDate = new Date();
  const session_id = makeSessionId(participant_id, next, startDate);
  const target = document.getElementById("jspsych-target");
  const online = !QUICK;

  if (online) {
    try {
      // T-fatigue: the pace comes from the calibrations at the end of baselines 4 and 5.
      if (next.type === "test-fatigue") {
        next = { ...next, tload: chooseTloadStd(await loadCalibrationResults(participant_id)) };
      }
      // Log this attempt online BEFORE the first trial, so an interrupted session
      // still shows up as an incomplete attempt (and trials have a session to go in).
      await createSessionDoc(participant_id, session_id, {
        participant_id, session_number: next.number, session_type: next.type, form: next.form,
        version: CONFIG.VERSION, dev: DEV,
        start: startDate.toISOString(), end: null, complete: false, n_trials: null
      });
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  const uploads = []; // one promise per trial upload
  const jsPsych = initJsPsych({
    display_element: target,
    on_trial_finish: (data) => {
      data.timestamp = new Date().toISOString(); // when this trial ended (UTC)
      // jsPsych's stored copy of this trial includes the rowMetadata columns.
      const row = jsPsych.data.get().last(1).values()[0];
      if (online) uploads.push(uploadTrial(participant_id, session_id, row));
      saveSessionData(session_id, jsPsych.data.get().csv(), false); // backup copy
    },
    on_finish: () => finishSession(jsPsych, participant_id, session_id, uploads, target, online)
  });
  jsPsych.data.addProperties(rowMetadata(participant_id, next, startDate));

  for (const s of SCREENS) document.getElementById("screen-" + s).hidden = true;
  // Remove the previous session's "Session complete" screen first, so it can't
  // flash up (or be tapped) before jsPsych draws the first screen.
  target.innerHTML = "";
  target.hidden = false;
  window.scrollTo(0, 0);
  if (online) window.addEventListener("beforeunload", warnOnLeave);
  keepScreenOn();

  jsPsych.run(buildTimeline(jsPsych, next));
  return true;
}

// End of a session: wait until every trial is on the server, then mark the
// session complete. The participant sees "Saving…" until then.
async function finishSession(jsPsych, participant_id, session_id, uploads, target, online) {
  const end = new Date().toISOString();
  jsPsych.data.get().addToAll({ session_end: end });
  saveSessionData(session_id, jsPsych.data.get().csv(), true); // backup copy
  if (!online) return showSessionDone(target, "quick");
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

// state: "saving" | "slow" | "saved" | "failed" | "quick" (quick test mode)
function showSessionDone(target, state) {
  const screens = {
    saving: { text: "<p>Saving your answers…</p>" },
    slow: { text: "<p><b>Still saving.</b> Please keep this page open and check your internet connection.</p>" },
    saved: { text: "<p>Thank you! Your session has been saved.</p>", button: "Back to home" },
    failed: { text: "<p class=\"errors\"><b>Your session could not be uploaded.</b> A copy is kept in this browser. Please let the researcher know.</p>",
              button: "Back to home" },
    quick: { title: "Quick test finished", text: "<p>Nothing was uploaded. The data is only in this browser's backup copy.</p>",
             button: "Run again" }
  };
  const s = screens[state];
  target.innerHTML = `
    <div class="done-screen">
      <h2>${s.title || "Session complete"}</h2>
      ${s.text}
      ${s.button ? `<button type="button" class="jspsych-btn big-btn" id="done-btn">${s.button}</button>` : ""}
    </div>`;
  if (s.button) {
    target.querySelector("#done-btn").addEventListener("click", () =>
      (state === "quick" ? location.reload() : show("dashboard")));
  }
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
  // Before IRB/SRC approval: say on the Create account screen that sign-up is closed.
  if (!CONFIG.ENROLLMENT_OPEN && !DEV) {
    document.getElementById("signup-form").insertAdjacentHTML("beforebegin",
      `<p class="errors" id="enrollment-closed">This study isn't open to new participants yet.</p>`);
  }

  // Any button with data-go="signup" etc. switches to that screen.
  document.querySelectorAll("[data-go]").forEach((btn) =>
    btn.addEventListener("click", () => show(btn.dataset.go)));

  document.getElementById("signup-form").addEventListener("submit", onSignup);
  document.getElementById("login-form").addEventListener("submit", onLogin);
  document.getElementById("reset-form").addEventListener("submit", onResetPassword);
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    show("home");
  });

  if (QUICK) return startQuickSession();

  // Still logged in on this tab (e.g. after a reload)? Go straight to their page.
  waitForAuth().then((user) => show(user ? "dashboard" : "home"));
}

setup();
