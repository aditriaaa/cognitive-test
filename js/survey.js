/*
 * survey.js — the questionnaires.
 *
 * Wording here must stay IDENTICAL across sessions. If you reword an item,
 * bump CONFIG.VERSION and get the change approved first.
 *
 * Answers are saved in the "response" column: as JSON for the factual items
 * (one row for the whole form), as a 0–100 number for VAS items (one row per item).
 * Intake answers are saved with the account instead (participants/{code}.intake).
 */

// One-time intake questions, asked once on the "Create account" page
// (see js/main.js). The wording lives here so it is never changed by accident.
const INTAKE_FORM_HTML = `
      <div class="form">
        <label>Age (years)
          <input name="age" type="number" inputmode="numeric" min="10" max="99" required></label>

        <label>Which hand do you write with?
          <select name="handedness" required>
            <option value="" disabled selected>Choose…</option>
            <option>Right</option><option>Left</option><option>Either</option>
          </select></label>

        <label>Have you done brain-training games or cognitive tests before?
          <select name="prior_cognitive_tests" required>
            <option value="" disabled selected>Choose…</option>
            <option>None</option><option>Some</option><option>A lot</option>
          </select></label>

        <label>About how many hours per week do you play video games?
          <input name="video_game_hours_week" type="number" inputmode="decimal" min="0" max="100" step="0.5" required></label>

        <label>On a typical school night, how many hours do you sleep?
          <input name="typical_sleep_hours" type="number" inputmode="decimal" min="0" max="14" step="0.5" required></label>

        <label>Do you need glasses or contacts to see a screen clearly?
          <select name="needs_glasses" required>
            <option value="" disabled selected>Choose…</option>
            <option>Yes</option><option>No</option>
          </select></label>

        <!-- Added in 0.3.1: the Stroop task needs normal colour vision (red/green). -->
        <label>Are you colour-blind? (Do you have trouble telling some colours apart, such as red and green?)
          <select name="colour_blind" required>
            <option value="" disabled selected>Choose…</option>
            <option>No</option><option>Yes</option><option>Not sure</option>
          </select></label>
      </div>`;

// Follow-up questions: a <label data-show-if="caffeine_4h=Yes"> is only shown
// while the question named caffeine_4h is answered "Yes". If the answer changes
// back, the follow-up is hidden AND emptied, so a "No" can never be saved
// together with a caffeine amount. Hidden follow-ups are saved as "".
function showFollowUps(form) {
  const followUps = [...form.querySelectorAll("[data-show-if]")];
  const update = () => {
    for (const label of followUps) {
      const [name, value] = label.dataset.showIf.split("=");
      const show = form.elements[name].value === value;
      label.hidden = !show;
      if (!show) label.querySelectorAll("input, select, textarea").forEach((el) => { el.value = ""; });
    }
  };
  form.addEventListener("change", update);
  update();
}

// Factual pre-session items: every session.
function preSessionFacts() {
  return {
    type: jsPsychSurveyHtmlForm,
    preamble: "<h2>Before we start</h2><p>Please answer honestly. There are no right or wrong answers.</p>",
    html: `
      <div class="form">
        <label>How many hours did you sleep last night?
          <input name="sleep_hours" type="number" inputmode="decimal" min="0" max="16" step="0.5" required></label>

        <label>Have you had caffeine (coffee, tea, soda, energy drink) in the last 4 hours?
          <select name="caffeine_4h" required>
            <option value="" disabled selected>Choose…</option>
            <option>No</option><option>Yes</option>
          </select></label>

        <!-- Follow-up: only shown when the answer above is "Yes" (see showFollowUps). -->
        <label data-show-if="caffeine_4h=Yes" hidden>What did you have? (be as specific as possible)
          <input name="caffeine_what" type="text" maxlength="80"></label>

        <label data-show-if="caffeine_4h=Yes" hidden>About how much?
          <input name="caffeine_amount" type="text" maxlength="40"></label>

        <label>When did you last eat?
          <select name="last_meal" required>
            <option value="" disabled selected>Choose…</option>
            <option>Less than 1 hour ago</option>
            <option>1 to 3 hours ago</option>
            <option>More than 3 hours ago</option>
          </select></label>

        <label>Have you done hard exercise in the last 2 hours?
          <select name="exercise_2h" required>
            <option value="" disabled selected>Choose…</option>
            <option>No</option><option>Yes</option>
          </select></label>

        <label>Are you feeling unwell today? (no details needed)
          <select name="unwell_today" required>
            <option value="" disabled selected>Choose…</option>
            <option>No</option><option>Yes</option>
          </select></label>

        <label>Is anything unusual happening today that might affect your focus?
          <select name="unusual_day" required>
            <option value="" disabled selected>Choose…</option>
            <option>No</option><option>Yes</option>
          </select></label>

        <!-- Follow-up: only shown when the answer above is "Yes". -->
        <label data-show-if="unusual_day=Yes" hidden>What is unusual? A few words (optional)
          <input name="unusual_day_note" type="text" maxlength="120"></label>
      </div>`,
    button_label: "Continue",
    on_load: () => showFollowUps(document.querySelector("#jspsych-survey-html-form")),
    data: { task: "presession_facts" }
  };
}

// VAS helper: keeps wording and labels in one place.
function vas(item, question, left, right) {
  return {
    type: jsPsychVas,
    item, question, left_label: left, right_label: right,
    data: { task: "vas" }
  };
}

const VAS_INSTRUCTIONS = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `<h2>Rating scales</h2>
    <p>Next you'll see a few lines like this one.</p>
    <p>Tap anywhere on the line to show how you feel <b>right now</b>.<br>
    You can drag the mark to adjust it before tapping Continue.</p>
    <p>There are no numbers on purpose. Just go with your first sense.</p>`,
  choices: ["Got it"],
  data: { task: "instructions" }
};

function preSessionVas() {
  return [
    vas("sleep_quality", "How well did you sleep last night?", "Very poorly", "Very well"),
    vas("fatigue_pre", "How mentally tired do you feel right now?", "Not at all tired", "Extremely tired"),
    vas("motivation_pre", "How motivated do you feel to do these tasks right now?", "Not at all motivated", "Extremely motivated"),
    vas("stress_pre", "How stressed do you feel right now?", "Not at all stressed", "Extremely stressed")
  ];
}

// Test sessions only: right after the fatigue task or the video (manipulation check).
function postManipulationVas() {
  return vas("fatigue_post_manipulation", "How mentally tired do you feel right now?", "Not at all tired", "Extremely tired");
}

// End of every session.
function postSessionVas() {
  return [
    vas("effort_post", "How hard did you try on the tasks you just did?", "Didn't try at all", "Tried my hardest"),
    vas("distraction_post", "How distracted were you during the tasks?", "Not at all distracted", "Extremely distracted")
  ];
}
