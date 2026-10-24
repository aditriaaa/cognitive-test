/*
 * config.js — every setting that defines the protocol lives here.
 *
 * FREEZE THIS FILE before data collection. If you change anything here after
 * IRB/SRC approval, bump VERSION and log the change in your lab notebook.
 * Every row of every data file records VERSION, so you can always tell which
 * protocol produced which data.
 */
const CONFIG = {
  VERSION: "0.4.0-m3", // 0.2.0: at-home accounts; 0.2.1: follow-ups only after "Yes", session 1 only; 0.2.2: caffeine detail split into "what" + "how much"; 0.3.0: battery of several tasks (M2, in progress); 0.3.1: intake asks about colour blindness, flanker 220 trials (~4 min); 0.4.0: TloadDback calibration (end of B4, B5) + 16-min fatigue task, test order random in blocks of 4 (M3, in progress)

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

    // PLACEHOLDER RULE: check against the research plan before data collection.
    // Form alternates by session number: session 1 = A, 2 = B, 3 = A, ...
    formOrder: ["A", "B"],
    // Test-session order: random in blocks of 4 (research plan), pre-generated
    // in js/forms.js (TEST_ORDER) for participant numbers 1 to maxParticipants.
    maxParticipants: 400
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
  // as they are built (M2). Stroop is in the pilot only; the main study keeps
  // the 4 most reliable tasks (ICC >= 0.6).
  BATTERY: {
    order: ["pvt", "nback", "flanker", "dsst", "stroop"],
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
    trials: 220,               // ~4 min (research plan): 55 of each congruent/incongruent x left/right.
                               // Each trial ~1.05-1.1 s (0.5 s cross + typical 0.5-0.6 s response).
    practiceTrials: 12,        // familiarization session only, with feedback
    fixationMs: 500,           // "+" before each row of arrows
    responseWindowMs: 2000,    // no tap within 2 s = no response
    feedbackMs: 800            // practice feedback ("Correct" / "Wrong" / "Too slow")
  },

  // Digit-symbol substitution (DSST-style; Jaeger, 2018).
  // The key (digits 1-9, each paired with a symbol) stays on screen. A symbol
  // appears; the participant finds it in the key and taps its digit.
  // Score (analysis): correct items in 90 s.
  // PROPOSED VALUES: the research plan gives only "2 min; correct items per 90 s".
  // Symbol pairings and item order for forms A and B are in js/forms.js.
  DSST: {
    durationSeconds: 90,
    items: 198,                // 22 of each digit; more than anyone can do in 90 s
    practiceItems: 9,          // each digit once; familiarization only, untimed, with feedback
    feedbackMs: 600
  },

  // Stroop (pilot only; backup for the flanker). A colour word appears in a
  // coloured ink; tap the INK colour. Incongruent minus congruent RT = Stroop effect.
  // PROPOSED VALUES: not in the research plan yet. Confirm before the pilot.
  STROOP: {
    colors: { red: "#e53935", green: "#43a047", blue: "#1e88e5", yellow: "#fdd835" },
    trials: 96,                // 48 congruent (12 per colour) + 48 incongruent (each word/ink pair 4 times)
    practiceTrials: 16,        // 8 congruent + 8 incongruent
    fixationMs: 500,
    responseWindowMs: 2000,
    feedbackMs: 800
  },

  // TloadDback: the 16-min cognitive-fatigue task for the T-fatigue session
  // (Borragan et al., 2016; calibration as in the 2025 TloadDback calibration
  // study, PMC12330871). Letters and digits alternate on screen:
  //   letter -> tap SAME if it is the same as the previous letter (1-back)
  //   digit  -> tap ODD or EVEN (parity)
  // The pace ("STD": ms per item) is set per person by a calibration at the end
  // of the LAST TWO baseline sessions (B4 and B5, after the battery); the
  // T-fatigue session uses the faster pace that passed (2 calibrations, as the
  // 2025 study recommends). Item streams are pre-generated in js/forms.js.
  TLOAD: {
    letters: ["A", "C", "E", "L", "N", "P", "R", "T", "U"],   // as in the 2025 study
    digits: [1, 2, 3, 4, 6, 7, 8, 9],                          // 1-9 without 5
    letterTargetRate: 0.25,       // 1 in 4 letters repeats the previous letter (PROPOSAL; not in the papers)
    weights: { letters: 0.65, digits: 0.35 },   // weighted accuracy, as in the papers
    blankMs: 100,                 // each item blanks for its last 100 ms, so a repeated character is visibly new
    // Familiarization (first calibration session only)
    familiarizationStdMs: 1500,
    singleTaskItems: 30,          // letters-only block, then digits-only block
    dualBlockItems: 60,           // 30 letters + 30 digits (also the calibration block size)
    familiarizationMaxDualBlocks: 5,
    // Calibration: start at 1400 ms; each block passed -> 100 ms faster. After the
    // first failed block, go back to the last speed passed and repeat it until it
    // has been passed 3 times (a failure there -> 100 ms slower). Result = that speed.
    calibrationStartStdMs: 1400,
    stepMs: 100,
    passAccuracy: 0.85,           // weighted accuracy needed to pass a block
    passesNeeded: 3,
    minStdMs: 400,                // fastest pace ever used
    maxStdMs: 1500,               // slowest; if even this is not passed, "calibrated: false" (not excluded by the app)
    maxCalibrationBlocks: 16,     // safety limit (~15 min)
    // The fatigue task itself
    mainMinutes: 16,
    chunkSeconds: 120,            // saved in 2-min chunks (one data row each, every item inside)
    // Prespecified compliance rule (applied in the ANALYSIS, recorded here):
    // the T-fatigue session counts only if weighted accuracy over the 16 min is
    // at least 70% and there is no 2-minute stretch without a single tap.
    compliance: { minWeightedAccuracy: 0.70, maxSecondsWithoutTap: 120 }
  },

  // Dev mode (add ?dev=1 to the URL) shortens tasks for quick testing.
  // Every data row records dev=true, so test data can never be mistaken for real data.
  DEV: {
    pvtDurationSeconds: 15,
    breakSeconds: 3,
    flankerTrials: 12,         // first 12 trials of the form
    nbackTrials: 20,           // first 20 trials of the form
    dsstSeconds: 20,
    stroopTrials: 12,
    tloadBlockItems: 12,       // familiarization/calibration blocks of 12 instead of 30/60
    tloadMainSeconds: 40,      // fatigue task 40 s instead of 16 min ...
    tloadChunkSeconds: 20      // ... in 20 s chunks
  }
};
