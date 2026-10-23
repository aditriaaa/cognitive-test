/*
 * plugin-touch-choice.js — one trial of "show a stimulus, tap a button".
 * Shared by the flanker, 2-back and Stroop tasks.
 *
 * Each trial:
 *   1. Optional fixation cross (fixation_ms).
 *   2. The stimulus appears. Its onset is the requestAnimationFrame timestamp
 *      of the frame it is drawn on (same method as the PVT).
 *   3. The participant taps one of the buttons. The tap is timed on
 *      "pointerdown" (finger touches the glass), not "click" (finger lifts).
 *   4. The trial ends:
 *        - at the first tap, if end_on_response is true (flanker, Stroop), or
 *        - after trial_ms in total, whatever happens (2-back: fixed pace).
 *      If nobody taps within response_window_ms, the response is null.
 *   5. Practice only: feedback ("Correct" / "Wrong" / "Too slow") for feedback_ms
 *      (skipped when not tapping was correct: nothing happened, nothing to say).
 *
 * Only the FIRST tap counts; later taps in the same trial are ignored.
 * `header` is shown above the stimulus from the start and is NOT part of the
 * timed stimulus (DSST: the digit-symbol key that stays on screen).
 *
 * Saved per trial (plus whatever the task puts in `data`, e.g. condition):
 *   response      value of the button tapped, or null (no tap)
 *   correct       true/false. correct_value null means "not tapping is correct"
 *                 (2-back: a letter that is not a match).
 *   rt            ms from stimulus onset to the tap, or null
 *   pointer_type  "touch", "mouse" or "pen" (at home, devices differ)
 */
var jsPsychTouchChoice = (function (jspsych) {
  "use strict";

  const info = {
    name: "touch-choice",
    version: "1.0.0",
    parameters: {
      stimulus: { type: jspsych.ParameterType.HTML_STRING, default: "" },
      // [{ label: "<html>", value: "left" }, ...], shown as big buttons in a row.
      choices: { type: jspsych.ParameterType.COMPLEX, default: [] },
      correct_value: { type: jspsych.ParameterType.STRING, default: null },
      fixation_ms: { type: jspsych.ParameterType.INT, default: 0 },
      stimulus_ms: { type: jspsych.ParameterType.INT, default: null },      // null = stays up
      response_window_ms: { type: jspsych.ParameterType.INT, default: 2000 },
      end_on_response: { type: jspsych.ParameterType.BOOL, default: true },
      trial_ms: { type: jspsych.ParameterType.INT, default: null },         // fixed-pace trials only
      feedback: { type: jspsych.ParameterType.BOOL, default: false },
      feedback_ms: { type: jspsych.ParameterType.INT, default: 800 },
      header: { type: jspsych.ParameterType.HTML_STRING, default: "" },  // always visible (DSST key)
      css_class: { type: jspsych.ParameterType.STRING, default: "" }     // per-task look (e.g. "stroop")
    },
    data: {
      response: { type: jspsych.ParameterType.STRING },
      correct: { type: jspsych.ParameterType.BOOL },
      rt: { type: jspsych.ParameterType.FLOAT },
      pointer_type: { type: jspsych.ParameterType.STRING }
    }
  };

  class TouchChoicePlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }

    trial(display_element, trial) {
      display_element.innerHTML = `
        <div class="tc-area ${trial.css_class}">
          ${trial.header ? `<div class="tc-header">${trial.header}</div>` : ""}
          <div class="tc-stage">
            <div class="tc-fixation" id="tc-fixation">+</div>
            <div class="tc-stimulus" id="tc-stimulus" style="visibility:hidden">${trial.stimulus}</div>
            <div class="tc-feedback" id="tc-feedback"></div>
          </div>
          <div class="tc-buttons">
            ${trial.choices.map((c, i) =>
              `<button type="button" class="tc-btn" data-i="${i}">${c.label}</button>`).join("")}
          </div>
        </div>`;
      const fixation = display_element.querySelector("#tc-fixation");
      const stimulus = display_element.querySelector("#tc-stimulus");
      const feedback = display_element.querySelector("#tc-feedback");
      const buttons = [...display_element.querySelectorAll(".tc-btn")];

      let onset = null;      // stimulus onset (rAF timestamp), null until drawn
      let response = null;   // { value, rt, pointer_type } of the first tap
      let timers = [];
      let done = false;
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));

      const result = () => {
        const value = response ? response.value : null;
        return {
          response: value,
          correct: value === trial.correct_value,
          rt: response ? response.rt : null,
          pointer_type: response ? response.pointer_type : null
        };
      };

      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        timers = [];
        buttons.forEach((b) => b.removeEventListener("pointerdown", onTap));
        const data = result();
        // No feedback when there is nothing to say: not tapping was the right
        // thing to do (2-back non-match), so just move on.
        const quietlyRight = data.response === null && trial.correct_value === null;
        if (!trial.feedback || quietlyRight) return this.jsPsych.finishTrial(data);
        // Practice: say how it went, then move on.
        stimulus.style.visibility = "hidden";
        const tooSlow = data.response === null && trial.correct_value !== null;
        feedback.textContent = tooSlow ? "Too slow" : data.correct ? "Correct" : "Wrong";
        feedback.className = "tc-feedback " + (data.correct ? "tc-good" : "tc-bad");
        setTimeout(() => this.jsPsych.finishTrial(data), trial.feedback_ms);
      };

      const onTap = (e) => {
        e.preventDefault();
        const t = performance.now();
        if (onset === null || response !== null) return; // before the stimulus, or not the first tap
        if (t - onset > trial.response_window_ms) return; // too late to count
        const choice = trial.choices[Number(e.currentTarget.dataset.i)];
        response = { value: choice.value, rt: Math.round((t - onset) * 10) / 10, pointer_type: e.pointerType };
        e.currentTarget.classList.add("tc-pressed");
        if (trial.end_on_response) finish();
      };
      buttons.forEach((b) => b.addEventListener("pointerdown", onTap));

      const showStimulus = () => {
        requestAnimationFrame((frameTime) => {
          fixation.style.visibility = "hidden";
          stimulus.style.visibility = "visible";
          onset = frameTime;
          if (trial.stimulus_ms !== null) later(() => { stimulus.style.visibility = "hidden"; }, trial.stimulus_ms);
          // No tap in time: response stays null. Fixed-pace trials still run to trial_ms.
          later(() => { if (trial.trial_ms === null) finish(); }, trial.response_window_ms);
          if (trial.trial_ms !== null) later(finish, trial.trial_ms);
        });
      };

      if (trial.fixation_ms > 0) later(showStimulus, trial.fixation_ms);
      else { fixation.style.visibility = "hidden"; showStimulus(); }
    }
  }
  TouchChoicePlugin.info = info;
  return TouchChoicePlugin;
})(jsPsychModule);
