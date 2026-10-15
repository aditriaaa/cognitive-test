/*
 * researcher.js: the researcher page (researcher.html).
 *
 * 1. Log in. The login must have a researchers/{uid} doc (added by hand in the
 *    Firebase console), otherwise the database refuses to show anything.
 * 2. Load every participant record and every session attempt, and show them
 *    in a table. Real and dev/test data are shown separately, never mixed.
 * 3. Download buttons build CSV files in the browser:
 *      trials   every trial of every session = the raw data for analysis
 *      sessions one row per session attempt (complete or not)
 *      intake   one row per participant code with the intake answers
 *
 * Everything is keyed by participant CODE. Names and emails (identities/...)
 * are never read by this page (CLAUDE.md rule 5).
 *
 * Cost note: Firestore counts one "read" per document. The trials download
 * reads one document per trial, so the page shows how many it will read first.
 * (Free plan: 50,000 reads per day.)
 */

const FREE_DAILY_READS = 50000;

// Loaded data: participants[] and sessions[] (each session has an `id` field).
let participants = [];
let sessions = [];

const $ = (id) => document.getElementById(id);
const which = () => $("r-which").value; // "real" or "dev"
// Today's LOCAL date for file names, e.g. 2026-10-14 (toISOString would give the UTC date).
const today = () => new Date().toLocaleDateString("en-CA"); // en-CA formats as YYYY-MM-DD

function showScreen(name) {
  $("r-login").hidden = name !== "login";
  $("r-data").hidden = name !== "data";
}

