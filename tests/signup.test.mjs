// signup.test.mjs — sign-up under bad conditions, against the Firebase EMULATOR.
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:signup
//       (needs Java for the emulator)
//
// Checks the two sign-up bugs found on 2026-11-24 stay fixed:
//  1. several people signing up at the same moment (they all want the same
//     next code; all must still get an account, each with its own code);
//  2. the page closed after the login is made but before the records are
//     saved (signing up again with the same email + password finishes it).
// Plus: the database unreachable, an existing account, the sign-up lock.
// Only this computer is contacted (the real Firebase project can't be reached).
import { BASE, IPAD, check, finish, launch } from "./helpers.mjs";

const EMU = "http://127.0.0.1";
const FS = 8080;   // Firestore emulator port (see firebase.json)
const browser = await launch();
const local = (u) => ["localhost", "127.0.0.1"].includes(u.hostname);
async function context() {
  const c = await browser.newContext({ ...IPAD });
  await c.route((u) => !local(u), (r) => r.abort());
  return c;
}
async function page(c) {
  const p = await (c || await context()).newPage();
  p.on("pageerror", (e) => console.log("   pageerror:", e.message));
  await p.goto(`${BASE}/index.html?emulator=1`);
  await p.waitForSelector("#screen-home:not([hidden])");
  return p;
}
// Through the screens: consent, then the account form.
async function toForm(p) {
  await p.click("text=Create account");
  await p.setChecked("#consent-form [name=agree]", true);
  await p.fill("#consent-form [name=name]", "Test Person");
  await p.click("#consent-form [type=submit]");
  await p.waitForSelector("#screen-signup:not([hidden])");
}
async function fill(p, email, password = "password123") {
  const f = "#signup-form";
  const v = { email, password, confirm_password: password, first_name: "Test", last_name: "Person", age: "16", video_game_hours_week: "2", typical_sleep_hours: "8" };
  for (const k in v) await p.fill(`${f} [name=${k}]`, v[k]);
  for (const n of ["handedness", "prior_cognitive_tests", "needs_glasses", "colour_blind"]) await p.selectOption(`${f} [name=${n}]`, { index: 1 });
}
// "dashboard", "error: <message>", or "nothing" if neither appears in time.
async function outcome(p, ms = 30000) {
  try {
    await p.waitForFunction(() => !document.getElementById("screen-dashboard").hidden ||
      document.querySelector("#signup-form .errors").innerText.trim(), null, { timeout: ms });
  } catch { return "nothing"; }
  return (await p.locator("#screen-dashboard").isVisible()) ? "dashboard" : "error: " + await p.locator("#signup-form .errors").innerText();
}
async function signUp(email, password) {
  const p = await page(); await toForm(p); await fill(p, email, password);
  await p.click("#signup-form [type=submit]");
  const r = await outcome(p); await p.context().close(); return r;
}
const direct = (p, o) => p.evaluate((o) => createAccount({ email: o.email, password: "password123", first_name: "A", last_name: "B",
  intake: { age: "16" }, dev: o.dev, consent: { version: CONFIG.CONSENT.version, approved: true, signed_at: "x", participant_name: "AB" } }), o);
const setLock = (open) => fetch(`${EMU}:${FS}/v1/projects/demo-cognitivebattery/databases/(default)/documents/settings/enrollment`, {
  method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { open: { booleanValue: open }, consent_version: { stringValue: "2026-11-24.2" } } }) });

// ---- 1. Many people at the same moment ----
for (const [n, dev] of [[3, true], [8, true], [5, false]]) {
  if (!dev) await setLock(true);
  const ps = await Promise.all(Array.from({ length: n }, () => page()));
  const rs = await Promise.all(ps.map((p, i) => direct(p, { email: `many-${dev ? "d" : "p"}${n}-${i}@test.dev`, dev })));
  const codes = rs.map((r) => r.participant_id || r.error);
  check(`${n} ${dev ? "test" : "REAL"} sign-ups at the same moment: all get their own code`,
    rs.every((r) => r.ok) && new Set(codes).size === n, codes.join(" "));
  await Promise.all(ps.map((p) => p.context().close()));
}

// ---- 2. Page closed after the login is made, before the records are saved ----
{
  const c = await context();
  let hold = true;   // database requests never answer while hold is true
  await c.route((u) => u.port === String(FS), (r) => (hold ? new Promise(() => {}) : r.continue()));
  const p = await page(c); await toForm(p); await fill(p, "cutoff@test.dev");
  const loginMade = p.waitForResponse((r) => r.url().includes("accounts:signUp"));
  await p.click("#signup-form [type=submit]"); await loginMade; await p.waitForTimeout(500);
  await c.close(); hold = false;
  check("cut off: a different password can't take over the login", (await signUp("cutoff@test.dev", "otherpass99")).includes("already exists"));
  const r = await signUp("cutoff@test.dev", "password123");
  check("cut off: signing up again (same email + password) finishes the account", r === "dashboard", r);
}

// ---- Existing complete account ----
check("existing account: sign-up again says it exists (right password)", (await signUp("cutoff@test.dev", "password123")).includes("already exists"));
check("existing account: sign-up again says it exists (wrong password)", (await signUp("cutoff@test.dev", "nope12345")).includes("already exists"));

// ---- Database unreachable ----
{
  const c = await context(); await c.route((u) => u.port === String(FS), (r) => r.abort());
  const p = await page(c); await toForm(p); await fill(p, "offline@test.dev");
  await p.click("#signup-form [type=submit]");
  const r = await outcome(p, 90000);
  check("database unreachable: an internet error", r.includes("internet connection"), r);
  await c.close();
  const again = await signUp("offline@test.dev", "password123");
  check("...and the same email works once it's back", again === "dashboard", again);
}

// ---- Sign-up lock closed: real accounts refused after the retries, test accounts fine ----
await setLock(false);
{
  const p = await page(); const t = Date.now();
  const r = await direct(p, { email: "locked@test.dev", dev: false });
  check("lock closed: real sign-up refused with a clear message", !r.ok && r.error.includes("contact the researcher"), `${r.error} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  check("lock closed: no login left behind (same email works for a test account)", (await direct(p, { email: "locked@test.dev", dev: true })).ok);
}

await browser.close();
finish();
