/*
 * plugin-tload.js — one BLOCK of the TloadDback task as a single jsPsych trial.
 *
 * Items (letters and digits, one character each) appear one after another at
 * a fixed pace: item k appears exactly k x std_ms after the first one, on the
 * screen frame where that time is reached (requestAnimationFrame), so the pace
 * never drifts. Each item is visible for std_ms minus a short blank (blank_ms)
 * at the end, so a new item is always visibly new, even when it is the same
 * character as the one before (P then P in the letters-only practice).
 * A tap during the blank still counts for that item.
 *   letter -> tap SAME if it is the same letter as the previous letter
 *             (1-back), otherwise don't tap
 *   digit  -> tap ODD or EVEN
 * Taps are timed on "pointerdown"; only the first tap per item counts.
 *
 * A whole block is one data row (so a 16-minute task is a handful of rows, not
 * thousands of database writes). The row still holds EVERY item in `items`:
 *   [stream position, character, kind L/D, target, response, rt ms, correct]
 * (response "skipped" = the item's time passed without being drawn, e.g. the
 * tab was hidden; such items are left out of the accuracies)
 * plus block summaries: letter/digit/weighted accuracy and number of taps.
 *
 * The block ends after n_items items, or (if duration_ms is set) at the first
 * item boundary after duration_ms.
 */
