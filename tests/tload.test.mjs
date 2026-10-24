// tload.test.mjs — TloadDback in quick mode (no Firebase needed).
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:tload
//
// Part 1: a baseline session with the FIRST calibration (familiarization +
//   speed test, short dev blocks). The simulated participant answers every
//   item correctly at 900 ms per item or slower, and gets every digit wrong
//   when it is faster -> the calibration must end at 900 ms.
// Part 2: a T-fatigue session at 600 ms per item (40 s in dev, in 20 s chunks):
//   exact pace, one continuous item stream across chunks, every item scored
//   right, reaction times recorded.
import { BASE, IPAD, check, finish, launch, playSession, backupRows, addParticipant, DEFAULT_SIM } from "./helpers.mjs";

const TAP_MS = 250;
const browser = await launch();

async function runQuick(params, keepUpAtOrAbove) {
  const page = await (await browser.newContext({ ...IPAD })).newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  // The usual simulated participant answers the battery tasks (fast, no long
  // unanswered PVT trials); TloadDback is answered by the one below instead.
  await addParticipant(page, { ...DEFAULT_SIM, tloadOff: true });
  // Simulated TloadDback participant: answers each item TAP_MS after it appears.
  await page.addInitScript(({ TAP_MS, keepUpAtOrAbove }) => {
    window.__tlog = [];
    let prevLetter = null, lastArea = null;
    new MutationObserver(() => {
      const area = document.querySelector(".tload");
      const el = document.getElementById("tload-item");
      if (!area || !el) return;
      if (!el.textContent) { el.dataset.seen = ""; return; }      // the blank between items: next text is a new item
      if (el.dataset.seen === el.textContent + window.__tlog.length) return;
      // New block: start from the letter just before it (set when the stream continues), else none.
      if (area !== lastArea) { lastArea = area; prevLetter = area.dataset.prev || null; }
      el.dataset.seen = el.textContent + (window.__tlog.length + 1);
      const c = el.textContent, std = Number(area.dataset.std);
      const keepsUp = std >= keepUpAtOrAbove;
      let answer = null;
      if (/[A-Z]/.test(c)) { if (prevLetter === c) answer = "same"; prevLetter = c; }
      else {
        const right = Number(c) % 2 ? "odd" : "even";
        answer = keepsUp ? right : right === "odd" ? "even" : "odd";
      }
      window.__tlog.push({ c, std, answer });
      // Aim at the button on screen NOW; if that block has ended by the time of the tap, it goes nowhere.
      const b = answer && [...area.querySelectorAll(".tload-btn")].find((x) => x.dataset.v === answer);
      if (b) setTimeout(() => { if (b.isConnected) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })); }, TAP_MS);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, { TAP_MS, keepUpAtOrAbove });
  await page.goto(`${BASE}/index.html?quick=1&${params}`);
  // (The battery runs at its normal dev length here: quick mode starts the
  // session while the page loads, before a test could shorten anything.)
  const end = await playSession(page, { maxMinutes: 15 });
  const rows = await backupRows(page);
  return { page, end, rows };
}
const items = (row) => JSON.parse(row.items).map(([pos, c, kind, target, response, rt, correct]) => ({ pos, c, kind, target, response, rt, correct }));

// ---------------- Part 1: calibration ----------------
let { end, rows } = await runQuick("type=baseline&calibrate=1", 900);
check("calibration session finished", end.includes("Quick test finished"));
const tl = rows.filter((r) => r.task === "tload");
const phases = [...new Set(tl.map((r) => r.phase))];
check("familiarization: letters, digits, both, then calibration", phases.join(",") ===
  "familiarization-letters,familiarization-digits,familiarization-dual,calibration", phases.join(","));
check("familiarization at 1500 ms per item", tl.filter((r) => r.phase.startsWith("familiarization")).every((r) => r.std_ms === "1500"));
const cal = tl.filter((r) => r.phase === "calibration");
console.log("      calibration blocks:", cal.map((r) => `${r.std_ms}:${r.weighted_accuracy}`).join("  "));
check("at 900 ms or slower (keeps up) every block is 100%, incl. repeated letters in the letters-only block",
  tl.filter((r) => Number(r.std_ms) >= 900).every((r) => r.weighted_accuracy === "1"),
  tl.filter((r) => Number(r.std_ms) >= 900 && r.weighted_accuracy !== "1").map((r) => `${r.phase} ${r.std_ms}: ${r.weighted_accuracy}`).join("; "));
check("calibration starts at 1400 ms and speeds up by 100 ms per passed block",
  cal[0].std_ms === "1400" && cal[1].std_ms === "1300");
const result = rows.find((r) => r.task === "tload_calibration_result");
check("result row: 900 ms, calibrated", result && result.std_final === "900" && result.calibrated === "true",
  result && `${result.std_final} ms, calibrated=${result.calibrated}, ${result.n_blocks} blocks`);
check("calibration comes after the battery and its ratings", rows.findIndex((r) => r.task === "tload") >
  rows.map((r) => r.task).lastIndexOf("vas"));
check("every block row holds all its items", tl.every((r) => items(r).length === Number(r.n_items)));

// ---------------- Part 2: the fatigue task ----------------
({ end, rows } = await runQuick("type=test-fatigue&std=600", 0));
check("T-fatigue session finished", end.includes("Quick test finished"));
const order = rows.map((r) => r.task).filter((t, i, a) => t !== a[i - 1] && ["tload", "vas", "pvt"].includes(t));
check("order: ratings, fatigue task, fatigue rating, battery", order.slice(0, 4).join(",") === "vas,tload,vas,pvt", order.join(","));
const main = rows.filter((r) => r.task === "tload" && r.phase === "main");
const all = main.flatMap(items);
check("2 chunks of 20 s at 600 ms", main.length === 2 && main.every((r) => r.std_ms === "600" && r.std_source === "quick-test"),
  main.map((r) => `${r.n_items} items`).join(", "));
check("one continuous stream: positions 0, 1, 2, ... across chunks", all.every((it, i) => it.pos === i));
check("total length 40 s (items x 600 ms)", all.length * 600 >= 40000 && all.length * 600 < 40600, `${all.length} items`);
const chunkMs = Number(main[1].time_elapsed) - Number(main[0].time_elapsed);
check("pace is exact: chunk 2 lasted items x 600 ms (within 50 ms)", Math.abs(chunkMs - Number(main[1].n_items) * 600) < 50,
  `${chunkMs} ms for ${main[1].n_items} items`);
// The letter at the start of chunk 2 is compared with the last letter of chunk 1.
const firstLetter2 = items(main[1]).find((it) => it.kind === "L");
const lastLetter1 = items(main[0]).filter((it) => it.kind === "L").pop();
check("1-back continues across the chunk boundary", firstLetter2.target === (firstLetter2.c === lastLetter1.c));
check("every item scored right (letters: SAME on repeats only; digits: parity)", all.every((it) =>
  it.correct === (it.kind === "L" ? (it.target ? it.response === "same" : it.response === null) : it.response === it.target)));
check("a perfect participant scores 100%", main.every((r) => r.weighted_accuracy === "1"));
const rts = all.filter((it) => it.rt !== null).map((it) => it.rt);
check(`taps ${TAP_MS} ms after each item recorded as ~${TAP_MS} ms`, rts.every((x) => x >= TAP_MS - 1 && x <= TAP_MS + 40),
  `${Math.min(...rts)}–${Math.max(...rts)} ms`);
check("no items skipped", main.every((r) => r.n_skipped === "0"));
await browser.close();
finish();
