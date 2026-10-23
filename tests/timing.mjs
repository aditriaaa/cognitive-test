// timing.mjs — how long the REAL-LENGTH battery takes (not dev mode).
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run timing
//       (takes about 20 minutes: it plays a familiarization battery and a
//        baseline battery side by side, in real time)
//
// A simulated participant answers with human-like reaction times. Instruction
// screens are clicked straight away, so add reading time on top (about
// 15-30 s per instruction screen for a real person).
// This is a measurement, not a pass/fail test.
import { BASE, IPAD, launch, addParticipant, DEFAULT_SIM } from "./helpers.mjs";

const HUMAN = {
  ...DEFAULT_SIM,
  rt: { pvt: 290, nback: 550, flanker: 500, dsst: 950, stroop: 650 },
  rtJitter: 100                              // each tap 0-100 ms later than the base RT
};

async function timeBattery(browser, practice) {
  const page = await (await browser.newContext({ ...IPAD })).newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await addParticipant(page, HUMAN);
  await page.goto(`${BASE}/index.html`);       // no ?dev: full-length settings
  await page.waitForSelector("#screen-home:not([hidden])");
  // Click every instructions/"Start" button as soon as it appears (never the
  // task's own answer buttons, .tc-btn: those are for the simulated participant).
  const clicker = setInterval(() => page.locator("#jspsych-target button:visible:enabled:not(.tc-btn)").first()
    .click({ timeout: 500 }).catch(() => {}), 300);
  const res = await page.evaluate((practice) => new Promise((resolve) => {
    for (const s of SCREENS) document.getElementById("screen-" + s).hidden = true;
    const t = document.getElementById("jspsych-target"); t.hidden = false;
    const start = performance.now();
    const jp = initJsPsych({ display_element: t, on_finish: () => {
      const rows = jp.data.get().values();
      // Time per task = from its first row's start to its last row's end.
      const per = {};
      let prevEnd = 0;
      for (const r of rows) {
        per[r.task] = (per[r.task] || 0) + (r.time_elapsed - prevEnd);
        prevEnd = r.time_elapsed;
      }
      const dsst = rows.filter((r) => r.task === "dsst" && r.phase === "test");
      resolve({ dev: DEV, totalMin: (performance.now() - start) / 60000, per, rows: rows.length,
                dsstItems: dsst.length, dsstCorrect: dsst.filter((r) => r.correct).length });
    } });
    jp.run(buildBattery(jp, { practice, form: "A" }).timeline);
  }), practice);
  clearInterval(clicker);
  return res;
}

const browser = await launch();
const [fam, base] = await Promise.all([timeBattery(browser, true), timeBattery(browser, false)]);
for (const [name, r] of [["Familiarization (with practice)", fam], ["Baseline / test battery", base]]) {
  console.log(`\n${name}: ${r.totalMin.toFixed(1)} min, ${r.rows} rows${r.dev ? "  (WARNING: dev mode was on)" : ""}`);
  for (const [task, ms] of Object.entries(r.per)) console.log(`  ${task.padEnd(14)} ${(ms / 60000).toFixed(2)} min`);
  console.log(`  DSST: ${r.dsstItems} items, ${r.dsstCorrect} correct`);
}
await browser.close();
