// e2e.test.mjs — the whole study, end to end, against the local Firebase EMULATOR
// (a fake Firebase on this computer; never the real project).
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:e2e
//       (needs Java for the emulator)
//
// 1. Two dev participants sign up (odd and even code).
// 2. Participant 1 does session 1, quits session 2 halfway, then logs in on a
//    "second device" and does sessions 2-8. The app must offer the right
//    session each time and say "finished" at the end.
// 3. A researcher downloads everything; every session's trials must match
//    what was uploaded, with all five tasks in every complete session.
// 4. Attempts to break the security rules must all be refused.
//
// For speed, this test opens all 8 sessions and shortens the dev task lengths
// inside its own browser only (js/config.js is not changed).
import fs from "fs";
import { BASE, IPAD, check, finish, launch, addParticipant, playSession, parseCsv } from "./helpers.mjs";

const EMU = "http://127.0.0.1";
const browser = await launch();

async function device() {
  const ctx = await browser.newContext({ ...IPAD });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await addParticipant(page);
  await page.goto(`${BASE}/index.html?emulator=1`);
  await page.waitForSelector("#screen-home:not([hidden])");
  await page.evaluate(() => {
    CONFIG.SCHEDULE.sessionsAvailable = 8;
    Object.assign(CONFIG.DEV, { pvtDurationSeconds: 3, breakSeconds: 1, nbackTrials: 6, flankerTrials: 8, dsstSeconds: 5, stroopTrials: 6,
                                tloadBlockItems: 8, tloadMainSeconds: 20, tloadChunkSeconds: 10 });
  });
  return { ctx, page };
}
const signUp = (page, email) => page.evaluate((email) => createAccount({ email, password: "password123",
  first_name: "Testfirst", last_name: "Testlast", intake: { age: "16", colour_blind: "No" }, dev: DEV }), email);
async function loginUi(page, email) {
  await page.evaluate(() => show("login"));
  await page.fill("#login-form [name=email]", email);
  await page.fill("#login-form [name=password]", "password123");
  await page.click("#login-form [type=submit]");
  await page.waitForSelector("#screen-dashboard:not([hidden])");
}
async function dashboardText(page) {
  await page.waitForFunction(() => !document.getElementById("dash-status").textContent.includes("Loading"));
  return page.locator("#dash-status").innerText();
}
async function startSession(page) {
  if (await page.locator("#screen-dashboard").isHidden()) await page.evaluate(() => show("dashboard"));
  await dashboardText(page);
  await page.click("#start-btn:visible");
  await page.waitForSelector("#jspsych-target:not([hidden])");
}

// ---------------- Participants ----------------
let dev1 = await device();
const p1 = await signUp(dev1.page, "p1@test.dev");
const p2 = await signUp((await device()).page, "p2@test.dev");
check("two dev accounts get D codes", p1.ok && p2.ok && /^D\d{3}$/.test(p1.participant_id), `${p1.participant_id}, ${p2.participant_id}`);
const code = p1.participant_id;
const plan = await dev1.page.evaluate((c) => sessionPlan(c), code);

await startSession(dev1.page);
check("session 1 saved", (await playSession(dev1.page)).includes("has been saved"));

// Session 2: quit partway through (close the tab).
await dev1.page.click("#done-btn:visible");
await startSession(dev1.page);
await playSession(dev1.page, { until: ".tc-area, #pvt-area" });   // through the questions, into the first task
await dev1.page.waitForTimeout(1500);
await dev1.ctx.close();

// Second device: session 2 is offered again (an unfinished attempt doesn't count).
const dev2 = await device();
await loginUi(dev2.page, "p1@test.dev");
check("second device: session 2 offered again after quitting", (await dashboardText(dev2.page)).includes("Your session is ready"));
for (let n = 2; n <= 8; n++) {
  await startSession(dev2.page);
  check(`session ${n} (${plan[n - 1]}) saved`, (await playSession(dev2.page)).includes("has been saved"));
  await dev2.page.click("#done-btn:visible");
}
check("after 8 sessions the app says finished", (await dashboardText(dev2.page)).includes("completed"));

