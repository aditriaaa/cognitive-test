// consent.test.mjs — the consent form, against the Firebase EMULATOR.
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:consent
//       (needs Java for the emulator)
//
// One form for everyone (no age question, nobody excluded): the participant
// signs (tick + typed name, required); a parent/guardian section is optional
// but must be completed if started. Checks the screens, what ends up in the
// database (names only in the identity record), the rules, and the sign-up lock.
import { BASE, IPAD, check, finish, launch } from "./helpers.mjs";

const browser = await launch();
async function page(url) {
  const context = await browser.newContext({ ...IPAD });
  // Only this computer may be contacted: the real Firebase project can't be reached.
  await context.route((u) => !["localhost", "127.0.0.1"].includes(u.hostname), (r) => r.abort());
  const p = await context.newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto(`${BASE}/${url}`);
  await p.waitForSelector("#screen-home:not([hidden])");
  return p;
}
const text = (p, sel) => p.locator(sel).innerText();

// Fills the consent form. guardian: { tick, name } or null (left empty).
async function sign(p, { tick = true, name = "", guardian = null } = {}) {
  const f = "#consent-form";
  await p.setChecked(`${f} [name=agree]`, tick);
  await p.fill(`${f} [name=name]`, name);
  await p.setChecked(`${f} [name=guardian_agree]`, Boolean(guardian && guardian.tick));
  await p.fill(`${f} [name=guardian_name]`, (guardian && guardian.name) || "");
  await p.click(`${f} [type=submit]`);
  await p.waitForTimeout(300);
}
async function fillAccount(p, email, age) {
  const f = "#signup-form";
  await p.fill(`${f} [name=email]`, email);
  await p.fill(`${f} [name=password]`, "password123");
  await p.fill(`${f} [name=confirm_password]`, "password123");
  await p.fill(`${f} [name=first_name]`, "Testfirst");
  await p.fill(`${f} [name=last_name]`, "Testlast");
  await p.fill(`${f} [name=age]`, String(age));
  await p.fill(`${f} [name=video_game_hours_week]`, "2");
  await p.fill(`${f} [name=typical_sleep_hours]`, "8");
  for (const n of ["handedness", "prior_cognitive_tests", "needs_glasses", "colour_blind"]) await p.selectOption(`${f} [name=${n}]`, { index: 1 });
  await p.click(`${f} [type=submit]`);
  await p.waitForSelector("#screen-dashboard:not([hidden])", { timeout: 15000 });
}
const records = (p) => p.evaluate(async () => {
  const identity = (await fbDb.doc("identities/" + fbAuth.currentUser.uid).get()).data();
  const research = (await fbDb.doc("participants/" + identity.participant_id).get()).data();
  return { identity, research };
});
const errors = (p) => text(p, "#consent-form .errors");

// ---- Real (non-dev) visitors: closed until approval ----
const real = await page("index.html?emulator=0");
await real.click("text=Create account");
check("real visitors: told the study isn't open, no form", (await text(real, "#consent-step")).includes("isn't open") &&
  !(await real.locator("#consent-form").count()));

// ---- One form for everyone ----
const a = await page("index.html?emulator=1");
await a.click("text=Create account");
check("consent form comes first, with NO age question", await a.locator("#consent-form").isVisible() &&
  !(await a.locator("text=How old are you").count()));
check("no DRAFT banner (wording approved)", !(await a.locator("#consent-draft").isVisible()));
const formText = await text(a, ".consent-text");
check("form covers: sessions, fatigue task, risks, no diagnosis, data storage, withdrawal",
  ["8 sessions", "16-minute", "Risks", "diagnosis", "Firebase", "stop at any time", "deleted within one year"].every((w) => formText.includes(w)));
check("no [bracket] placeholders left in the form", !/\[[^\]]+\]/.test(formText));
check("form has the parent/guardian section", (await text(a, ".consent-guardian")).includes("If you are under 18"));

