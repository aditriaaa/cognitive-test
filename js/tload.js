/*
 * tload.js — the TloadDback parts of a session (cognitive-fatigue manipulation).
 *
 *   buildTloadCalibration  end of baselines 4 and 5 (after the battery):
 *                          finds the fastest pace this person can keep up
 *                          with at >= 85% weighted accuracy.
 *   buildTloadMain         the T-fatigue session: 16 minutes at that pace.
 *
 * Settings: CONFIG.TLOAD. Item streams: TLOAD_STREAMS in js/forms.js.
 * Each block is one jsPsych trial (js/plugin-tload.js) whose data row holds
 * every item, so the raw responses are all kept.
 */

const TLOAD_RULES = `
  <p>Letters and numbers will take turns on the screen.</p>
  <div class="tload-rules">
    <div><b>Letter:</b> tap <b>SAME LETTER</b> if it is the same as the <b>previous letter</b>.<br>
      Otherwise, don't tap.</div>
    <div><b>Number:</b> tap <b>ODD</b> or <b>EVEN</b>.</div>
  </div>`;

const tloadScreen = (html, button = "Start", task = "instructions") => ({
  type: jsPsychHtmlButtonResponse, stimulus: html, choices: [button], data: { task }
});

// Pause between blocks: moves on by itself after `seconds`.
const tloadPause = (html, seconds) => ({
  type: jsPsychHtmlButtonResponse, stimulus: html, choices: [], trial_duration: seconds * 1000,
  data: { task: "tload_pause" }
});

// One block (a jsPsych trial) of TloadDback.
function tloadBlock(stream, stdMs, phase, extra = {}) {
  const T = CONFIG.TLOAD;
  const n = DEV ? Math.min(CONFIG.DEV.tloadBlockItems, stream.length) : stream.length;
  return {
    type: jsPsychTload, stream, n_items: n, std_ms: stdMs, blank_ms: T.blankMs, weights: T.weights,
    show_letter_button: /[A-Z]/.test(stream),
    show_digit_buttons: /[0-9]/.test(stream),
    data: { task: "tload", phase, ...extra }
  };
}

const pct = (x) => Math.round(x * 100) + "%";

// ---------------------------------------------------------------------------
// Calibration: which = 1 (end of B4, starts with a familiarization) or 2 (end of B5)
// ---------------------------------------------------------------------------
function buildTloadCalibration(jsPsych, { which }) {
  const T = CONFIG.TLOAD, S = TLOAD_STREAMS;
  // The most recent TloadDback block's data (for the feedback screens).
  const lastTload = () => jsPsych.data.get().filter({ task: "tload" }).last(1).values()[0];
  const timeline = [];

  if (which === 1) {
    // Familiarization: each task on its own, then both together, at 1.5 s per item.
    const fam = T.familiarizationStdMs;
    timeline.push(tloadScreen(`<h2>Letters and numbers</h2>
      <p>One last task today. It has three short parts to learn it, then a speed test.</p>
      <p><b>Part 1: letters only.</b> Tap <b>SAME LETTER</b> when a letter is the same as the one just before it.
      Otherwise, don't tap.</p>`));
    timeline.push(tloadBlock(S.famLetters, fam, "familiarization-letters"));
    timeline.push({ ...tloadScreen("", "Next"), stimulus: () => `<p>You got ${pct(lastTload().letter_accuracy)} right.</p>
      <p><b>Part 2: numbers only.</b> Tap <b>ODD</b> or <b>EVEN</b> for each number.</p>` });
    timeline.push(tloadBlock(S.famDigits, fam, "familiarization-digits"));
    timeline.push({ ...tloadScreen("", "Next"), stimulus: () => `<p>You got ${pct(lastTload().digit_accuracy)} right.</p>
      <h2>Part 3: both together</h2>${TLOAD_RULES}` });
    // Both together, repeated (up to 5 blocks) until 85% is reached.
    let famBlock = 0;
    timeline.push({
      timeline: [
        { ...tloadBlock(S.famDual[0], fam, "familiarization-dual"),
          stream: () => S.famDual[famBlock], data: { task: "tload", phase: "familiarization-dual" },
          on_finish: () => { famBlock++; } },
        { ...tloadScreen("", "Next"), stimulus: () => `<p>You got ${pct(lastTload().weighted_accuracy)} right.</p>` +
            (lastTload().weighted_accuracy >= T.passAccuracy || famBlock >= T.familiarizationMaxDualBlocks
              ? "<p>Well done. Now the speed test.</p>" : "<p>Let's try that once more.</p>") }
      ],
      loop_function: () => lastTload().weighted_accuracy < T.passAccuracy && famBlock < T.familiarizationMaxDualBlocks
    });
  }

  timeline.push(tloadScreen(`<h2>Speed test</h2>${TLOAD_RULES}
    <p>The items will come a little faster each round, until it gets hard.
    Just do your best. Each round takes about a minute.</p>`, "Start"));

  // The calibration itself: one block at a time, the pace decided after each one.
  const cal = calibrationState();
  let b = 0;
  timeline.push({
    timeline: [
      { ...tloadBlock(S.calibration[which - 1][0], T.calibrationStartStdMs, "calibration"),
        stream: () => S.calibration[which - 1][b],
        std_ms: () => cal.std,
        data: { task: "tload", phase: "calibration", calibration: which },
        on_finish: (data) => { Object.assign(data, { block: b + 1 }); b++; cal.after(data.weighted_accuracy); } },
      // Pause before the next round. After the last round it takes 0 s and shows
      // nothing (a skipped trial would leave a gap in trial_index).
      { ...tloadPause("", 0),
        stimulus: () => (cal.done ? "" : "<p>Next round starting...</p>"),
        trial_duration: () => (cal.done ? 0 : (DEV ? 1 : 4) * 1000) }
    ],
    loop_function: () => !cal.done
  });

  // One row with the result, read back by the T-fatigue session.
  timeline.push({
    ...tloadScreen("<h2>Done</h2><p>Thanks, that's the end of this task.</p>", "Continue", "tload_calibration_result"),
    on_finish: (data) => Object.assign(data, {
      calibration: which, std_final: cal.result, calibrated: cal.calibrated,
      n_blocks: cal.blocks.length, blocks: cal.blocks
    })
  });
  return { timeline };
}