var jsPsychTload = (function (jspsych) {
  "use strict";

  const info = {
    name: "tload",
    version: "1.0.0",
    parameters: {
      stream: { type: jspsych.ParameterType.STRING, default: "" },   // items, one character each
      start: { type: jspsych.ParameterType.INT, default: 0 },        // first stream position used
      n_items: { type: jspsych.ParameterType.INT, default: null },
      duration_ms: { type: jspsych.ParameterType.INT, default: null },
      std_ms: { type: jspsych.ParameterType.INT, default: 1500 },
      blank_ms: { type: jspsych.ParameterType.INT, default: 100 },     // blank at the end of each item
      prev_letter: { type: jspsych.ParameterType.STRING, default: null }, // letter just before `start` (continuing stream)
      weights: { type: jspsych.ParameterType.COMPLEX, default: { letters: 0.65, digits: 0.35 } },
      show_letter_button: { type: jspsych.ParameterType.BOOL, default: true },
      show_digit_buttons: { type: jspsych.ParameterType.BOOL, default: true }
    },
    data: {
      std_ms: { type: jspsych.ParameterType.INT },
      n_items: { type: jspsych.ParameterType.INT },
      letter_accuracy: { type: jspsych.ParameterType.FLOAT },
      digit_accuracy: { type: jspsych.ParameterType.FLOAT },
      weighted_accuracy: { type: jspsych.ParameterType.FLOAT },
      n_taps: { type: jspsych.ParameterType.INT },
      n_skipped: { type: jspsych.ParameterType.INT },
      next_start: { type: jspsych.ParameterType.INT },
      last_letter: { type: jspsych.ParameterType.STRING },
      items: { type: jspsych.ParameterType.COMPLEX }
    }
  };

  const isLetter = (c) => /[A-Z]/.test(c);

  class TloadPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }

    trial(display_element, trial) {
      const btn = (value, label, extra = "") => `<button type="button" class="tc-btn tload-btn ${extra}" data-v="${value}">${label}</button>`;
      display_element.innerHTML = `
        <div class="tc-area tload" data-std="${trial.std_ms}" data-prev="${trial.prev_letter || ""}">
          <div class="tc-stage"><div class="tload-item" id="tload-item"></div></div>
          <div class="tc-buttons tload-buttons">
            ${trial.show_letter_button ? btn("same", "SAME<br>LETTER", "tload-same") : "<span></span>"}
            <span class="tload-gap"></span>
            ${trial.show_digit_buttons ? btn("odd", "ODD") + btn("even", "EVEN") : ""}
          </div>
        </div>`;
      const itemEl = display_element.querySelector("#tload-item");
      const buttons = [...display_element.querySelectorAll(".tload-btn")];

      const items = [];          // one record per item shown
      let t0 = null;             // onset time of the first item (rAF timestamp)
      let k = -1;                // index (within this block) of the item on screen
      let prevLetter = trial.prev_letter;
      let rafId = null;
      let done = false;

      const showItem = (index, frameTime) => {
        const pos = trial.start + index;
        const c = trial.stream[pos];
        const kind = isLetter(c) ? "L" : "D";
        const target = kind === "L" ? (prevLetter !== null && c === prevLetter) : (Number(c) % 2 ? "odd" : "even");
        if (kind === "L") prevLetter = c;
        items.push({ pos, c, kind, target, response: null, rt: null, onset: frameTime });
        itemEl.textContent = c;
        k = index;
      };

      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(rafId);
        buttons.forEach((b) => b.removeEventListener("pointerdown", onTap));
        // Score each item. Letter: correct = tapped SAME on a repeat, or did not
        // tap on a non-repeat. Digit: correct = tapped the right parity.
        for (const it of items) {
          if (it.response === "skipped") { it.correct = null; continue; }
          it.correct = it.kind === "L" ? (it.target ? it.response === "same" : it.response === null) : it.response === it.target;
        }
        const shown = items.filter((it) => it.response !== "skipped");
        const acc = (list) => list.length ? list.filter((it) => it.correct).length / list.length : null;
        const L = acc(shown.filter((it) => it.kind === "L")), D = acc(shown.filter((it) => it.kind === "D"));
        const w = trial.weights;
        const weighted = L === null ? D : D === null ? L : w.letters * L + w.digits * D;
        const round3 = (x) => (x === null ? null : Math.round(x * 1000) / 1000);
        this.jsPsych.finishTrial({
          std_ms: trial.std_ms,
          n_items: items.length,
          letter_accuracy: round3(L),
          digit_accuracy: round3(D),
          weighted_accuracy: round3(weighted),
          n_taps: shown.filter((it) => it.response !== null).length,
          n_skipped: items.length - shown.length,
          next_start: trial.start + items.length,
          last_letter: prevLetter,
          // Compact rows: [stream position, character, kind, target, response, rt, correct]
          items: items.map((it) => [it.pos, it.c, it.kind, it.target, it.response, it.rt, it.correct])
        });
      };

      const onTap = (e) => {
        e.preventDefault();
        const t = performance.now();
        const it = items[k];
        if (!it || it.response !== null) return;   // before the first item, or not the first tap
        it.response = e.currentTarget.dataset.v;
        it.rt = Math.round((t - it.onset) * 10) / 10;
        e.currentTarget.classList.add("tc-pressed");
        const b = e.currentTarget;
        setTimeout(() => b.classList.remove("tc-pressed"), 150);
      };
      buttons.forEach((b) => b.addEventListener("pointerdown", onTap));

      const nTotal = trial.n_items !== null ? trial.n_items : Infinity;
      const tick = (frameTime) => {
        if (t0 === null) { t0 = frameTime; showItem(0, frameTime); }
        // Which item should be on screen now? (half a frame early, so it lands on the nearest frame)
        const due = Math.floor((frameTime - t0 + 8) / trial.std_ms);
        const timeUp = trial.duration_ms !== null && due * trial.std_ms >= trial.duration_ms;
        if (due >= nTotal || timeUp || trial.start + due >= trial.stream.length) return finish();
        // Items whose time passed without a frame (e.g. the tab was hidden) were
        // never shown: record them as "skipped" and leave them out of the scores.
        while (k < due - 1) {
          k++;
          const pos = trial.start + k, c = trial.stream[pos];
          if (isLetter(c)) prevLetter = c;
          items.push({ pos, c, kind: isLetter(c) ? "L" : "D", target: null, response: "skipped", rt: null, onset: null });
        }
        if (due > k) showItem(due, frameTime);
        else if (items[k] && frameTime - items[k].onset >= trial.std_ms - trial.blank_ms - 8) itemEl.textContent = "";
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
  }
  TloadPlugin.info = info;
  return TloadPlugin;
})(jsPsychModule);
