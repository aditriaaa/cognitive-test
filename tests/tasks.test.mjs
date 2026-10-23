// tasks.test.mjs — every task in one quick-mode familiarization session
// (practice + shortened dev blocks). No Firebase needed.
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:tasks
//
// Checks, per task: trials follow the frozen form/practice lists in order,
// answers are scored correctly (including deliberate mistakes and no-taps),
// and reaction times match the simulated participant's tap delay.
import { BASE, IPAD, check, finish, launch, addParticipant, playSession, backupRows, DEFAULT_SIM } from "./helpers.mjs";

const browser = await launch();
const page = await (await browser.newContext({ ...IPAD })).newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await addParticipant(page);
await page.goto(`${BASE}/index.html?quick=1`);
const endText = await playSession(page);
check("session reached the end screen", endText.includes("Quick test finished"));

const rows = await backupRows(page);
const { log, forms } = await page.evaluate(() => ({ log: window.__sim.log, forms: FORMS }));
const rt = DEFAULT_SIM.rt;
const isNull = (v) => v === "null";            // jsPsych's CSV writes empty values as "null"
const rtOk = (list, ms) => list.length > 0 && list.every((r) => Number(r.rt) >= ms - 1 && Number(r.rt) <= ms + 40);
const range = (list) => list.length ? `${Math.min(...list.map((r) => Number(r.rt)))}–${Math.max(...list.map((r) => Number(r.rt)))} ms` : "none";
const of = (task, phase) => rows.filter((r) => r.task === task && (!phase || r.phase === phase));

// ---- Order ----
const order = rows.map((r) => r.task).filter((t) => ["pvt", "break", "nback", "flanker", "dsst", "stroop"].includes(t))
  .filter((t, i, a) => t !== a[i - 1]);
check("task order: pvt, nback, flanker, dsst, stroop, with a break between each",
  order.join(",") === "pvt,break,nback,break,flanker,break,dsst,break,stroop", order.join(","));
const version = await page.evaluate(() => CONFIG.VERSION);
check("every row labelled QUICKTEST, form A, dev, current version", rows.every((r) =>
  r.participant_id === "QUICKTEST" && r.form === "A" && r.dev === "true" && r.version === version), version);

check("trial_index runs 0, 1, 2, ... with no gaps", rows.every((r, i) => Number(r.trial_index) === i));

// ---- PVT ----
const pvt = of("pvt").filter((r) => r.outcome === "response");
check("PVT: responses recorded at the tap delay", rtOk(pvt, rt.pvt), range(pvt));

// ---- 2-back ----
const nb = of("nback");
check("2-back: practice list then form A, in order",
  of("nback", "practice").every((r, i) => r.letter === forms.practice.nback[i].letter) &&
  of("nback", "test").every((r, i) => r.letter === forms.A.nback[i].letter && Number(r.trial_in_block) === i + 1));
check("2-back: hits, misses, false alarms, correct non-taps scored right", nb.every((r, i) => {
  const a = log.nback[i].act;
  if (a === "hit") return r.response === "match" && r.correct === "true";
  if (a === "miss") return isNull(r.response) && r.correct === "false";
  if (a === "false_alarm") return r.response === "match" && r.correct === "false";
  return isNull(r.response) && r.correct === "true";
}), JSON.stringify(log.nback.reduce((c, x) => ((c[x.act] = (c[x.act] || 0) + 1), c), {})));
check("2-back: RT at the tap delay", rtOk(nb.filter((r) => !isNull(r.rt)), rt.nback), range(nb.filter((r) => !isNull(r.rt))));
const nbTest = of("nback", "test");
const gaps = nbTest.slice(1).map((r, i) => Number(r.time_elapsed) - Number(nbTest[i].time_elapsed));
check("2-back: fixed pace, every trial 2.5 s", gaps.every((g) => g >= 2490 && g <= 2560), `${Math.min(...gaps)}–${Math.max(...gaps)} ms`);

// ---- Flanker ----
const fl = of("flanker");
check("flanker: practice list then form A, in order",
  of("flanker", "practice").every((r, i) => r.target === forms.practice.flanker[i].target) &&
  of("flanker", "test").every((r, i) => r.target === forms.A.flanker[i].target &&
    r.condition === (forms.A.flanker[i].congruent ? "congruent" : "incongruent")));
check("flanker: correct, wrong and no-tap scored right", fl.every((r, i) => {
  const a = log.flanker[i].act;
  if (a === "none") return isNull(r.response) && r.correct === "false" && isNull(r.rt);
  return (r.response === r.target) === (a === "correct") && (r.correct === "true") === (a === "correct");
}));
check("flanker: RT at the tap delay", rtOk(fl.filter((r) => !isNull(r.rt)), rt.flanker), range(fl.filter((r) => !isNull(r.rt))));

// ---- DSST ----
const dsT = of("dsst", "test");
check("DSST: practice key/items, then form A key/items",
  of("dsst", "practice").every((r, i) => Number(r.digit) === forms.practice.dsst.items[i] && r.symbol === forms.practice.dsst.key[r.digit]) &&
  dsT.every((r, i) => Number(r.digit) === forms.A.dsst.items[i] && r.symbol === forms.A.dsst.key[r.digit]));
const dsAnswered = of("dsst").filter((r) => !isNull(r.response));
check("DSST: answers scored right (incl. deliberate errors)", dsAnswered.every((r, i) =>
  r.response === log.dsst[i].answer && (r.correct === "true") === !log.dsst[i].wrong));
const blockMs = Number(dsT[dsT.length - 1].time_elapsed) - (Number(dsT[0].time_elapsed) - Number(dsT[0].rt));
check("DSST: block stops at the time limit (20 s in dev)", blockMs >= 19500 && blockMs <= 20600, `${(blockMs / 1000).toFixed(2)} s, ${dsT.length} items`);
check("DSST: RT at the tap delay", rtOk(dsAnswered, rt.dsst), range(dsAnswered));

// ---- Stroop ----
const st = of("stroop");
check("Stroop: practice list then form A, in order",
  of("stroop", "practice").every((r, i) => r.word === forms.practice.stroop[i].word && r.ink === forms.practice.stroop[i].ink) &&
  of("stroop", "test").every((r, i) => r.word === forms.A.stroop[i].word && r.ink === forms.A.stroop[i].ink));
check("Stroop: congruent/incongruent labels right", st.every((r) => r.condition === (r.word === r.ink ? "congruent" : "incongruent")));
check("Stroop: ink taps scored right (incl. deliberate errors)", st.every((r, i) =>
  (r.correct === "true") === !log.stroop[i].wrong && (r.response === r.ink) === !log.stroop[i].wrong));
check("Stroop: RT at the tap delay", rtOk(st, rt.stroop), range(st));

check("touch recorded as the input type", [...fl, ...st, ...dsAnswered].filter((r) => !isNull(r.rt)).every((r) => r.pointer_type === "touch"));
await browser.close();
finish();