// The calibration rule as a small state machine (also used by the tests).
// Start at calibrationStartStdMs. Each block passed (>= 85%) -> 100 ms faster.
// After the first failure, go back to the last speed passed (or 100 ms slower
// than the start if none) and repeat it until it has been passed 3 times in
// total; a failure there -> another 100 ms slower. The result is that speed.
// If even maxStdMs is not passed, or maxCalibrationBlocks is reached:
// calibrated = false (the app does not exclude anyone; the analysis decides).
function calibrationState() {
  const T = CONFIG.TLOAD;
  const s = { std: T.calibrationStartStdMs, lastPassed: null, confirming: null, passes: {}, blocks: [],
              done: false, result: null, calibrated: false };
  const stop = (result, calibrated) => { s.done = true; s.result = result; s.calibrated = calibrated; };
  s.after = (accuracy) => {
    const pass = accuracy >= T.passAccuracy;
    s.blocks.push({ std: s.std, accuracy, pass });
    if (pass) s.passes[s.std] = (s.passes[s.std] || 0) + 1;
    if (s.confirming === null) {                 // still speeding up
      if (pass) {
        s.lastPassed = s.std;
        if (s.std - T.stepMs < T.minStdMs) s.confirming = s.std;
        else s.std -= T.stepMs;
      } else {
        s.confirming = s.lastPassed !== null ? s.lastPassed : s.std + T.stepMs;
        s.std = s.confirming;
      }
    } else if (!pass) {                          // confirming a speed, and failed
      s.confirming += T.stepMs;
      s.std = s.confirming;
    }
    if (s.confirming !== null && s.confirming > T.maxStdMs) return stop(T.maxStdMs, false);
    if (s.confirming !== null && (s.passes[s.confirming] || 0) >= T.passesNeeded) return stop(s.confirming, true);
    if (s.blocks.length >= T.maxCalibrationBlocks) return stop(s.confirming !== null ? s.confirming : s.std, false);
  };
  return s;
}

// Pace for the T-fatigue session, from the calibration results of B4 and B5:
// the fastest speed that was properly calibrated; if none was, the slowest
// result (flagged). Returns { std, source }.
function chooseTloadStd(results) {
  const T = CONFIG.TLOAD;
  const good = results.filter((r) => r.calibrated);
  if (good.length) return { std: Math.min(...good.map((r) => r.std_final)), source: "calibrated" };
  if (results.length) return { std: Math.max(...results.map((r) => r.std_final)), source: "not-calibrated" };
  return { std: T.maxStdMs, source: "no-calibration-found" };
}

// ---------------------------------------------------------------------------
// The 16-minute fatigue task (T-fatigue session)
// ---------------------------------------------------------------------------
function buildTloadMain({ stdMs, source }) {
  const T = CONFIG.TLOAD, S = TLOAD_STREAMS;
  const totalMs = (DEV ? CONFIG.DEV.tloadMainSeconds : T.mainMinutes * 60) * 1000;
  const chunkMs = (DEV ? CONFIG.DEV.tloadChunkSeconds : T.chunkSeconds) * 1000;
  let pos = 0, prevLetter = null, elapsed = 0, chunk = 0;
  const minutes = Math.max(1, Math.round(totalMs / 60000));
  return { timeline: [
    tloadScreen(`<h2>Letters and numbers</h2>${TLOAD_RULES}
      <p>This time the task lasts <b>${minutes} minute${minutes === 1 ? "" : "s"}</b> without a break.
      Keep going and do your best the whole time.</p>`),
    {
      timeline: [{
        ...tloadBlock(S.main, stdMs, "main"),
        n_items: null,
        start: () => pos,
        prev_letter: () => prevLetter,
        duration_ms: () => Math.min(chunkMs, totalMs - elapsed),
        data: { task: "tload", phase: "main", std_source: source },
        on_finish: (data) => {
          chunk++;
          Object.assign(data, { chunk });
          pos = data.next_start; prevLetter = data.last_letter;
          elapsed += data.n_items * data.std_ms;
        }
      }],
      loop_function: () => elapsed < totalMs
    }
  ] };
}
