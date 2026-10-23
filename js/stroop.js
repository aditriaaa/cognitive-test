/*
 * stroop.js — builds the Stroop block (inhibitory control; pilot only, as a
 * backup for the flanker).
 *
 * A colour word (RED, GREEN, BLUE, YELLOW) appears in a coloured ink. The
 * participant taps the button with the INK colour and ignores what the word says.
 *   congruent:   RED written in red ink     (easy)
 *   incongruent: RED written in blue ink    (slower: reading gets in the way)
 * Incongruent minus congruent RT = the Stroop effect (computed in the analysis).
 *
 * The answer buttons are colour patches with no words, so answering is about
 * the ink only. Dark background, because yellow text is hard to read on white.
 * NOTE: needs normal colour vision (red/green). The study does not screen for
 * colour blindness yet; see the open questions in CLAUDE.md.
 *
 * Trial order comes from the frozen lists in js/forms.js (form A or B).
 */
function buildStroop({ practice, form }) {
  const S = CONFIG.STROOP;
  const colors = Object.keys(S.colors);   // red, green, blue, yellow (fixed button order)
  const patch = (c) => `<span class="stroop-patch" style="background:${S.colors[c]}"></span>`;
  const choices = colors.map((c) => ({ label: patch(c), value: c }));
  const wordHtml = (word, ink) =>
    `<div class="stroop-word" style="color:${S.colors[ink]}">${word.toUpperCase()}</div>`;

  const trial = (t, i, phase) => ({
    type: jsPsychTouchChoice,
    stimulus: wordHtml(t.word, t.ink),
    choices,
    correct_value: t.ink,
    css_class: "stroop",
    fixation_ms: S.fixationMs,
    response_window_ms: S.responseWindowMs,
    end_on_response: true,
    feedback: phase === "practice",
    feedback_ms: S.feedbackMs,
    data: { task: "stroop", phase, trial_in_block: i + 1, word: t.word, ink: t.ink,
            condition: t.word === t.ink ? "congruent" : "incongruent" }
  });

  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Colours</h2>
      <p>A colour word will appear, written in a coloured ink.</p>
      <p>Tap the button with the <b>colour of the ink</b>. Ignore what the word says.</p>
      <div class="stroop-example">${wordHtml("red", "blue")}
        <p class="muted">Here the ink is blue, so you would tap ${patch("blue")}</p></div>
      <p>Be as fast and as accurate as you can.</p>`,
    choices: [practice ? "Start practice" : "Start"],
    data: { task: "instructions" }
  };

  const timeline = [instructions];
  if (practice) {
    timeline.push(...FORMS.practice.stroop.map((t, i) => trial(t, i, "practice")));
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: "<h2>Practice done</h2><p>Now the real task. Same rules, but no feedback.</p>",
      choices: ["Start"],
      data: { task: "instructions" }
    });
  }
  const n = DEV ? CONFIG.DEV.stroopTrials : S.trials;
  timeline.push(...FORMS[form].stroop.slice(0, n).map((t, i) => trial(t, i, "test")));
  return { timeline };
}
