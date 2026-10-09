/*
 * pvt.js — builds the PVT block: instructions, optional practice, then
 * trials repeated until the block's time limit is reached.
 */
function buildPvt(jsPsych, { practice, durationSeconds }) {
  const P = CONFIG.PVT;
  const randomIsi = () => jsPsych.randomization.randomInt(P.isiMinMs, P.isiMaxMs);

  const pvtTrial = (phase) => ({
    type: jsPsychPvtTouch,
    isi_ms: randomIsi,                      // a function, so a new wait is drawn every trial
    response_timeout_ms: P.responseTimeoutMs,
    feedback_ms: P.feedbackMs,
    false_start_threshold_ms: P.falseStartThresholdMs,
    data: { task: "pvt", phase }
  });

  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Reaction time</h2>
      <p>A box will appear in the middle of the screen.</p>
      <p>Every so often, <b>numbers will start counting up</b> inside it.<br>
      As soon as you see them, <b>tap anywhere on the screen</b> as fast as you can.</p>
      <p>Don't tap before the numbers appear.</p>
      <p>This lasts about ${Math.round(durationSeconds / 60) || 1} minute(s).</p>`,
    choices: [practice ? "Start practice" : "Start"],
    data: { task: "instructions" }
  };

  const timeline = [instructions];

  if (practice) {
    timeline.push({ timeline: [pvtTrial("practice")], repetitions: P.practiceTrials });
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: "<h2>Practice done</h2><p>Now the real task. Same rules.</p>",
      choices: ["Start"],
      data: { task: "instructions" }
    });
  }

  // Main block: keep running trials until time is up.
  // The block starts when its first trial starts, so instructions don't eat into it.
  let blockStart = null;
  timeline.push({
    timeline: [pvtTrial("test")],
    on_timeline_start: () => { blockStart = null; },
    loop_function: () => (performance.now() - blockStart) / 1000 < durationSeconds,
    on_start: () => { if (blockStart === null) blockStart = performance.now(); }
  });

  return { timeline };
}