const mine = await dev2.page.evaluate((c) => loadSessionRecord(c), code);
const complete = mine.sessions.filter((s) => s.complete);
check("9 attempts: 8 complete + 1 unfinished", mine.sessions.length === 9 && complete.length === 8);
check("complete sessions numbered 1-8, types follow the plan, forms alternate A/B", complete.every((s, i) =>
  s.session_number === i + 1 && s.session_type === plan[i] && s.form === (i % 2 ? "B" : "A")));
check("the unfinished attempt is session 2, kept as incomplete", mine.sessions.some((s) => !s.complete && s.session_number === 2 && s.end === null));

// ---------------- Researcher ----------------
const su = await (await fetch(`${EMU}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, { method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "researcher@test.dev", password: "password123", returnSecureToken: true }) })).json();
// Done by hand in the console in real life; here written with emulator admin rights.
await fetch(`${EMU}:8080/v1/projects/demo-cognitivebattery/databases/(default)/documents/researchers/${su.localId}`, { method: "PATCH",
  headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { note: { stringValue: "test" } } }) });
const r = await (await browser.newContext({ acceptDownloads: true })).newPage();
await r.goto(`${BASE}/researcher.html?emulator=1`);
await r.fill("#r-login-form [name=email]", "researcher@test.dev");
await r.fill("#r-login-form [name=password]", "password123");
await r.click("#r-login-form [type=submit]");
await r.waitForFunction(() => !document.getElementById("r-data").hidden && !document.getElementById("r-summary").textContent.startsWith("Loading"));
await r.selectOption("#r-which", "dev");
check("researcher sees the 9 attempts", (await r.locator("#r-rows tr").count()) === 9);
await r.click("#r-dl-trials");
await r.waitForSelector("#r-progress a");
const [dl] = await Promise.all([r.waitForEvent("download"), r.click("#r-progress a")]);
const trialsText = fs.readFileSync(await dl.path(), "utf8");
const trials = parseCsv(trialsText);
const [dl2] = await Promise.all([r.waitForEvent("download"), r.click("#r-dl-sessions")]);
const sessions = parseCsv(fs.readFileSync(await dl2.path(), "utf8"));
console.log(`      downloaded ${trials.length} trial rows, ${sessions.length} sessions`);

const bad = [];
for (const s of sessions.filter((x) => x.complete === "true")) {
  const rows = trials.filter((t) => t.session_id === s.session_id);
  const tasks = new Set(rows.map((t) => t.task));
  const why = [];
  if (rows.length !== Number(s.n_trials)) why.push(`rows ${rows.length} vs n_trials ${s.n_trials}`);
  const outOfOrder = rows.findIndex((t, i) => Number(t.trial_index) !== i);
  if (outOfOrder >= 0) why.push(`trial_index ${rows[outOfOrder].trial_index} at row ${outOfOrder}`);
  if (!rows.every((t) => t.session_number === s.session_number && t.form === s.form && t.dev === "true")) why.push("labels");
  const missing = ["pvt", "nback", "flanker", "dsst", "stroop"].filter((t) => !tasks.has(t));
  if (missing.length) why.push("missing " + missing.join("/"));
  if (why.length) bad.push(`${s.session_id.slice(9, 12)}: ${why.join(", ")}`);
}
check("every complete session: all trials present, in order, labels match, all 5 tasks", bad.length === 0, bad.join(" "));
const unfinished = trials.filter((t) => t.session_complete === "false");
check("unfinished session: the trials done before quitting are kept", unfinished.length > 0 && unfinished.every((t) => t.session_number === "2"), `${unfinished.length} rows`);
check("practice only in session 1", trials.some((t) => t.session_type === "familiarization" && t.phase === "practice") &&
  !trials.some((t) => t.session_type !== "familiarization" && t.phase === "practice"));
check("T-rest has the video step (placeholder until a video is chosen)",
  trials.some((t) => t.session_type === "test-rest" && t.task === "manipulation_placeholder"));
// TloadDback: calibrations at the end of baselines 4 and 5 (sessions 5 and 6), used by T-fatigue.
const results = trials.filter((t) => t.task === "tload_calibration_result");
check("calibration results saved in sessions 5 and 6 only", results.map((t) => t.session_number).join() === "5,6",
  results.map((t) => `S${t.session_number}: ${t.std_final} ms, calibrated=${t.calibrated}`).join("; "));
check("familiarization only before the first calibration (session 5)", trials.filter((t) => t.phase && t.phase.startsWith("familiarization-"))
  .every((t) => t.session_number === "5"));
const fatigue = trials.filter((t) => t.session_type === "test-fatigue" && t.task === "tload" && t.phase === "main");
const best = Math.min(...results.filter((t) => t.calibrated === "true").map((t) => Number(t.std_final)));
check("T-fatigue runs at the faster calibrated pace, read back from the database", fatigue.length > 0 &&
  fatigue.every((t) => Number(t.std_ms) === best && t.std_source === "calibrated"), `${fatigue[0] && fatigue[0].std_ms} ms (best ${best})`);
check("T-fatigue: fatigue task comes before the battery", (() => {
  const f = trials.filter((t) => t.session_type === "test-fatigue");
  return f.findIndex((t) => t.task === "tload") < f.findIndex((t) => t.task === "pvt");
})());
check("no names or emails anywhere in the trial data", !/Testfirst|Testlast|@test\.dev/.test(trialsText));
check("device info on every row", trials.every((t) => t.user_agent && t.screen_w && t.timezone));

// ---------------- Security rules: all must be refused ----------------
const p2page = (await device()).page;
await loginUi(p2page, "p2@test.dev");
const sessionId = await dev2.page.evaluate(async (c) =>
  (await fbDb.collection(`participants/${c}/sessions`).where("session_number", "==", 1).get()).docs[0].id, code);
async function refused(page, name, fn, arg) {
  const res = await page.evaluate(async ([src, arg]) => {
    try { await eval(src)(arg); return "ALLOWED"; } catch (e) { return e.code || e.message; }
  }, [fn.toString(), arg]);
  check(`refused: ${name}`, res === "permission-denied", res);
}
const a = { code, sid: sessionId, other: p2.participant_id };
await refused(dev2.page, "editing an uploaded trial", ({ code, sid }) => fbDb.doc(`participants/${code}/sessions/${sid}/trials/0000`).update({ rt: 1 }), a);
await refused(dev2.page, "deleting an uploaded trial", ({ code, sid }) => fbDb.doc(`participants/${code}/sessions/${sid}/trials/0000`).delete(), a);
await refused(dev2.page, "adding a trial to a finished session", ({ code, sid }) =>
  fbDb.doc(`participants/${code}/sessions/${sid}/trials/9999`).set({ participant_id: code, session_number: 1, dev: true, trial_index: 9999 }), a);
await refused(dev2.page, "re-opening a finished session", ({ code, sid }) => fbDb.doc(`participants/${code}/sessions/${sid}`).update({ complete: false }), a);
await refused(dev2.page, "deleting a session", ({ code, sid }) => fbDb.doc(`participants/${code}/sessions/${sid}`).delete(), a);
await refused(p2page, "another participant reading the sessions", ({ code }) => fbDb.collection(`participants/${code}/sessions`).get(), a);
await refused(p2page, "another participant reading the trials", ({ code, sid }) => fbDb.collection(`participants/${code}/sessions/${sid}/trials`).get(), a);
await refused(p2page, "another participant reading the name record", ({ code }) => fbDb.collection("identities").get(), a);
await refused(p2page, "creating a session under someone else's code", ({ code }) => fbDb.doc(`participants/${code}/sessions/fake`).set({
  participant_id: code, session_number: 1, session_type: "baseline", form: "A", version: "x", dev: true, start: "x", end: null, complete: false, n_trials: null }), a);
await refused(p2page, "a test (D) account making a non-dev session", ({ other }) => fbDb.doc(`participants/${other}/sessions/x`).set({
  participant_id: other, session_number: 1, session_type: "baseline", form: "A", version: "x", dev: false, start: "x", end: null, complete: false, n_trials: null }), a);

await browser.close();
finish();
