/*
 * nback.js — builds the 2-back block (working memory; n-back paradigm, Owen et al., 2005).
 *
 * Letters appear one at a time, each for 0.5 s, then a blank, one every 2.5 s.
 * The participant taps MATCH when the letter is the same as the one TWO
 * letters before, and does nothing otherwise:
 *     B   K   B   F   H   F   F ...
 *             ↑ match     ↑ match
 * Outputs (computed later, in the analysis): d′ from hits (tapped on a match)
 * vs. false alarms (tapped on a non-match), and RT on hits.
 *
 * Fixed pace: every trial lasts exactly 2.5 s whether or not anyone taps, so
 * the task takes the same time for everyone.
 *
 * Letter sequences come from the frozen lists in js/forms.js (form A or B).
 */
function buildNback({ practice, form }) {
  const N = CONFIG.NBACK;
  const choices = [{ label: "MATCH", value: "match" }];

  const trial = (t, i, phase) => ({
    type: jsPsychTouchChoice,
    stimulus: `<div class="nback-letter">${t.letter}</div>`,
    choices,
    correct_value: t.target ? "match" : null,   // null: not tapping is correct
    stimulus_ms: N.letterMs,
    trial_ms: N.trialMs,
    response_window_ms: N.trialMs,              // a tap counts until the next letter
    end_on_response: false,                     // fixed pace
    feedback: phase === "practice",
    feedback_ms: N.feedbackMs,
    data: { task: "nback", phase, trial_in_block: i + 1, letter: t.letter, target: t.target }
  });

  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Letters</h2>
      <p>Letters will appear one at a time.</p>
      <p>Tap <b>MATCH</b> when a letter is the same as the one <b>two letters before</b>.<br>
      Otherwise, don't tap.</p>
      <div class="nback-example">
        <span>B</span><span>K</span><span class="hit">B</span><span>F</span><span>H</span><span class="hit">F</span>
        <p class="muted">Here you would tap MATCH on the second B and the second F.</p>
      </div>
      <p>The letters keep coming at a steady pace. Be as accurate as you can.</p>`,
    choices: [practice ? "Start practice" : "Start"],
    data: { task: "instructions" }
  };

  const timeline = [instructions];
  if (practice) {
    timeline.push(...FORMS.practice.nback.map((t, i) => trial(t, i, "practice")));
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: "<h2>Practice done</h2><p>Now the real task. Same rules, but no feedback.</p>",
      choices: ["Start"],
      data: { task: "instructions" }
    });
  }
  const n = DEV ? CONFIG.DEV.nbackTrials : N.trials;
  timeline.push(...FORMS[form].nback.slice(0, n).map((t, i) => trial(t, i, "test")));
  return { timeline };
}
