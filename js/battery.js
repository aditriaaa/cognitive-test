/*
 * battery.js — puts the tasks together in the fixed order from CONFIG.BATTERY,
 * with a timed break between tasks (research plan: "fixed task order,
 * standardized 30-second breaks between tasks").
 *
 * practice: true in the familiarization session (each task starts with a short
 *           practice with feedback, then the real block without feedback).
 * form:     "A" or "B" (which frozen trial order to use, see js/forms.js).
 */
function buildBattery(jsPsych, { practice, form }) {
  const builders = {
    pvt: () => buildPvt(jsPsych, {
      practice, durationSeconds: DEV ? CONFIG.DEV.pvtDurationSeconds : CONFIG.PVT.durationSeconds }),
    nback: () => buildNback({ practice, form }),
    flanker: () => buildFlanker({ practice, form }),
    dsst: () => buildDsst({ practice, form }),
    stroop: () => buildStroop({ practice, form })
  };
  const breakSeconds = DEV ? CONFIG.DEV.breakSeconds : CONFIG.BATTERY.breakSeconds;

  const timeline = [];
  CONFIG.BATTERY.order.forEach((task, i) => {
    if (i > 0) timeline.push(breakScreen(breakSeconds));
    timeline.push(builders[task]());
  });
  return { timeline };
}

// The same fixed-length break between every pair of tasks. It moves on by
// itself, so every participant rests for exactly the same time.
function breakScreen(seconds) {
  let interval;
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Short break</h2>
      <p>Relax for a moment. The next task starts by itself in</p>
      <p class="break-count"><span id="break-left">${seconds}</span> s</p>`,
    choices: [],
    trial_duration: seconds * 1000,
    on_load: () => {
      const end = performance.now() + seconds * 1000;
      interval = setInterval(() => {
        const el = document.getElementById("break-left");
        if (el) el.textContent = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      }, 250);
    },
    on_finish: () => clearInterval(interval),
    data: { task: "break" }
  };
}
