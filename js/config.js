/*
 * config.js — every setting that defines the protocol lives here.
 *
 * FREEZE THIS FILE before data collection. If you change anything here after
 * IRB/SRC approval, bump VERSION and log the change in your lab notebook.
 * Every row of every data file records VERSION, so you can always tell which
 * protocol produced which data.
 */
const CONFIG = {
  VERSION: "0.3.0-m2", // 0.2.0: at-home accounts; 0.2.1: follow-ups only after "Yes", session 1 only; 0.2.2: caffeine detail split into "what" + "how much"; 0.3.0: battery of several tasks (M2, in progress)

  // Which session comes next is worked out automatically from how many
  // sessions the participant has COMPLETED (see nextSession() in main.js):
  //   session 1 = familiarization, then baselines, then the two test sessions.
  SCHEDULE: {
    // Milestone 1: only session 1 (familiarization) is offered. When a
    // participant finishes it, they are told they are done. Raise this number
    // to open later sessions once those milestones are built.
    sessionsAvailable: 1,
    baselineSessions: 5,          // B1–B5 (may become 4 after the pilot)
    minHoursBetweenSessions: 24,  // protocol: sessions at least 24 h apart (not enforced in dev mode)

    // PLACEHOLDER RULES: check these against the research plan before data collection.
    // Form alternates by session number: session 1 = A, 2 = B, 3 = A, ...
    formOrder: ["A", "B"],
    // Test-session order is counterbalanced by participant number:
    // odd codes (P001, P003, ...) get rest first, even codes get fatigue first.
    testOrders: [["test-rest", "test-fatigue"], ["test-fatigue", "test-rest"]]
  },

  PVT: {
    durationSeconds: 180,      // PVT-B length (Basner & Dinges, 2011)
    isiMinMs: 1000,            // random wait before each stimulus: 1–4 s
    isiMaxMs: 4000,
    responseTimeoutMs: 10000,  // no tap within 10 s = recorded as a miss
    feedbackMs: 1000,          // show the participant their RT for 1 s
    falseStartThresholdMs: 100,// taps faster than 100 ms after onset count as false starts
    practiceTrials: 5          // familiarization session only
  },

  // The battery: tasks in a FIXED order (research plan: "fixed task order,
  // standardized 30-second breaks between tasks"). Tasks are added to this list
  // as they are built (M2): DSST and Stroop are still to come.
  // Planned final order: pvt, nback, flanker, dsst, stroop (Stroop: pilot only).
  BATTERY: {
    order: ["pvt", "nback", "flanker"],
    breakSeconds: 30
  },

  // 2-back (n-back paradigm, Owen et al., 2005). Letters appear one at a time;
  // tap MATCH when the letter is the same as the one two letters before.
  // PROPOSED VALUES: the research plan gives only "4 min; d′ and RT". Confirm before the pilot.
  // The letter sequences for forms A and B are pre-generated in js/forms.js.
  NBACK: {
    letters: ["B", "D", "F", "H", "K", "M", "R", "T"], // clearly different shapes
    trials: 90,                // 90 × 2.5 s = 3.75 min
    targets: 27,               // 30% of trials are matches
    practiceTrials: 20,        // familiarization only, with feedback
    practiceTargets: 6,
    letterMs: 500,             // letter visible for 0.5 s ...
    trialMs: 2500,             // ... then blank; a tap counts any time in these 2.5 s
    feedbackMs: 600
  },

  // Flanker (Eriksen & Eriksen, 1974), arrow version for touch screens.
  // PROPOSED VALUES: the research plan gives only "4 min; accuracy and
  // incongruent minus congruent RT cost". Confirm before the pilot.
  // The trial ORDER for forms A and B is pre-generated in js/forms.js.
  FLANKER: {
    trials: 100,               // 50 congruent + 50 incongruent, half pointing each way
    practiceTrials: 12,        // familiarization session only, with feedback
    fixationMs: 500,           // "+" before each row of arrows
    responseWindowMs: 2000,    // no tap within 2 s = no response
    feedbackMs: 800            // practice feedback ("Correct" / "Wrong" / "Too slow")
  },

  // Dev mode (add ?dev=1 to the URL) shortens tasks for quick testing.
  // Every data row records dev=true, so test data can never be mistaken for real data.
  DEV: {
    pvtDurationSeconds: 15,
    breakSeconds: 3,
    flankerTrials: 12,         // first 12 trials of the form
    nbackTrials: 20            // first 20 trials of the form
  }
};
