/*
 * storage.js — where things are kept.
 *
 * ONLINE (Firebase, see js/firebase-setup.js and firestore.rules):
 *   Login            email + password, handled entirely by Firebase Authentication.
 *   identities/{uid}     IDENTITY: email, first/last name, participant code.
 *                        The ONLY place a name or email is stored.
 *   participants/{code}  RESEARCH: code-only record with intake answers + dev flag.
 *   counters/...         hands out the next code: P001, P002, ... (dev: D001, ...)
 *
 *   participants/{code}/sessions/...   session attempts + trial-level data (see below)
 *
 * IN THIS BROWSER (localStorage), as a backup copy only:
 *   "cogbat_data_<session_id>.csv"   trial-level data for one session (CSV text)
 *   Uses the participant CODE only, never name or email (CLAUDE.md rule 5).
 */

// ---------------------------------------------------------------------------
// Accounts (Firebase)
// ---------------------------------------------------------------------------

// Plain-language messages for Firebase's error codes.
function friendlyAuthError(err) {
  switch (err && err.code) {
    case "auth/email-already-in-use": return "An account with this email already exists. Try logging in.";
    case "auth/invalid-email": return "Enter a valid email address.";
    case "auth/weak-password": return "Choose a longer password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      // Same message either way, so the page doesn't reveal which emails have accounts.
      return "Email or password is incorrect.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed": return "Couldn't reach the server. Check your internet connection and try again.";
    default:
      console.error(err);
      return "Something went wrong. Please try again.";
  }
}

const pad3 = (n) => String(n).padStart(3, "0");

