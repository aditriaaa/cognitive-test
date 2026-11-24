// consent.test.mjs — the consent form, against the Firebase EMULATOR.
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:consent
//       (needs Java for the emulator)
//
// One form for everyone (no age question, nobody excluded): the participant
// signs (tick + typed name, required); a parent/guardian section is optional
// but must be completed if started. Checks the screens, what ends up in the
// database (names only in the identity record), and the rules.
import { BASE, IPAD, check, finish, launch } from "./helpers.mjs";

const browser = await launch();
async function page(url) {
  const p = await (await browser.newContext({ ...IPAD })).newPage();
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
check("DRAFT banner shown while the wording isn't approved", (await text(a, "#consent-draft")).includes("DRAFT"));
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
  r.research.consent.version.startsWith("DRAFT-") && r.research.consent.signed_at && !JSON.stringify(r.research).includes("Ada Person"));
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

// ---- The rules refuse ----
const x = await page("index.html?emulator=1");
const attempt = (o) => x.evaluate((o) => createAccount({ email: o.email, password: "password123",
  first_name: "T", last_name: "U", intake: { age: "20" }, dev: o.dev, consent: o.consent }), o);
const draft = { version: "x", approved: false, signed_at: "now", participant_name: "Someone" };
let res = await attempt({ email: "real-draft@test.dev", dev: false, consent: draft });
check("refused: a REAL account with unapproved (draft) consent", !res.ok);
res = await attempt({ email: "noconsent@test.dev", dev: true, consent: {} });
check("refused: an account without a signed consent", !res.ok);
await browser.close();
finish();
