// helpers.mjs — shared pieces for the automated tests.
//
// The tests drive the real site in WebKit (Safari's engine) with an emulated
// iPad, using Playwright. A "simulated participant" answers every task with
// taps placed a known number of milliseconds after the stimulus appears, so
// the tests can check that reaction times are recorded correctly, and makes
// some deliberate mistakes so the tests can check the scoring.
//
// The site must be running locally:  python3 tools/serve.py
import { webkit, devices } from "playwright";

export const BASE = "http://localhost:8000";
export const IPAD = devices["iPad (gen 7)"];

// ---- Pass/fail bookkeeping ----
const results = [];
export function check(name, ok, extra = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
}
export function finish() {
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

export async function launch() {
  return webkit.launch();
}

// ---- Simulated participant ----
// Installed into the page before it loads. For every stimulus it decides the
// right answer by looking at the screen (like a person would), then taps after
// `rt[task]` ms. Every Nth trial of a task (errorEvery[task]) it answers wrong
// on purpose. Everything it did is logged in window.__sim.log[task].
export const DEFAULT_SIM = {
  rt: { pvt: 300, nback: 400, flanker: 300, dsst: 250, stroop: 300, tload: 200 },
  rtJitter: 0,                                   // + random 0..rtJitter ms (timing runs)
  errorEvery: { nback: 7, flanker: 5, dsst: 5, stroop: 6 },  // 0 = never
  missEvery: { nback: 4, flanker: 7 }            // nback: miss every 4th match; flanker: no tap every 7th trial
};

export async function addParticipant(page, sim = DEFAULT_SIM) {
  await page.addInitScript((sim) => {
    const log = { pvt: [], nback: [], flanker: [], dsst: [], stroop: [], tload: [] };
    window.__sim = { log };
    const count = { nback: 0, nbackT: 0, flanker: 0, dsst: 0, stroop: 0 };
    const nbackHistory = [];
    const delay = (task) => sim.rt[task] + Math.random() * sim.rtJitter;
    // Aim at the button on screen NOW (like a finger); if that screen is gone
    // by the time of the tap, the tap goes nowhere.
    const tapButton = (pick, ms) => {
      const btn = [...document.querySelectorAll(".tc-btn")].find(pick);
      if (btn) setTimeout(() => { if (btn.isConnected) btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })); }, ms);
    };
    const nth = (n, every) => every > 0 && n % every === 0;

    new MutationObserver(() => {
      // PVT: the hint disappears on the frame the counter starts.
      const hint = document.getElementById("pvt-hint");
      if (hint && hint.style.visibility === "hidden" && !hint.dataset.sim) {
        hint.dataset.sim = "1";
        log.pvt.push({});
        setTimeout(() => {
          const area = document.getElementById("pvt-area");
          if (area) area.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
        }, delay("pvt"));
      }
      // Tap-choice tasks: act once per stimulus, when it becomes visible.
      const stim = document.getElementById("tc-stimulus");
      if (!stim || stim.dataset.sim || stim.style.visibility !== "visible") return;
      stim.dataset.sim = "1";

      if (stim.querySelector(".nback-letter")) {
        const L = stim.querySelector(".nback-letter").textContent;
        const isMatch = nbackHistory.length >= 2 && nbackHistory[nbackHistory.length - 2] === L;
        nbackHistory.push(L);
        let act;
        if (isMatch) act = nth(++count.nbackT, sim.missEvery.nback) ? "miss" : "hit";
        else act = nth(++count.nback, sim.errorEvery.nback) ? "false_alarm" : "ignore";
        log.nback.push({ letter: L, isMatch, act });
        if (act === "hit" || act === "false_alarm") tapButton(() => true, delay("nback"));
      } else if (stim.querySelector(".flanker-row")) {
        const target = stim.querySelectorAll("svg")[2].querySelector("g").getAttribute("transform") ? "left" : "right";
        const n = ++count.flanker;
        const act = nth(n, sim.missEvery.flanker) ? "none" : nth(n, sim.errorEvery.flanker) ? "wrong" : "correct";
        log.flanker.push({ target, act });
        if (act !== "none") {
          const answer = act === "correct" ? target : target === "left" ? "right" : "left";
          tapButton((b, i) => i === (answer === "left" ? 0 : 1), delay("flanker"));
        }
      } else if (stim.querySelector(".dsst-probe")) {
        const probe = stim.querySelector("svg").innerHTML;
        const cell = [...document.querySelectorAll(".tc-header .dsst-cell")]
          .find((c) => c.querySelector("svg").innerHTML === probe);
        const digit = cell.querySelector(".dsst-digit").textContent;
        const wrong = nth(++count.dsst, sim.errorEvery.dsst);
        const answer = wrong ? String((Number(digit) % 9) + 1) : digit;
        log.dsst.push({ digit, answer, wrong });
        tapButton((b) => b.textContent.trim() === answer, delay("dsst"));
      } else if (stim.querySelector(".stroop-word")) {
        const ink = getComputedStyle(stim.querySelector(".stroop-word")).color;
        const wrong = nth(++count.stroop, sim.errorEvery.stroop);
        log.stroop.push({ wrong });
        tapButton((b) => (getComputedStyle(b.querySelector(".stroop-patch")).backgroundColor === ink) !== wrong, delay("stroop"));
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["style"], childList: true });

    // TloadDback: answer every item correctly, rt.tload ms after it appears
    // (unless sim.tloadOff: a test that simulates TloadDback itself).
    let tloadArea = null, tloadPrev = null;
    if (!sim.tloadOff) new MutationObserver(() => {
      const area = document.querySelector(".tload"), el = document.getElementById("tload-item");
      if (!area || !el) return;
      if (!el.textContent) { el.dataset.sim = ""; return; }       // the blank between items: next text is a new item
      if (el.dataset.sim === String(log.tload.length) + el.textContent) return;
      if (area !== tloadArea) { tloadArea = area; tloadPrev = area.dataset.prev || null; }
      const c = el.textContent;
      let answer = null;
      if (/[A-Z]/.test(c)) { if (c === tloadPrev) answer = "same"; tloadPrev = c; }
      else answer = Number(c) % 2 ? "odd" : "even";
      log.tload.push({ c, answer });
      el.dataset.sim = String(log.tload.length) + c;
      const b = answer && [...area.querySelectorAll(".tload-btn")].find((x) => x.dataset.v === answer);
      if (b) setTimeout(() => { if (b.isConnected) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })); }, sim.rt.tload);
    }).observe(document, { subtree: true, childList: true, characterData: true });

    // 2-back history restarts with each block (practice and test are separate sequences).
    new MutationObserver(() => {
      const h = document.querySelector("#jspsych-target h2");
      if (h && !h.dataset.sim) { h.dataset.sim = "1"; nbackHistory.length = 0; }
    }).observe(document, { subtree: true, childList: true });
  }, sim);
}