await sign(a, { tick: false, name: "Ada Person" });
check("participant must tick 'I agree'", (await errors(a)).includes("Tick the box"));
await sign(a, { tick: true, name: "" });
check("participant must type their name", (await errors(a)).includes("full name"));
await sign(a, { name: "Ada Person", guardian: { tick: false, name: "Pat Parent" } });
check("guardian part started (name only): asked to complete it", (await errors(a)).includes("Parent or guardian"));
await sign(a, { name: "Ada Person", guardian: { tick: true, name: "" } });
check("guardian part started (tick only): asked to complete it", (await errors(a)).includes("Parent or guardian"));

// Signs WITHOUT a guardian: allowed (nobody is stopped), any age.
await sign(a, { name: "Ada Person" });
check("signed without a guardian -> account form", await a.locator("#screen-signup").isVisible() &&
  (await text(a, "#consent-summary")).includes("Ada Person"));
await fillAccount(a, "noguardian@test.dev", 15);
let r = await records(a);
check("account made with no guardian, even at age 15 (no one excluded)", r.research.consent.guardian_permission === false);
check("research record: version, time, guardian yes/no, and NO names",
  r.research.consent.version === "2026-11-24.2" && r.research.consent.approved === true && r.research.consent.signed_at && !JSON.stringify(r.research).includes("Ada Person"));
check("identity record: the participant's signature", r.identity.consent.participant_name === "Ada Person" && !("guardian_name" in r.identity.consent));

// Signs WITH a guardian.
const m = await page("index.html?emulator=1");
await m.click("text=Create account");
await sign(m, { name: "Sam Student", guardian: { tick: true, name: "Pat Parent" } });
check("summary shows both signatures", (await text(m, "#consent-summary")).includes("Pat Parent"));
await fillAccount(m, "withguardian@test.dev", 14);
r = await records(m);
check("with guardian: research record says guardian_permission = true, no names",
  r.research.consent.guardian_permission === true && !/Pat Parent|Sam Student/.test(JSON.stringify(r.research)));
check("with guardian: identity has both names", r.identity.consent.participant_name === "Sam Student" && r.identity.consent.guardian_name === "Pat Parent");

// ---- The rules ----
// Writes the same records as createAccount(), but straight to the database, so
// each attack can change ONE thing (o.break) and be judged by the RULES alone.
// Returns "ok" or the error code ("permission-denied" = refused by the rules).
const x = await page("index.html?emulator=1");
let nth = 0;
const rawSignup = (o) => x.evaluate(async (o) => {
  const { user } = await fbAuth.createUserWithEmailAndPassword(o.email, "password123");
  const consent = { version: o.version, approved: true, signed_at: "now" };
  const identity = { email: o.email, first_name: "T", last_name: "U", created_at: "now",
    consent: { ...consent, participant_name: "Some Person", guardian_name: "Pat Parent" } };
  const research = { owner_uid: user.uid, dev: o.dev, created_at: "now", intake: { age: "20" },
    consent: { ...consent, guardian_permission: true } };
  const breaks = {
    "no consent in the research record": () => delete research.consent,
    "no consent in the identity record": () => delete identity.consent,
    "no signature name in the identity record": () => delete identity.consent.participant_name,
    "signer's name in the research consent": () => { research.consent.participant_name = "Some Person"; },
    "name in the research record": () => { research.first_name = "T"; },
    "email in the research record": () => { research.email = o.email; },
    "guardian yes/no doesn't match the signature": () => { research.consent.guardian_permission = false; },
    "different form versions in the two records": () => { identity.consent.version = "other"; },
    "consent not marked approved": () => { research.consent.approved = false; }
  };
  if (o.break) breaks[o.break]();
  const counter = fbDb.doc("counters/" + (o.dev ? "dev" : "participants"));
  const now = await counter.get();
  const number = (now.exists ? now.data().last : 0) + 1;
  const code = (o.dev ? "D" : "P") + String(number).padStart(3, "0");
  const batch = fbDb.batch();
  batch.set(counter, { last: number });
  batch.set(fbDb.doc("participants/" + code), { ...research, participant_id: code, number });
  batch.set(fbDb.doc("identities/" + user.uid), { ...identity, participant_id: code });
  try { await batch.commit(); return "ok"; } catch (e) { return e.code; }
}, { email: `raw${++nth}@test.dev`, dev: true, version: "2026-11-24.2", ...o });
// What the researcher does by hand in the console (emulator admin rights). null = delete the record.
const setLock = async (lock) => {
  const r = await fetch("http://127.0.0.1:8080/v1/projects/demo-cognitivebattery/databases/(default)/documents/settings/enrollment", {
    method: lock ? "PATCH" : "DELETE", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: lock ? JSON.stringify({ fields: { open: { booleanValue: lock.open }, consent_version: { stringValue: lock.version } } }) : undefined });
  if (!r.ok) throw new Error("setLock failed: " + r.status);
};
const refused = async (name, o) => { const res = await rawSignup(o); check(`refused: ${name}`, res === "permission-denied", res); };

