/*
 * plugin-rest-video.js — the T-rest condition: watch a neutral nature video.
 *
 * A plain HTML <video> player (no YouTube, no ads, no tracking). The video
 * file streams from Wikimedia Commons, which allows this; only the first
 * watch_seconds are played. Settings and the video's licence: CONFIG.REST_VIDEO.
 *
 *   1. The video loads; a "Start video" button appears when it can play.
 *      (iPads only let video with sound start from a tap.)
 *   2. It plays from start_seconds. A transparent layer covers it, so taps
 *      can't pause it. If it pauses anyway (e.g. the app was hidden), it resumes.
 *   3. The trial ends when the VIDEO reaches start_seconds + watch_seconds
 *      (16:00). Counting video time means loading pauses don't shorten what
 *      the participant sees.
 *   4. Safety net: if it can't play (no internet), the trial ends after
 *      max_wall_minutes and says why.
 *
 * `sources` lists versions of the video, best first; the browser plays the
 * first one it supports (recorded as `video_source`).
 *
 * Saved (one row): seconds of video watched, real seconds taken, how it
 * ended, which file played, number of pauses/loading stalls, seconds the app
 * was hidden, any error, and a log of player events.
 */
var jsPsychRestVideo = (function (jspsych) {
  "use strict";

  const info = {
    name: "rest-video",
    version: "2.0.0",
    parameters: {
      sources: { type: jspsych.ParameterType.COMPLEX, default: [] },   // [{ src, type }], best first
      start_seconds: { type: jspsych.ParameterType.INT, default: 0 },
      watch_seconds: { type: jspsych.ParameterType.INT, default: 960 },
      max_wall_minutes: { type: jspsych.ParameterType.INT, default: 30 },
      credit: { type: jspsych.ParameterType.HTML_STRING, default: "" }    // licence attribution, shown under the video
    },
    data: {
      video_source: { type: jspsych.ParameterType.STRING },
      video_seconds_watched: { type: jspsych.ParameterType.FLOAT },
      wall_seconds: { type: jspsych.ParameterType.FLOAT },
      ended_by: { type: jspsych.ParameterType.STRING },
      n_pauses: { type: jspsych.ParameterType.INT },
      n_stalls: { type: jspsych.ParameterType.INT },
      hidden_seconds: { type: jspsych.ParameterType.FLOAT },
      error: { type: jspsych.ParameterType.STRING },
      events: { type: jspsych.ParameterType.COMPLEX }
    }
  };

  class RestVideoPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }

    trial(display_element, trial) {
      // The browser plays the first source it supports.
      const playable = trial.sources.find((s) => document.createElement("video").canPlayType(s.type)) || trial.sources[0];
      display_element.innerHTML = `
        <div class="rv-area">
          <div class="rv-frame">
            <video id="rv-video" playsinline preload="auto" src="${playable.src}#t=${trial.start_seconds}"></video>
            <div class="rv-shield"></div>
          </div>
          <div class="rv-bar">
            <p id="rv-msg">Loading the video...</p>
            <button type="button" class="jspsych-btn big-btn" id="rv-start" hidden>Start video</button>
            <p class="rv-credit">${trial.credit}</p>
          </div>
        </div>`;
      const video = display_element.querySelector("#rv-video");
      const msg = display_element.querySelector("#rv-msg");
      const startBtn = display_element.querySelector("#rv-start");

      const t0 = performance.now();
      const since = () => Math.round(performance.now() - t0) / 1000;   // seconds since the trial began
      const events = [];
      const log = (what) => events.push([since(), what]);
      const endAt = trial.start_seconds + trial.watch_seconds;
      let started = false, done = false, nPauses = 0, nStalls = 0, error = null;
      let hiddenSince = null, hiddenMs = 0, wallTimer = null;

      const watched = () => Math.max(0, Math.min(trial.watch_seconds, video.currentTime - trial.start_seconds));

      const onVisibility = () => {
        if (document.hidden) { hiddenSince = performance.now(); log("app hidden"); }
        else if (hiddenSince !== null) {
          hiddenMs += performance.now() - hiddenSince; hiddenSince = null; log("app visible");
          if (started && !done) video.play().catch(() => {});
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      const finish = (endedBy) => {
        if (done) return;
        done = true;
        clearTimeout(wallTimer);
        document.removeEventListener("visibilitychange", onVisibility);
        if (hiddenSince !== null) hiddenMs += performance.now() - hiddenSince;
        const seconds = Math.round(watched() * 10) / 10;
        video.pause();
        video.removeAttribute("src"); video.load();      // stop downloading
        log("end: " + endedBy);
        this.jsPsych.finishTrial({
          video_source: playable.src,
          video_seconds_watched: seconds,
          wall_seconds: since(),
          ended_by: endedBy,
          n_pauses: nPauses,
          n_stalls: nStalls,
          hidden_seconds: Math.round(hiddenMs / 100) / 10,
          error,
          events
        });
      };

      // Safety net: never wait longer than max_wall_minutes.
      wallTimer = setTimeout(() => finish("time limit (video could not finish)"), trial.max_wall_minutes * 60000);

      video.addEventListener("canplay", () => {
        if (started || !startBtn.hidden) return;
        log("ready");
        const m = Math.round(trial.watch_seconds / 60);
        const length = m >= 1 ? `${m} minute${m === 1 ? "" : "s"}` : `${trial.watch_seconds} seconds`;
        msg.textContent = `Sit back and watch. The video lasts ${length} and the task continues by itself afterwards.`;
        startBtn.hidden = false;
      });
      video.addEventListener("playing", () => log("playing"));
      video.addEventListener("waiting", () => { if (started) { nStalls++; log("loading"); } });
      video.addEventListener("pause", () => {
        if (!started || done) return;
        nPauses++; log("paused");
        setTimeout(() => { if (!done && !document.hidden) video.play().catch(() => {}); }, 500);   // keep it playing
      });
      video.addEventListener("timeupdate", () => { if (video.currentTime >= endAt) finish("reached the end point"); });
      video.addEventListener("ended", () => finish("video ended early"));
      video.addEventListener("error", () => {
        error = video.error ? `code ${video.error.code}` : "unknown";
        log("error " + error);
        msg.textContent = "The video could not be played. Please check your internet connection.";
      });

      startBtn.addEventListener("click", () => {
        startBtn.hidden = true;
        msg.textContent = "";
        started = true;
        log("start tapped");
        video.play().catch((e) => { log("play refused: " + e.name); started = false; startBtn.hidden = false; });
      });
    }
  }
  RestVideoPlugin.info = info;
  return RestVideoPlugin;
})(jsPsychModule);