// Plays the non-task screens (questions, sliders, instruction buttons) until
// the session's end screen appears. Tasks are answered by addParticipant().
// until: a CSS selector; stop as soon as it is on screen instead (returns "").
export async function playSession(page, { maxMinutes = 30, until = null } = {}) {
  const deadline = Date.now() + maxMinutes * 60000;
  let lastScreen = "", sameSince = Date.now(), reported = false;
  while (Date.now() < deadline) {
    // Stuck detector: the same screen for over a minute -> describe it once (for debugging).
    const screen = await page.evaluate(() => (document.getElementById("jspsych-target") || document.body).innerHTML.slice(0, 400)).catch(() => "");
    if (screen !== lastScreen) { lastScreen = screen; sameSince = Date.now(); reported = false; }
    else if (!reported && Date.now() - sameSince > 60000) {
      reported = true;
      console.log("STUCK for 60 s on this screen:\n" + screen);
      await page.screenshot({ path: "stuck.png" }).catch(() => {});
    }
    if (until && await page.locator(until).count()) return "";
    if (await page.locator("#done-btn:visible").count()) return page.locator(".done-screen:visible").innerText();
    // Task screens (answered by the simulated participant) and timed pauses: just wait.
    if (await page.locator(".tc-area, #pvt-area, .break-count").count()) { await page.waitForTimeout(100); continue; }
    if (await page.locator("#jspsych-target .jspsych-html-button-response-btngroup:empty").count()) { await page.waitForTimeout(100); continue; }
    if (await page.locator("#vas-track").count()) {
      await page.locator("#vas-track").click();
      await page.click("#vas-continue");
    } else if (await page.locator("#jspsych-survey-html-form").count()) {
      await page.fill("[name=sleep_hours]", "8");
      for (const sel of await page.locator("#jspsych-survey-html-form select").all()) await sel.selectOption({ index: 1 });
      await page.click("#jspsych-survey-html-form [type=submit]");
    } else {
      const btn = page.locator("#jspsych-target button:visible:enabled").first();
      if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(40);
  }
  throw new Error("session did not finish in time");
}

// ---- CSV ----
// Parses a CSV with quoted cells (quotes doubled inside, line breaks allowed in cells).
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// The browser's backup copy of the most recent session (jsPsych CSV; empty values are the text "null").
export async function backupRows(page) {
  const csv = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("cogbat_data_")).sort();
    return JSON.parse(localStorage.getItem(keys[keys.length - 1])).csv;
  });
  return parseCsv(csv);
}
