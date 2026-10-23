/*
 * dsst.js — builds the digit-symbol substitution block (processing speed;
 * DSST-style, Jaeger, 2018).
 *
 * The KEY (digits 1-9, each with a symbol) stays at the top of the screen.
 * A symbol appears in the middle; the participant finds it in the key and taps
 * that symbol's digit on the keypad. The next symbol appears straight away.
 * The block lasts 90 s; the score (computed in the analysis) is the number of
 * correct items.
 *
 * Why "symbol -> tap the digit" and not "digit -> tap the symbol": with the
 * buttons in a fixed order, "digit -> symbol" could be answered by position
 * alone (digit 3 = third button) without looking at any symbol. This way the
 * participant must search the key for the symbol every time.
 *
 * Forms A and B use the same 9 symbols but a different pairing with the digits
 * (no pair shared), plus a separate pairing for practice; see js/forms.js.
 */

// The 9 symbols, drawn as simple line shapes (identical on every device).
const DSST_SYMBOLS = {
  s1: '<circle cx="20" cy="20" r="12"/>',
  s2: '<polygon points="20,7 33,32 7,32"/>',
  s3: '<rect x="8" y="8" width="24" height="24"/>',
  s4: '<line x1="20" y1="6" x2="20" y2="34"/><line x1="6" y1="20" x2="34" y2="20"/>',
  s5: '<line x1="8" y1="8" x2="32" y2="32"/><line x1="32" y1="8" x2="8" y2="32"/>',
  s6: '<polygon points="20,5 35,20 20,35 5,20"/>',
  s7: '<path d="M8 32 V20 A12 12 0 0 1 32 20 V32"/>',
  s8: '<line x1="6" y1="14" x2="34" y2="14"/><line x1="6" y1="26" x2="34" y2="26"/>',
  s9: '<polyline points="6,30 20,10 34,30"/>'
};

function symbolSvg(id, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" fill="none"
    stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${DSST_SYMBOLS[id]}</svg>`;
}

// The key: digits 1-9 on top, each digit's symbol underneath.
function dsstKey(key) {
  return `<div class="dsst-key">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
    `<div class="dsst-cell"><div class="dsst-digit">${d}</div>${symbolSvg(key[d], 40)}</div>`).join("")}</div>`;
}

function buildDsst({ practice, form }) {
  const D = CONFIG.DSST;
  const durationMs = (DEV ? CONFIG.DEV.dsstSeconds : D.durationSeconds) * 1000;
  const keypad = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ label: String(d), value: String(d) }));

  // phase "practice": untimed, feedback. phase "test": the 90 s block.
  // The 90 s clock starts the first time it is read, i.e. at the first test item.
  let blockStart = null;
  const remainingMs = () => {
    if (blockStart === null) blockStart = performance.now();
    return Math.max(0, durationMs - (performance.now() - blockStart));
  };

  const item = (key, digit, i, phase) => ({
    type: jsPsychTouchChoice,
    header: dsstKey(key),
    stimulus: `<div class="dsst-probe">${symbolSvg(key[digit], 110)}</div>`,
    choices: keypad,
    correct_value: String(digit),
    css_class: "dsst",
    end_on_response: true,
    // Test: the last item can only use the time left, so the block ends at exactly 90 s.
    response_window_ms: phase === "test" ? remainingMs : 60000,
    feedback: phase === "practice",
    feedback_ms: D.feedbackMs,
    data: { task: "dsst", phase, item_in_block: i + 1, digit, symbol: key[digit] }
  });

  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Symbols</h2>
      <p>At the top you will see a key: each number from 1 to 9 has its own symbol.</p>
      ${dsstKey(practice ? FORMS.practice.dsst.key : FORMS[form].dsst.key)}
      <p>A symbol will appear in the middle. Find it in the key and <b>tap its number</b> at the bottom.</p>
      <p>Work as <b>quickly and accurately</b> as you can. This lasts ${Math.round(durationMs / 1000)} seconds.</p>`,
    choices: [practice ? "Start practice" : "Start"],
    data: { task: "instructions" }
  };

  const timeline = [instructions];
  if (practice) {
    const P = FORMS.practice.dsst;
    timeline.push(...P.items.map((d, i) => item(P.key, d, i, "practice")));
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: `<h2>Practice done</h2>
        <p>Now the real task. The symbols are paired with different numbers this time:</p>
        ${dsstKey(FORMS[form].dsst.key)}
        <p>Same rules, no feedback. Go as fast as you can without making mistakes.</p>`,
      choices: ["Start"],
      data: { task: "instructions" }
    });
  }
  // Every item is listed, but each one only runs while time is left.
  const F = FORMS[form].dsst;
  timeline.push(...F.items.map((d, i) => ({
    timeline: [item(F.key, d, i, "test")],
    conditional_function: () => blockStart === null || remainingMs() > 0
  })));
  return { timeline };
}
