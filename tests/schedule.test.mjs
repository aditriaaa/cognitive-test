// schedule.test.mjs — the session schedule and 24-hour lock, with dev mode OFF.
//
// Run:  npm run test:schedule   (no server or emulator needed)
//
// Takes the real sessionPlan() and nextSession() functions out of js/main.js
// and runs them on made-up session histories.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { check, finish } from "./helpers.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
const grab = (name) => {
  const start = main.indexOf(`function ${name}(`);
  return main.slice(start, main.indexOf("\n}\n", start) + 2);
};
const { CONFIG, TEST_ORDER, sessionPlan, nextSession } = new Function(
  fs.readFileSync(path.join(root, "js/config.js"), "utf8") + fs.readFileSync(path.join(root, "js/forms.js"), "utf8") +
  "\nconst DEV = false;\n" + grab("sessionPlan") + grab("nextSession") + grab("calibrationFor") +
  "\nreturn { CONFIG, TEST_ORDER, sessionPlan, nextSession };")();
CONFIG.SCHEDULE.sessionsAvailable = 8; // as it will be once all sessions are open

const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const rec = (code, sessions) => ({ participant_id: code, sessions });
const done = (n, endedHoursAgo, dev = false) => ({ session_number: n, complete: true, dev, end: hoursAgo(endedHoursAgo) });

// Plan and counterbalancing (random blocks of 4 from TEST_ORDER in js/forms.js).
const plan1 = sessionPlan("P001");
check("plan: familiarization, 5 baselines, 2 test sessions", plan1.length === 8 && plan1[0] === "familiarization" &&
  plan1.slice(1, 6).every((t) => t === "baseline"), plan1.join(" > "));
const firstTest = (code) => sessionPlan(code)[6] === "test-rest" ? "R" : "F";
const codes = Array.from({ length: 400 }, (_, i) => "P" + String(i + 1).padStart(3, "0"));
check("each P code's test order follows TEST_ORDER", codes.every((c, i) => firstTest(c) === TEST_ORDER.P[i]));
check("every block of 4 participants: 2 rest-first + 2 fatigue-first", codes.every((c, i) =>
  i % 4 || codes.slice(i, i + 4).filter((x) => firstTest(x) === "R").length === 2));
check("both test sessions in every plan", codes.every((c) => sessionPlan(c).slice(6).sort().join() === "test-fatigue,test-rest"));
check("dev (D) codes use their own list", ["D001", "D002", "D003", "D004"].map(firstTest).join("") === TEST_ORDER.D.slice(0, 4));

// The 24-hour lock.
let n = nextSession(rec("P001", []));
check("new participant: session 1 open now", n.number === 1 && !n.availableAt && n.type === "familiarization" && n.form === "A");
n = nextSession(rec("P001", [done(1, 3)]));
check("3 h after session 1: session 2 locked", n.number === 2 && n.availableAt instanceof Date);
check("  ...and it opens 24 h after session 1 ended", Math.abs(n.availableAt - (Date.now() + 21 * 3600e3)) < 5000);
n = nextSession(rec("P001", [done(1, 25)]));
check("25 h after session 1: session 2 open, form B", n.number === 2 && !n.availableAt && n.form === "B");
n = nextSession(rec("P001", [done(1, 30), { session_number: 2, complete: false, dev: false, end: null }]));
check("a quit attempt does not count and does not lock", n.number === 2 && !n.availableAt);
n = nextSession(rec("P001", [done(1, 3, true)]));
check("a dev session does not move a real schedule", n.number === 1 && !n.availableAt);
// TloadDback calibration at the end of baselines 4 and 5 (sessions 5 and 6) only.
const cal = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => nextSession(rec("P001", Array.from({ length: k - 1 }, (_, i) => done(i + 1, 100)))).calibration);
check("calibration 1 in session 5 (B4), calibration 2 in session 6 (B5), none elsewhere",
  JSON.stringify(cal) === JSON.stringify([null, null, null, null, 1, 2, null, null]), JSON.stringify(cal));
n = nextSession(rec("P001", [1, 2, 3, 4, 5, 6, 7, 8].map((k) => done(k, 100))));
check("after 8 complete sessions: finished", n.finished === true);
finish();