check("allowed: a correct test account (so the refusals below mean something)", (await rawSignup({})) === "ok");
for (const b of ["no consent in the research record", "no consent in the identity record", "no signature name in the identity record",
  "signer's name in the research consent", "name in the research record", "email in the research record",
  "guardian yes/no doesn't match the signature", "different form versions in the two records"]) await refused(b, { break: b });

// Sign-up lock: real accounts only.
const APPROVED = "2026-11-24.2";
await setLock(null);
await refused("real account, no lock record at all", { dev: false });
check("allowed: test account, no lock record", (await rawSignup({})) === "ok");
await setLock({ open: false, version: APPROVED });
await refused("real account, sign-ups closed", { dev: false });
await setLock({ open: true, version: APPROVED });
await refused("real account, open, but a different consent version", { dev: false, version: "DRAFT-2026-11-24.2" });
await refused("real account, open, but consent not marked approved", { dev: false, break: "consent not marked approved" });
check("allowed: real account, open, approved version", (await rawSignup({ dev: false })) === "ok");

// Closing again doesn't lock out people who already joined (x is still that real account).
await setLock({ open: false, version: APPROVED });
const startSessionDoc = await x.evaluate(async () => {
  try {
    await fbDb.doc("participants/P001/sessions/test1").set({ participant_id: "P001", session_number: 1, session_type: "familiarization",
      form: "A", version: "x", dev: false, start: "now", end: null, complete: false, n_trials: null });
    return "ok";
  } catch (e) { return e.code; }
});
check("allowed: an existing real account still works after closing", startSessionDoc === "ok", startSessionDoc);
for (const [name, how] of [["read", "get"], ["open", "set"], ["delete", "delete"]]) {
  const res = await x.evaluate(async (how) => {
    const ref = fbDb.doc("settings/enrollment");
    try { await (how === "set" ? ref.set({ open: true, consent_version: "2026-11-24.2" }) : ref[how]()); return "ok"; } catch (e) { return e.code; }
  }, how);
  check(`refused: a participant tries to ${name} the lock`, res === "permission-denied", res);
}
await refused("real account, still closed after that", { dev: false });
// And through the app's own sign-up function: refused, and no half-made login is left behind.
const app = (email) => x.evaluate((email) => createAccount({ email, password: "password123", first_name: "T", last_name: "U",
  intake: { age: "20" }, dev: false, consent: { version: "2026-11-24.2", approved: true, signed_at: "now", participant_name: "Some Person" } }), email);
let res = await app("lockedout@test.dev");
check("app sign-up while closed: clear message", !res.ok && res.error.includes("contact the researcher"), res.error);
await setLock({ open: true, version: APPROVED });
res = await app("lockedout@test.dev");
check("same email can sign up once open (no leftover login), gets P002", res.ok && res.participant_id === "P002", JSON.stringify(res));

await browser.close();
finish();
