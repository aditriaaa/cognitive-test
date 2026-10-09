/*
 * plugin-vas.js — a touch-friendly, UNANCHORED visual analogue scale.
 *
 * Why custom? The standard jsPsych slider starts with its handle at a position
 * (usually the middle), which pulls answers toward that spot. Here the line is
 * empty until the participant touches it, there are no ticks or numbers, and
 * Continue stays disabled until a mark has been placed.
 *
 * Data saved: response (0–100, one decimal), rt (ms from scale shown to Continue),
 * n_adjustments (how many times the mark was moved), plus the item name.
 */
var jsPsychVas = (function (jspsych) {
  "use strict";

  const info = {
    name: "vas",
    version: "1.0.0",
    parameters: {
      item: { type: jspsych.ParameterType.STRING, default: undefined },      // short name, e.g. "fatigue_pre"
      question: { type: jspsych.ParameterType.HTML_STRING, default: undefined },
      left_label: { type: jspsych.ParameterType.STRING, default: undefined },
      right_label: { type: jspsych.ParameterType.STRING, default: undefined },
      button_label: { type: jspsych.ParameterType.STRING, default: "Continue" }
    },
    data: {
      item: { type: jspsych.ParameterType.STRING },
      response: { type: jspsych.ParameterType.FLOAT },
      rt: { type: jspsych.ParameterType.INT },
      n_adjustments: { type: jspsych.ParameterType.INT }
    }
  };

  class VasPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }

    trial(display_element, trial) {
      display_element.innerHTML = `
        <div class="vas-wrap">
          <div class="vas-question">${trial.question}</div>
          <div class="vas-track" id="vas-track">
            <div class="vas-line"></div>
            <div class="vas-end vas-end-left"></div>
            <div class="vas-end vas-end-right"></div>
            <div class="vas-mark" id="vas-mark" hidden></div>
          </div>
          <div class="vas-labels">
            <span>${trial.left_label}</span><span>${trial.right_label}</span>
          </div>
          <button class="jspsych-btn big-btn" id="vas-continue" disabled>${trial.button_label}</button>
        </div>`;

      const track = display_element.querySelector("#vas-track");
      const mark = display_element.querySelector("#vas-mark");
      const btn = display_element.querySelector("#vas-continue");
      const start = performance.now();
      let value = null;
      let adjustments = 0;
      let dragging = false;

      const place = (clientX) => {
        const r = track.getBoundingClientRect();
        const pct = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
        value = Math.round(pct * 10) / 10;
        mark.style.left = pct + "%";
        mark.hidden = false;
        btn.disabled = false;
      };

      // Pointer events cover touch, Apple Pencil and mouse with one code path.
      track.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        dragging = true;
        adjustments++;
        track.setPointerCapture(e.pointerId);
        place(e.clientX);
      });
      track.addEventListener("pointermove", (e) => { if (dragging) place(e.clientX); });
      track.addEventListener("pointerup", () => { dragging = false; });
      track.addEventListener("pointercancel", () => { dragging = false; });

      btn.addEventListener("click", () => {
        this.jsPsych.finishTrial({
          item: trial.item,
          response: value,
          rt: Math.round(performance.now() - start),
          n_adjustments: adjustments
        });
      });
    }
  }
  VasPlugin.info = info;
  return VasPlugin;
})(jsPsychModule);
