// tload-calibration.test.mjs — the TloadDback calibration rule and pace choice.
//
// Run:  npm run test:calibration   (no server or emulator needed)
//
// Feeds made-up block results into the real calibrationState() and
// chooseTloadStd() from js/tload.js and checks the pace they arrive at.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { check, finish } from "./helpers.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { CONFIG, calibrationState, chooseTloadStd } = new Function(
  fs.readFileSync(path.join(root, "js/config.js"), "utf8") + "\nconst DEV = false;\n" +
  fs.readFileSync(path.join(root, "js/tload.js"), "utf8") + "\nreturn { CONFIG, calibrationState, chooseTloadStd };")();

// Simulate a person: passes a block whenever passes(std, blockNumber) is true.
function run(passes) {
  const s = calibrationState();
  while (!s.done) s.after(passes(s.std, s.blocks.length + 1) ? 0.9 : 0.7);
  return s;
}
const speeds = (s) => s.blocks.map((b) => `${b.std}${b.pass ? "+" : "-"}`).join(" ");

let s = run((std) => std >= 900);
check("can keep up down to 900 ms: result 900, calibrated", s.result === 900 && s.calibrated, speeds(s));
check("  ...speeds up 1400 -> 900, fails 800, then passes 900 twice more (3 passes there)", s.blocks.length === 9 &&
  s.blocks.filter((b) => b.std === 900 && b.pass).length === 3);

s = run(() => false);
check("never reaches 85%: result 1500, NOT calibrated (not excluded)", s.result === 1500 && !s.calibrated, speeds(s));

s = run((std) => std >= 1500);
check("fails 1400 but passes 1500: result 1500, calibrated", s.result === 1500 && s.calibrated, speeds(s));

s = run(() => true);
check("passes everything: stops at the fastest pace, 400 ms", s.result === 400 && s.calibrated && Math.min(...s.blocks.map((b) => b.std)) === 400, speeds(s));

s = run((std, n) => std >= 900 && n !== 8);   // a slip while confirming 900
check("a failure while confirming 900 -> confirms 1000 instead", s.result === 1000 && s.calibrated, speeds(s));

let worst = 0;
for (let seed = 1; seed <= 500; seed++) {      // noisy people: random passes
  let x = seed;
  const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const r = run((std) => rand() < (std - 300) / 1000);
  worst = Math.max(worst, r.blocks.length);
  if (r.result < 400 || r.result > 1500 || r.blocks.length > CONFIG.TLOAD.maxCalibrationBlocks) { worst = Infinity; break; }
}
check("500 noisy simulated people: always ends, result 400-1500 ms, at most 16 blocks", worst <= 16, `longest ${worst} blocks`);

// Choosing the pace for the T-fatigue session from the two calibrations.
let c = chooseTloadStd([{ std_final: 900, calibrated: true }, { std_final: 800, calibrated: true }]);
check("two good calibrations: the faster one (800)", c.std === 800 && c.source === "calibrated");
c = chooseTloadStd([{ std_final: 900, calibrated: true }, { std_final: 1500, calibrated: false }]);
check("one good, one failed: the good one (900)", c.std === 900 && c.source === "calibrated");
c = chooseTloadStd([{ std_final: 1500, calibrated: false }]);
check("only failed calibrations: 1500, flagged not-calibrated", c.std === 1500 && c.source === "not-calibrated");
c = chooseTloadStd([]);
check("no calibration found: 1500, flagged", c.std === 1500 && c.source === "no-calibration-found");
finish();
