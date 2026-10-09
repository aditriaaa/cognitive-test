/*
 * config.js — every setting that defines the protocol lives here.
 *
 * FREEZE THIS FILE before data collection. If you change anything here after
 * IRB/SRC approval, bump VERSION and log the change in your lab notebook.
 * Every row of every data file records VERSION, so you can always tell which
 * protocol produced which data.
 */
const CONFIG = {
  VERSION: "0.1.0-m1", // milestone 1: launcher + questionnaire + PVT

  PVT: {
    durationSeconds: 180,      // PVT-B length (Basner & Dinges, 2011)
    isiMinMs: 1000,            // random wait before each stimulus: 1–4 s
    isiMaxMs: 4000,
    responseTimeoutMs: 10000,  // no tap within 10 s = recorded as a miss
    feedbackMs: 1000,          // show the participant their RT for 1 s
    falseStartThresholdMs: 100,// taps faster than 100 ms after onset count as false starts
    practiceTrials: 5          // familiarization session only
  },

  // Dev mode (add ?dev=1 to the URL) shortens tasks for quick testing.
  // Every data row records dev=true, so test data can never be mistaken for real data.
  DEV: {
    pvtDurationSeconds: 15
  }
};