// Creates the login, then (in ONE all-or-nothing database transaction) takes
// the next participant code and writes the identity and research records.
// Returns { ok: true, participant_id } or { ok: false, error }.
async function createAccount({ email, password, first_name, last_name, intake, dev }) {
  let cred;
  try {
    cred = await fbAuth.createUserWithEmailAndPassword(email.trim(), password);
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
  const uid = cred.user.uid;
  const now = new Date().toISOString();

  try {
    const participant_id = await fbDb.runTransaction(async (tx) => {
      // Real participants get P001, P002, ...; dev/test accounts get D001, ...
      // so testing never uses up real participant numbers.
      const counterRef = fbDb.doc(`counters/${dev ? "dev" : "participants"}`);
      const counter = await tx.get(counterRef);
      const number = (counter.exists ? counter.data().last : 0) + 1;
      const code = (dev ? "D" : "P") + pad3(number);

      tx.set(counterRef, { last: number });
      // Research record: code only. Intake is stamped with version + dev flag.
      tx.set(fbDb.doc(`participants/${code}`), {
        participant_id: code, number, owner_uid: uid, dev, created_at: now,
        intake: { ...intake, submitted_at: now, version: CONFIG.VERSION, dev }
      });
      // Identity record: the only place the name and email live.
      tx.set(fbDb.doc(`identities/${uid}`), {
        email: cred.user.email, first_name, last_name, participant_id: code, created_at: now
      });
      return code;
    });
    return { ok: true, participant_id };
  } catch (err) {
    // The login was made but the records weren't. Remove the login so the
    // person can simply try again, instead of being stuck with a half account.
    console.error(err);
    try { await cred.user.delete(); } catch (e) { /* ignore */ }
    if (err.code !== "permission-denied") {
      return { ok: false, error: "Your account couldn't be set up. Check your internet connection and try again." };
    }
    // Refused by the rules. In practice: the code counter doesn't match the
    // participant records (e.g. after deleting test data by hand), so the
    // "next" code already exists.
    return { ok: false, error: dev
      ? "Dev mode: sign-up refused. counters/dev doesn't match the D### participant records " +
        "(the next code already exists). Fix it in the Firebase console, then try again."
      : "Your account couldn't be set up. Please contact the researcher." };
  }
}

async function login(email, password) {
  try {
    await fbAuth.signInWithEmailAndPassword(email.trim(), password);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

function logout() { return fbAuth.signOut(); }

// Firebase restores a login asynchronously on page load; wait for it once.
function waitForAuth() {
  return new Promise((resolve) => {
    const stop = fbAuth.onAuthStateChanged((user) => { stop(); resolve(user); });
  });
}

// The logged-in person's identity record, or null if nobody is logged in.
// { email, first_name, last_name, participant_id }
async function getCurrentAccount() {
  const user = fbAuth.currentUser || await waitForAuth();
  if (!user) return null;
  const snap = await fbDb.doc(`identities/${user.uid}`).get();
  return snap.exists ? snap.data() : null;
}

// ---------------------------------------------------------------------------
// Session data (Firebase)
// ---------------------------------------------------------------------------
//
//   participants/{code}/sessions/{session_id}
//       one doc per session ATTEMPT: number, type, form, version, dev,
//       start, end, complete, n_trials. Created when the session starts, so an
//       interrupted attempt still shows up (complete: false).
//   participants/{code}/sessions/{session_id}/trials/{trial_index}
//       one doc per jsPsych trial = one row of the raw data (CLAUDE.md rule 4),
//       uploaded the moment the trial ends. If the tab is closed mid-session,
//       every finished trial is already saved.
//
// session_id is e.g. P017_S03_baseline_2026-10-09_154210 (see makeSessionId in main.js).
// Code only, never name or email.

const sessionsCol = (code) => fbDb.collection(`participants/${code}/sessions`);

// Firestore waits (forever) instead of failing when the device is offline.
// For steps where the participant is waiting on screen, give up after a while.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

// Writes can occasionally be refused once and then succeed when sent again
// (seen in testing). Firestore does not retry a refusal itself, so try up to
// 3 times. If an earlier try did land after all, `alreadyDone(snapshot)` says
// so and that counts as success. Each retry is logged, so it can be noticed.
async function writeWithRetry(ref, write, alreadyDone) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (err) {
      try { if (alreadyDone(await ref.get())) return; } catch (e) { /* can't check; treat as not done */ }
      if (attempt >= 3 || err.code !== "permission-denied") throw err;
      console.warn(`Write to ${ref.path} refused (attempt ${attempt}), retrying`, err);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}
const exists = (snap) => snap.exists;

// All session attempts for this participant, oldest first.
// Returns { participant_id, sessions: [...] } (the shape nextSession() expects).
async function loadSessionRecord(participant_id) {
  const snap = await sessionsCol(participant_id).orderBy("start").get();
  return { participant_id, sessions: snap.docs.map((d) => d.data()) };
}

// Creates the session doc before the first trial. Throws if it can't be saved.
function createSessionDoc(participant_id, session_id, entry) {
  const ref = sessionsCol(participant_id).doc(session_id);
  return withTimeout(writeWithRetry(ref, () => ref.set(entry), exists), 15000);
}

// Uploads one trial. Returns the upload's promise (resolves when the server has it).
// Firestore can't store nested arrays or undefined, so any object/array value is
// stored as JSON text, the same way it appears in jsPsych's CSV.
function uploadTrial(participant_id, session_id, trial) {
  const row = {};
  for (const [key, value] of Object.entries(trial)) {
    if (value === undefined) continue;
    row[key] = (value !== null && typeof value === "object") ? JSON.stringify(value) : value;
  }
  // Zero-padded so the docs sort in trial order: 0000, 0001, ...
  const trialId = String(trial.trial_index).padStart(4, "0");
  const ref = sessionsCol(participant_id).doc(session_id).collection("trials").doc(trialId);
  return writeWithRetry(ref, () => ref.set(row), exists);
}

// Marks the session complete. Call only after every trial upload has finished.
function completeSessionDoc(participant_id, session_id, end, n_trials) {
  const ref = sessionsCol(participant_id).doc(session_id);
  return writeWithRetry(ref, () => ref.update({ end, complete: true, n_trials }),
    (snap) => snap.exists && snap.data().complete === true);
}

// ---------------------------------------------------------------------------
// Local backup copy (this browser only)
// ---------------------------------------------------------------------------
// A second copy of each session's data in localStorage, in case an upload fails.

const DATA_PREFIX = "cogbat_data_";

// localStorage can be blocked or full (e.g. private browsing). This helper
// never throws: it returns true/false.
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn("Could not save", key, e); return false; }
}

// Stored under "cogbat_data_<session_id>.csv".
function saveSessionData(session_id, csv, complete) {
  return writeJson(`${DATA_PREFIX}${session_id}.csv`, { csv, complete, saved_at: new Date().toISOString() });
}
