/*
 * dev-tools.js — tools for DEVELOPING and TESTING the app. Real participants
 * never see any of this (everything here runs only in dev or quick mode).
 *
 *   Quick test mode (?quick=1, this computer only): start a session straight
 *     away as QUICKTEST, without logging in; nothing is uploaded.
 *     Options: &type=baseline|test-rest|test-fatigue, &form=B,
 *     &calibrate=1|2 (TloadDback calibration at the end), &std=900 (T-fatigue pace).
 *   Broken test account (dev mode): if a login's records were deleted by hand,
 *     say which record is missing and offer to delete the login, so the email
 *     can sign up again.
 *
 * Uses DEV, PARAMS, show(), startSession(), showErrors() from main.js.
 */

// QUICK TEST MODE: run a session straight away as QUICKTEST.
function startQuickSession() {
  const types = ["familiarization", "baseline", "test-rest", "test-fatigue"];
  const type = types.includes(PARAMS.get("type")) ? PARAMS.get("type") : "familiarization";
  const form = PARAMS.get("form") === "B" ? "B" : "A";
  const calibration = ["1", "2"].includes(PARAMS.get("calibrate")) ? Number(PARAMS.get("calibrate")) : null;
  const std = Number(PARAMS.get("std")) || CONFIG.TLOAD.maxStdMs;
  startSession({ participant_id: "QUICKTEST" },
    { number: 0, type, form, calibration, tload: { std, source: "quick-test" } });
}

// DEV MODE: under the "records couldn't be found" message, say which records
// exist and offer to delete the login. Such a login can never be repaired,
// because the rules allow only one identity per login, ever. Leftover
// identities/participants docs must still be deleted in the Firebase console.
async function showDevAccountTools(status) {
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

// Says which of this login's records exist, to explain a broken account.
async function diagnoseAccount() {
  const user = fbAuth.currentUser;
  const lines = [`Logged in as ${user.email}.`];
  try {
    const identity = await fbDb.doc(`identities/${user.uid}`).get();
    if (!identity.exists) return [...lines, `Identity record: MISSING (identities/${user.uid}).`].join(" ");
    const code = identity.data().participant_id;
    lines.push(`Identity record: found, points to participant ${code}.`);
    try {
      await fbDb.doc(`participants/${code}`).get();
      lines.push(`Participant record ${code}: found.`);
    } catch (err) {
      // The rules refuse to read a participant record that doesn't exist (or isn't yours).
      lines.push(`Participant record ${code}: MISSING or belongs to another login (${err.code}).`);
      return lines.join(" ");
    }
    try {
      const snap = await loadSessionRecord(code);
      lines.push(`Session list: readable (${snap.sessions.length} sessions).`);
    } catch (err) {
      lines.push(`Session list: REFUSED (${err.code}). Check that the rules published in the ` +
                 `Firebase console match firestore.rules (they must include "match /sessions/{sid}").`);
    }
  } catch (err) {
    lines.push(`Couldn't check (${err.code || err.message}).`);
  }
  return lines.join(" ");
}
