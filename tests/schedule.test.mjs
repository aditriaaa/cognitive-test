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
const { CONFIG, sessionPlan, nextSession } = new Function(
  fs.readFileSync(path.join(root, "js/config.js"), "utf8") + "\nconst DEV = false;\n" +
  grab("sessionPlan") + grab("nextSession") + "\nreturn { CONFIG, sessionPlan, nextSession };")();
CONFIG.SCHEDULE.sessionsAvailable = 8; // as it will be once all sessions are open

const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const rec = (code, sessions) => ({ participant_id: code, sessions });
const done = (n, endedHoursAgo, dev = false) => ({ session_number: n, complete: true, dev, end: hoursAgo(endedHoursAgo) });

// Plan and counterbalancing (placeholder rules from CONFIG.SCHEDULE).
const odd = sessionPlan("P001"), even = sessionPlan("P002");
check("plan: familiarization, 5 baselines, 2 test sessions", odd.length === 8 && odd[0] === "familiarization" &&
  odd.slice(1, 6).every((t) => t === "baseline"), odd.join(" > "));
check("odd code: rest before fatigue", odd[6] === "test-rest" && odd[7] === "test-fatigue");
check("even code: fatigue before rest", even[6] === "test-fatigue" && even[7] === "test-rest");

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
n = nextSession(rec("P001", [1, 2, 3, 4, 5, 6, 7, 8].map((k) => done(k, 100))));
check("after 8 complete sessions: finished", n.finished === true);
finish();