function setErrors(list, messages) {
  list.innerHTML = "";
  for (const msg of messages) {
    const li = document.createElement("li");
    li.textContent = msg;
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Login: only researcher accounts get past this
// ---------------------------------------------------------------------------

async function isResearcher(user) {
  try {
    const snap = await fbDb.doc(`researchers/${user.uid}`).get();
    return snap.exists;
  } catch (err) {
    return false; // rules refused: not a researcher
  }
}

async function enter(user) {
  if (!user) return showScreen("login");
  if (!(await isResearcher(user))) {
    await logout();
    showScreen("login");
    return setErrors(document.querySelector("#r-login-form .errors"),
      ["This login is not a researcher account."]);
  }
  showScreen("data");
  loadAll();
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.target;
  const errors = form.querySelector(".errors");
  setErrors(errors, []);
  const result = await login(form.email.value, form.password.value);
  form.password.value = "";
  if (!result.ok) return setErrors(errors, [result.error]);
  enter(fbAuth.currentUser);
}

// ---------------------------------------------------------------------------
// Load participants and sessions (cheap: one read per participant/session)
// ---------------------------------------------------------------------------

async function loadAll() {
  $("r-summary").textContent = "Loading…";
  setErrors($("r-errors"), []);
  try {
    const pSnap = await fbDb.collection("participants").get();
    participants = pSnap.docs.map((d) => d.data());
    // One query per participant for their session attempts (run in parallel).
    const lists = await Promise.all(participants.map((p) =>
      sessionsCol(p.participant_id).orderBy("start").get()));
    sessions = lists.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    console.error(err);
    $("r-summary").textContent = "";
    return setErrors($("r-errors"), ["Couldn't load the data: " + (err.code || err.message)]);
  }
  render();
}

// Only the rows for the chosen view. Sessions are filtered by their OWN dev
// flag (a real participant's test run is dev data); intake by the participant's.
const shownSessions = () => sessions
  .filter((s) => s.dev === (which() === "dev"))
  .sort((a, b) => a.participant_id.localeCompare(b.participant_id) || a.start.localeCompare(b.start));
const shownParticipants = () => participants
  .filter((p) => p.dev === (which() === "dev"))
  .sort((a, b) => a.participant_id.localeCompare(b.participant_id));

function render() {
  const rows = shownSessions();
  const complete = rows.filter((s) => s.complete);
  const reads = trialReadsNeeded(rows);
  $("r-summary").textContent =
    `${shownParticipants().length} participants, ${rows.length} session attempts ` +
    `(${complete.length} complete, ${rows.length - complete.length} incomplete). ` +
    `Downloading all trials reads about ${reads.toLocaleString()} records.`;

  const tbody = $("r-rows");
  tbody.innerHTML = "";
  for (const s of rows) {
    const tr = document.createElement("tr");
    if (!s.complete) tr.className = "r-incomplete";
    const cells = [s.participant_id, s.session_number, s.session_type, s.form,
      new Date(s.start).toLocaleString(), s.complete ? "yes" : "no",
      s.n_trials ?? "", s.version];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value; // textContent: never interpret stored text as HTML
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// Complete sessions know their trial count; for incomplete ones we don't know
// it without reading, so assume a typical amount.
const GUESS_TRIALS_IF_INCOMPLETE = 50;
function trialReadsNeeded(rows) {
  return rows.reduce((sum, s) => sum + (s.n_trials ?? GUESS_TRIALS_IF_INCOMPLETE), 0);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Every value in quotes; quotes inside doubled. Empty for null/undefined.
function csvCell(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

// rows: array of objects. Columns in `first` come first (if present), then all
// other columns alphabetically, so files are easy to read and always in the same order.
function toCsv(rows, first = []) {
  const all = new Set(rows.flatMap((r) => Object.keys(r)));
  const columns = [...first.filter((c) => all.has(c)), ...[...all].filter((c) => !first.includes(c)).sort()];
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

// A link that saves `text` as a file when clicked.
function csvLink(fileName, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = fileName;
  return a;
}

// Saves a file straight away. Only works while still handling the click itself
// (browsers block downloads that start later; see downloadTrials).
function download(fileName, text) {
  const a = csvLink(fileName, text);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

const TRIAL_FIRST_COLUMNS = [
  "participant_id", "session_id", "session_number", "session_type", "form", "version", "dev",
  "session_start", "session_end", "session_complete", "trial_index", "task", "timestamp",
  "time_elapsed", "rt", "response", "outcome"
];

async function downloadTrials() {
  const rows = shownSessions();
  if (!rows.length) return setErrors($("r-errors"), ["No sessions to download."]);
  const reads = trialReadsNeeded(rows);
  if (reads > FREE_DAILY_READS * 0.8 &&
      !confirm(`This reads about ${reads.toLocaleString()} records. The free Firebase plan allows ` +
               `${FREE_DAILY_READS.toLocaleString()} per day, so it may stop partway. Continue?`)) return;

  const button = $("r-dl-trials");
  button.disabled = true;
  setErrors($("r-errors"), []);
  clearProgress();
  const out = [];
  try {
    // A few sessions at a time, so the page stays responsive and shows progress.
    for (let i = 0; i < rows.length; i += 5) {
      $("r-progress").textContent = `Reading sessions ${i + 1}–${Math.min(i + 5, rows.length)} of ${rows.length}…`;
      const batch = rows.slice(i, i + 5);
      const snaps = await Promise.all(batch.map((s) =>
        sessionsCol(s.participant_id).doc(s.id).collection("trials").get()));
      batch.forEach((s, k) => {
        // Docs come back sorted by ID (0000, 0001, ...) = trial order.
        for (const d of snaps[k].docs) {
          out.push({ ...d.data(), session_id: s.id, session_end: s.end, session_complete: s.complete });
        }
      });
    }
  } catch (err) {
    console.error(err);
    setErrors($("r-errors"), ["Download stopped: " + (err.code || err.message) +
      (err.code === "resource-exhausted" ? " (daily free limit reached; try again tomorrow)" : "")]);
    return;
  } finally {
    button.disabled = false;
  }
  // Browsers (especially Safari) block a download that starts after a wait,
  // because it no longer counts as "the user clicked". So instead of saving
  // automatically, show a link the researcher clicks to save the file.
  const fileName = `cogbat_${which()}_trials_${today()}.csv`;
  const link = csvLink(fileName, toCsv(out, TRIAL_FIRST_COLUMNS));
  link.className = "jspsych-btn";
  link.textContent = `Save ${fileName}`;
  clearProgress();
  $("r-progress").append(`Ready: ${out.length.toLocaleString()} trials from ${rows.length} sessions. `, link);
}

// Clears the progress line, including any prepared "Save" link (and frees its memory).
function clearProgress() {
  const link = $("r-progress").querySelector("a");
  if (link) URL.revokeObjectURL(link.href);
  $("r-progress").textContent = "";
}

function downloadSessions() {
  const rows = shownSessions().map(({ id, ...s }) => ({ session_id: id, ...s }));
  if (!rows.length) return setErrors($("r-errors"), ["No sessions to download."]);
  download(`cogbat_${which()}_sessions_${today()}.csv`, toCsv(rows, [
    "participant_id", "session_id", "session_number", "session_type", "form", "version", "dev",
    "start", "end", "complete", "n_trials"]));
}

function downloadIntake() {
  // owner_uid is left out on purpose: it is the link to the identity record,
  // so the research files can't be joined back to names without the console.
  const rows = shownParticipants().map((p) => {
    const { submitted_at, version, dev, ...answers } = p.intake || {};
    return { participant_id: p.participant_id, dev: p.dev, created_at: p.created_at,
             intake_version: version, ...answers };
  });
  if (!rows.length) return setErrors($("r-errors"), ["No participants to download."]);
  download(`cogbat_${which()}_intake_${today()}.csv`, toCsv(rows, ["participant_id", "dev", "created_at", "intake_version"]));
}

// ---------------------------------------------------------------------------
// Page setup
// ---------------------------------------------------------------------------

if (USE_EMULATOR) $("dev-banner").hidden = false;
$("r-login-form").addEventListener("submit", onLogin);
$("r-logout").addEventListener("click", async () => { await logout(); showScreen("login"); });
// Switching view clears any prepared "Save" link, so a dev file can't be saved as real or vice versa.
$("r-which").addEventListener("change", () => { clearProgress(); render(); });
$("r-refresh").addEventListener("click", loadAll);
$("r-dl-trials").addEventListener("click", downloadTrials);
$("r-dl-sessions").addEventListener("click", downloadSessions);
$("r-dl-intake").addEventListener("click", downloadIntake);
waitForAuth().then(enter);
