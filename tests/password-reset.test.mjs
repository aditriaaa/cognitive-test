// password-reset.test.mjs — "Forgot password?" against the Firebase EMULATOR.
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:reset
//       (needs Java for the emulator)
//
// The emulator doesn't send real emails; it keeps the reset links, which this
// test reads to finish the reset like a participant clicking the email link.
import { BASE, IPAD, check, finish, launch } from "./helpers.mjs";

const EMU = "http://127.0.0.1";
const PROJECT = "demo-cognitivebattery";
const browser = await launch();
const page = await (await browser.newContext({ ...IPAD })).newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`${BASE}/index.html?emulator=1`);
await page.waitForSelector("#screen-home:not([hidden])");

// A participant account, then log out.
const made = await page.evaluate(() => createAccount({ email: "forgetful@test.dev", password: "oldpassword1",
  first_name: "T", last_name: "U", intake: { age: "15" }, dev: DEV }));
await page.evaluate(() => logout());
check("test account created", made.ok, made.participant_id);

const resetCodes = async () => (await (await fetch(`${EMU}:9099/emulator/v1/projects/${PROJECT}/oobCodes`)).json())
  .oobCodes.filter((c) => c.requestType === "PASSWORD_RESET");

// Login screen -> "Forgot password?"
await page.evaluate(() => show("login"));
await page.click("#login-form >> text=Forgot password?");
check("'Forgot password?' opens the reset screen", await page.locator("#screen-reset").isVisible());

const f = "#reset-form";
await page.fill(`${f} [name=email]`, "not-an-email");
await page.click(`${f} [type=submit]`);
check("a mistyped email is refused", (await page.locator(`${f} .errors`).innerText()).includes("valid email"));

await page.fill(`${f} [name=email]`, "forgetful@test.dev");
await page.click(`${f} [type=submit]`);
await page.waitForSelector("#reset-sent:not([hidden])");
const message = await page.locator("#reset-sent").innerText();
check("confirmation shown", message.startsWith("If there is an account for this email"));
const codes = await resetCodes();
check("Firebase created a reset link for that email", codes.some((c) => c.email === "forgetful@test.dev"));

await page.fill(`${f} [name=email]`, "nobody-here@test.dev");
await page.click(`${f} [type=submit]`);
await page.waitForTimeout(1500);
check("unknown email: the SAME message (doesn't reveal who has an account)",
  (await page.locator("#reset-sent").innerText()) === message);
check("  ...and no reset link for it", !(await resetCodes()).some((c) => c.email === "nobody-here@test.dev"));

// Use the link (as if clicked in the email) to set a new password.
const code = codes.find((c) => c.email === "forgetful@test.dev").oobCode;
const reset = await fetch(`${EMU}:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=x`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ oobCode: code, newPassword: "newpassword2" }) });
check("reset link sets a new password", reset.ok);

// Old password refused, new one works.
await page.click(`${f} >> text=Back to login`);
await page.fill("#login-form [name=email]", "forgetful@test.dev");
await page.fill("#login-form [name=password]", "oldpassword1");
await page.click("#login-form [type=submit]");
await page.waitForTimeout(1500);
check("old password no longer works", (await page.locator("#login-form .errors").innerText()).includes("incorrect"));
await page.fill("#login-form [name=password]", "newpassword2");
await page.click("#login-form [type=submit]");
await page.waitForSelector("#screen-dashboard:not([hidden])", { timeout: 15000 }).catch(() => {});
check("new password logs in to the participant home", await page.locator("#screen-dashboard").isVisible());

await browser.close();
finish();
