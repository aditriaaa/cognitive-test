/*
 * plugin-pvt-touch.js — one trial of a touch-screen Psychomotor Vigilance Test.
 *
 * Each trial:
 *   1. Blank screen with a fixation box for a random wait (isi_ms).
 *   2. A millisecond counter appears and starts counting up.
 *   3. The participant taps anywhere as fast as possible.
 *   4. The counter freezes on their reaction time for a moment (feedback).
 *
 * TIMING NOTES (worth understanding for judges):
 *   - Stimulus onset is taken from requestAnimationFrame, i.e. the frame on
 *     which the counter is drawn, not the moment the code asked for it.
 *   - The tap is timed with performance.now() inside a "pointerdown" handler.
 *     pointerdown fires when the finger touches the glass; "click" fires later,
 *     on release, and would add 50–150 ms of noise.
 *   - Browser + touchscreen add a fairly constant delay. Because every analysis
 *     compares a person with themselves on the SAME device model, a constant
 *     delay cancels out. Document it as a limitation anyway.
 *
 * Outcomes saved in "outcome":
 *   response        normal tap after onset
 *   false_start     tap < false_start_threshold_ms after onset (anticipation)
 *   false_start_isi tap during the wait, before anything appeared
 *   miss            no tap within response_timeout_ms
 */
var jsPsychPvtTouch = (function (jspsych) {
  "use strict";

  const info = {
    name: "pvt-touch",
    version: "1.0.0",
    parameters: {
      isi_ms: { type: jspsych.ParameterType.INT, default: 2000 },
      response_timeout_ms: { type: jspsych.ParameterType.INT, default: 10000 },
      feedback_ms: { type: jspsych.ParameterType.INT, default: 1000 },
      false_start_threshold_ms: { type: jspsych.ParameterType.INT, default: 100 }
    },
    data: {
      isi_ms: { type: jspsych.ParameterType.INT },
      rt: { type: jspsych.ParameterType.FLOAT },
      outcome: { type: jspsych.ParameterType.STRING },
      pointer_type: { type: jspsych.ParameterType.STRING }
    }
  };

  class PvtTouchPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }

    trial(display_element, trial) {
      display_element.innerHTML = `
        <div class="pvt-area" id="pvt-area">
          <div class="pvt-box"><span id="pvt-counter" class="pvt-counter"></span></div>
          <div class="pvt-hint" id="pvt-hint">Tap anywhere as soon as numbers appear</div>
        </div>`;
      const area = display_element.querySelector("#pvt-area");
      const counter = display_element.querySelector("#pvt-counter");
      const hint = display_element.querySelector("#pvt-hint");

      let phase = "wait";   // wait -> stimulus -> feedback
      let onset = null;
      let rafId = null;
      let timers = [];
      let done = false;

      const finish = (data) => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        cancelAnimationFrame(rafId);
        area.removeEventListener("pointerdown", onTap);
        this.jsPsych.finishTrial({ isi_ms: trial.isi_ms, ...data });
      };

      const showFeedback = (text, data) => {
        phase = "feedback";
        cancelAnimationFrame(rafId);
        counter.textContent = text;
        timers.push(setTimeout(() => finish(data), trial.feedback_ms));
      };

      const tick = (now) => {
        counter.textContent = String(Math.floor(now - onset));
        rafId = requestAnimationFrame(tick);
      };

      const onTap = (e) => {
        e.preventDefault();
        const t = performance.now();
        if (phase === "wait") {
          timers.forEach(clearTimeout);
          showFeedback("Too soon!", { rt: null, outcome: "false_start_isi", pointer_type: e.pointerType });
        } else if (phase === "stimulus") {
          const rt = Math.round((t - onset) * 10) / 10;
          const outcome = rt < trial.false_start_threshold_ms ? "false_start" : "response";
          showFeedback(String(Math.floor(rt)), { rt, outcome, pointer_type: e.pointerType });
        }
      };
      area.addEventListener("pointerdown", onTap);

      // After the random wait, draw the counter and start timing on that frame.
      timers.push(setTimeout(() => {
        if (phase !== "wait") return;
        rafId = requestAnimationFrame((frameTime) => {
          phase = "stimulus";
          hint.style.visibility = "hidden";
          onset = frameTime;
          tick(frameTime);
        });
        timers.push(setTimeout(() => {
          if (phase === "stimulus") showFeedback("Missed", { rt: null, outcome: "miss", pointer_type: null });
        }, trial.response_timeout_ms));
      }, trial.isi_ms));
    }
  }
  PvtTouchPlugin.info = info;
  return PvtTouchPlugin;
})(jsPsychModule);
