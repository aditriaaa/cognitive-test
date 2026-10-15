/*
 * flanker.js — builds the flanker block (Eriksen & Eriksen, 1974; arrow version).
 *
 * A row of five arrows appears. The participant taps the button for the
 * direction of the MIDDLE arrow and ignores the four around it.
 *   congruent:   → → → → →   (all the same way: easy)
 *   incongruent: ← ← → ← ←   (outer arrows point the other way: slower)
 * The slowing on incongruent trials (RT cost) measures inhibitory control.
 *
 * Arrows are drawn as SVG, not as text characters, so they look identical on
 * every device (fonts differ between iPad, Android and Windows).
 *
 * Trial order comes from the frozen list in js/forms.js (form A or B).
 */

// One arrow pointing "left" or "right", drawn with a few lines.
function arrowSvg(direction, size) {
  const flip = direction === "left" ? ' transform="scale(-1,1) translate(-100,0)"' : "";
  return `<svg class="arrow" width="${size}" height="${size * 0.6}" viewBox="0 0 100 60" aria-hidden="true">
    <g${flip} fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">
      <line x1="8" y1="30" x2="88" y2="30"/><polyline points="62,8 88,30 62,52"/>
    </g></svg>`;
}

function flankerStimulus({ congruent, target }) {
  const other = target === "left" ? "right" : "left";
  const outer = congruent ? target : other;
  return `<div class="flanker-row">${[outer, outer, target, outer, outer].map((d) => arrowSvg(d, 64)).join("")}</div>`;
}

function buildFlanker({ practice, form }) {
  const F = CONFIG.FLANKER;
  const choices = [
    { label: arrowSvg("left", 72), value: "left" },
    { label: arrowSvg("right", 72), value: "right" }
  ];

  const trial = (t, i, phase) => ({
    type: jsPsychTouchChoice,
    stimulus: flankerStimulus(t),
    choices,
    correct_value: t.target,
    fixation_ms: F.fixationMs,
    response_window_ms: F.responseWindowMs,
    end_on_response: true,
    feedback: phase === "practice",
    feedback_ms: F.feedbackMs,
    // What the trial was (saved with the response). trial_in_block counts from 1.
    data: { task: "flanker", phase, trial_in_block: i + 1,
            condition: t.congruent ? "congruent" : "incongruent", target: t.target }
  });

  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Arrows</h2>
      <p>A row of five arrows will appear.</p>
      <p>Tap the button that points the same way as the <b>middle arrow</b>.<br>
      Ignore the arrows around it.</p>
      <div class="flanker-example">${flankerStimulus({ congruent: false, target: "right" })}
        <p class="muted">Here the middle arrow points right, so you would tap →.</p></div>
      <p>Be as fast and as accurate as you can.</p>`,
    choices: [practice ? "Start practice" : "Start"],
    data: { task: "instructions" }
  };

  const timeline = [instructions];
  if (practice) {
    timeline.push(...FORMS.practice.flanker.map((t, i) => trial(t, i, "practice")));
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: "<h2>Practice done</h2><p>Now the real task. Same rules, but no feedback.</p>",
      choices: ["Start"],
      data: { task: "instructions" }
    });
  }
  const n = DEV ? CONFIG.DEV.flankerTrials : F.trials;
  timeline.push(...FORMS[form].flanker.slice(0, n).map((t, i) => trial(t, i, "test")));
  return { timeline };
}
