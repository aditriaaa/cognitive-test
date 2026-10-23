# CLAUDE.md — Cognitive Battery (ISEF project)

Context for any Claude session working in this repo. Read this first.

## Who and what

- Student researcher: Abhi. This is a science-fair (ISEF-track) human-participants study.
- This repo is the **testing software**: a browser-based cognitive battery built with **jsPsych 8**, done **at home by each participant on their own device** (changed 2026-10-09 from in-person district iPads; see Technical decisions), developed on a MacBook.
- Full research plan (the source of truth for the protocol): https://claude.ai/code/artifact/583df1ea-9b84-4588-a00a-00d472274f77
- Abhi is still learning the code and the stats. **Explain changes in plain language, comment the code well, and make sure he can answer a judge's question about any part of it.** AI assistance must be disclosed on his fair forms and in his methods, so be transparent about what was generated.

## The study in one paragraph

Does comparing a person to their own past performance detect a real change in cognitive performance better than comparing them to everyone else, and how many baseline sessions does that take? Participants do a familiarization session, several baseline sessions, then two test sessions in counterbalanced order: one rested (watch a neutral 16-min video) and one after a 16-min cognitive-fatigue task (TloadDback). Four detectors (population norms, Reliable Change Index, individual baseline, Bayesian hierarchical/partial pooling) classify each test session as changed or not. Primary outcome: ROC AUC. Secondary: number of baseline sessions needed. Planned extra analysis: synthetic change injection into rested-session data.

## Hard rules (scientific integrity)

1. **No participant data before IRB/SRC approval.** That includes the pilot. Software can be built and tested on Abhi himself / simulated data only, and that data must be flagged (dev mode).
2. **Freeze the protocol.** Everything that defines the protocol lives in `js/config.js`. Any change to tasks, trial counts, timing, or questionnaire wording after approval → bump `CONFIG.VERSION` and it may need IRB re-approval. Never silently change wording.
3. **Questionnaire wording and VAS endpoint labels must be identical every session.**
4. **Save trial-level raw data**, never only summaries. Every row carries participant ID, session number, session type, form, version, dev flag, timestamp.
5. **No health data, names, or contact info** in data files. Participant codes only (e.g. P017). Accounts do collect email + first/last name, but only in the separate identity record (`cogbat_accounts`); research data is keyed by code only. Keep it that way (Abhi confirmed 2026-10-09).
6. Never write code or docs that misrepresent how/where data was collected.

## Technical decisions (already made, with reasons)

| Decision | Reason |
|---|---|
| jsPsych 8 (`jspsych@8.3.0`, plugins `2.1.0`), files **vendored in `vendor/`**, no CDN | Runs offline; version is frozen; credible, citable tool (de Leeuw, 2015) |
| **At home, participant's own device**, with accounts (email + password) | Abhi's decision 2026-10-09, replacing "identical district iPads". Known cost: mixed devices add between-person timing noise that hurts the population model and could bias results toward the hypothesis; device info (user agent, screen) is logged on every row so this can be analyzed/disclosed. Must be described in the IRB/SRC application and methods. |
| **Firebase** (project `cognitivebattery`, Firestore location **nam5, United States**), SDK `12.19.0` compat builds **vendored in `vendor/firebase/`** | Chosen 2026-10-09 so accounts work on any device and the researcher can get the data. Firebase Auth handles email/password (this site never stores passwords). Firestore: `identities/{uid}` (email, name, code: identity only), `participants/{code}` (code-only research record: intake, dev flag), `counters/participants` / `counters/dev`, `researchers/{uid}` (added by hand). Test accounts get **D###** codes so real ones start at P001. Access is controlled by `firestore.rules`, which must be pasted into the console (Firestore → Rules → Publish) after every change. The config in `js/firebase-setup.js` is public by design. Must be described in the IRB privacy plan (Google storage, US location, minors). |
| **Testing against the Firebase Emulator**, never the real project | `?emulator=1` connects to a local fake Firebase under the `demo-cognitivebattery` project (always dev mode). Needs Java + `firebase-tools`; run `firebase emulators:exec --only auth,firestore --project demo-cognitivebattery "<test command>"`. |
| **Automatic session schedule** (`CONFIG.SCHEDULE`, `nextSession()` in `js/main.js`) | No researcher present, so the app picks session number/type/form and enforces the 24 h gap (skipped in dev). Form alternation (A/B by session) and test-order counterbalancing (odd/even code) are PLACEHOLDER rules to confirm against the research plan. Dev and real sessions are counted separately. |
| Time responses on **`pointerdown`**, not `click` | Fires at finger contact; click fires on release and adds 50–150 ms noise |
| Stimulus onset from **`requestAnimationFrame`** timestamp | Times the frame the stimulus is actually drawn on |
| **Custom unanchored VAS** (`js/plugin-vas.js`) | Default slider starts at a position and biases answers toward it. Ours: blank line, no ticks/numbers, mark appears on first touch, draggable, Continue disabled until placed |
| Pre-generated **parallel forms A/B** for stimulus orders | Limits memorization across sessions; same versions for everyone |
| `?dev=1` URL flag shortens tasks and sets `dev=true` on every row | Test data can never be mistaken for real data |
| `?quick=1` quick test mode (localhost only, added 2026-10-14) | For building tasks: no login, starts a session straight away as `QUICKTEST` (session number 0), nothing uploaded, data only in the browser backup; always dev. `&type=baseline|test-rest|test-fatigue`, `&form=B`. |
| Plain HTML/JS, no build step | Abhi can read and edit everything; hostable on GitHub Pages |

Open questions: real backend for accounts + data (Firebase/Supabase/DataPipe → OSF; must match the IRB privacy plan, and participants may be minors); online consent/assent (the old researcher consent checkbox was removed with the launcher); how data reaches the researcher (now: researcher.html CSV download; still to describe in the IRB plan); enforcing the same 2-hour time-of-day window (only the 24 h gap is enforced); confirm form and counterbalancing rules; prespecify what happens to Stroop data from participants who answer colour-blind Yes / Not sure.

## Session structure

| Session | Contents |
|---|---|
| 1. Familiarization | Consent (TBD for at-home), intake survey (now on the Create account page), practice versions of every task with feedback, one full battery (data recorded, not analyzed) |
| 2–6. Baselines B1–B5 (may become 4) | Pre-session survey + VAS → battery → post-session VAS |
| 7–8. T-rest / T-fatigue (counterbalanced) | Pre-session survey + VAS → 16-min video OR 16-min TloadDback → fatigue VAS (manipulation check) → battery → post-session VAS |

Sessions ≥ 24 h apart, same 2-hour time-of-day window.

## Battery

Pilot includes 5 tasks; main study keeps 4 based on pilot reliability (ICC ≥ 0.6, prespecified). Target ~15 min for the main battery.

| Task | Domain | Notes |
|---|---|---|
| PVT-B (3 min) | Reaction time, sustained attention | ISI 1–4 s, false start < 100 ms, timeout 10 s, RT feedback 1 s |
| 2-back | Working memory | d′, RT |
| Digit-symbol substitution | Processing speed | correct per 90 s |
| Flanker | Inhibitory control | accuracy, incongruent − congruent RT cost (known reliability risk) |
| Stroop | Inhibitory control | backup for flanker; pilot only unless it wins |
| TloadDback (16 min) | **Fatigue manipulation**, not part of battery | 1-back + parity dual task, pace titrated to each person (Borragán et al., 2017). Its own response data is the compliance check. |

Response variability = RT coefficient of variation within each task (no extra task).

## Questionnaires (exact wording lives in `js/survey.js`)

- **Intake (familiarization only):** age, handedness, prior cognitive-test experience, video game hours/week, typical school-night sleep, needs glasses, colour-blind (No / Yes / Not sure; added 0.3.1 for Stroop; Stroop still runs for everyone, the analysis handles it).
- **Pre-session facts (every session):** sleep hours last night, caffeine in last 4 h (+ optional detail), time since last meal, hard exercise in last 2 h, feeling unwell (yes/no, no details), unusual day (+ optional note).
- **Pre-session VAS (every session):** sleep quality, mental fatigue, motivation, stress.
- **Post-manipulation VAS (test sessions only):** mental fatigue (manipulation check).
- **Post-session VAS (every session):** effort, distraction.
- Recorded automatically, not asked: participant ID, session number/type, form, version, dev flag, start/end time.

Prespecified session exclusions: sleep < 5 h; > 30% of trials missing or anticipatory (RT < 150 ms); logged technical failure; failed TloadDback compliance.

## Milestones and status

- [x] **M1.5 — at-home version (2026-10-09):** home screen (Create account / Login), sign-up with intake questions, login, participant home page with automatic schedule + 24 h lock, browser-only storage separated into identity vs. code-only research data, no download. Tested end to end in headless WebKit (iPad emulation). Version `0.2.0-home`.
- [x] **0.2.1-home:** follow-up questions (caffeine detail, unusual-day note) only appear after "Yes" and are cleared on "No" (reworded: dropped "leave blank if no"); `CONFIG.SCHEDULE.sessionsAvailable = 1`, so only session 1 is offered and the UI never mentions other sessions. Raise it when later sessions are built.
- [x] **0.2.2-home:** caffeine follow-up split into two questions: `caffeine_what` ("What did you have? (be as specific as possible)") and `caffeine_amount` ("About how much?"); both optional, shown only after "Yes". Replaces `caffeine_detail`.
- [x] **Firebase build (2026-10-09 to 2026-10-14):**
  - [x] Step 1: sign-up/login via Firebase Auth; identity + code-only participant records + intake in Firestore; security rules. Tested in the emulator (11 rule attacks all denied; no name/email in `participants`).
  - [x] Step 2 (2026-10-14): session data uploads to `participants/{code}/sessions/{session_id}` (one doc per attempt, created at start with `complete: false`, marked complete only after every trial is on the server) and `.../trials/{0000}` (one doc per trial = one raw-data row, uploaded as each trial ends; object values stored as JSON text like the CSV). Schedule/progress now read from Firestore, so participants can switch devices. localStorage keeps a backup CSV copy only. `?emulator=1` is ignored except on localhost.
  - [x] Step 3 (2026-10-14): rules for sessions/trials: owner-only, trials only while the session is open and must match its code/session number/dev flag, nothing can be edited or deleted, D### accounts can only make dev sessions. Tested in the emulator (13 session/trial attacks denied, full familiarization session uploads 22/22 rows matching the local backup). Rules published to the real project and a dev session confirmed in the console (2026-10-14).
  - [x] Step 4 (2026-10-14): `researcher.html` + `js/researcher.js`. Login must have a `researchers/{uid}` doc (researcher account is made in the console under Authentication → Add user, NOT via sign-up, so it doesn't use up a P### code). Shows all session attempts; real and dev data shown/downloaded separately (sessions filtered by their own dev flag). Downloads: all trials CSV (with session_id/session_end/session_complete added), session list CSV, intake CSV (no owner_uid). Names/emails are never downloaded here (by design). Shows the Firestore read count first (free plan: 50k reads/day; a full-study trials download may exceed it). No rule changes needed. Tested in the emulator: 22/22 checks.
  - [x] Step 5 (2026-10-14): full end-to-end test in the emulator (all 8 sessions opened in the test browser only): two dev accounts, counterbalancing (odd = rest first, even = fatigue first), form A/B alternation, quit mid-session then continue on a second device, all 8 sessions, researcher download matches uploads session by session (25/25). 24 h lock tested separately with dev off (7/7). Bugs found and fixed: previous "Session complete" screen flashed (and was tappable) when the next session started; writes now retry up to 3 times on a refusal (`writeWithRetry` in storage.js; an intermittent refusal was seen once in testing, probably caused by that bug). Dev-only tools added: account diagnosis + "delete this login" on the broken-account screen; clearer sign-up error when `counters/dev` doesn't match the D### records. Lesson: the rules in the console must match `firestore.rules` (an outdated paste caused "records couldn't be found").
- [ ] **M1 — launcher, questionnaires, touch PVT, CSV saving** (built and tested in a headless browser; the researcher launcher and CSV download were later replaced by M1.5)
  - [x] `js/config.js` — protocol settings, version `0.1.0-m1`
  - [x] `js/plugin-vas.js` — unanchored touch VAS plugin
  - [x] `js/survey.js` — intake, pre-session facts, VAS items
  - [x] `js/plugin-pvt-touch.js` — single PVT trial (pointerdown + rAF timing, outcomes: response / false_start / false_start_isi / miss)
  - [x] `js/pvt.js` — PVT block (instructions, practice in familiarization, timed loop). Block timer verified in jsPsych 8.3.0 (`on_timeline_start` runs once, before looping); the last trial may run past the time limit by up to ~15 s.
  - [x] `index.html` — launcher form: participant ID (`P###`), session type (familiarization / baseline / test-rest / test-fatigue), session number, form A/B, researcher initials; validate before starting
  - [x] `js/main.js` — `initJsPsych`, `data.addProperties` for metadata + `dev` flag, build the timeline per session type (placeholder screen for the fatigue task/video until M3), save CSV `P017_S03_baseline_<timestamp>.csv` on finish, plus a localStorage backup wrapped in try/catch
  - [x] `css/style.css` — large touch targets, no text selection / zoom / scroll bounce on iPad, PVT box and counter, VAS track styles (`.vas-*`, `.pvt-*`, `.form`, `.big-btn` classes are already used)
  - [x] Test a full session in a headless browser with simulated touches; check the CSV (all 4 session types pass in headless WebKit with iPad emulation, 2026-10-09)
  - [ ] Test on a real district iPad (Safari download flow, wake lock, touch timing)
- [x] **M2** — 2-back, DSST, flanker, Stroop with parallel forms A/B (done 2026-10-22; numbers still PROPOSALS to confirm with mentor)
  - Design agreed 2026-10-14: fixed order PVT → 2-back → flanker → DSST → Stroop (Stroop added by Abhi; pilot only, NOT yet in the research plan), 30 s auto breaks, practice with feedback before each task in familiarization only. Trial counts/timings are PROPOSALS (plan doesn't specify): confirm with mentor. Device: **iPad only** (Abhi, 2026-10-22); layouts designed for iPad portrait + landscape; nothing blocks other devices (not requested). The research plan's Software section still says laptop + wired keyboard: needs updating to at-home touch.
  - [x] Step 1 (2026-10-14): `js/plugin-touch-choice.js` (shared stimulus + tap trial; rAF onset, pointerdown, first tap only, pointer_type), `js/battery.js` (order from `CONFIG.BATTERY.order`, break screen), `js/flanker.js` (SVG arrows, 100 trials, 12 practice), `tools/make-forms.mjs` → `js/forms.js` (seeded, balanced, max 3 in a row; reproducible byte-for-byte). VERSION 0.3.0-m2. Emulator test 11/11 (order, form A sequence, correctness incl. no-tap, RT of taps scheduled 300 ms after onset recorded as 300–303 ms, 3 s dev break = 3005 ms).
  - [x] Step 2 (2026-10-14): `js/nback.js` 2-back: letters B D F H K M R T, 0.5 s letter + blank, fixed 2.5 s pace, 90 trials / 27 matches (30%), 20 practice / 6 matches; one MATCH button (not tapping = correct on non-matches). Forms: no 1-back or 3-back lures and ≤ 2 matches in a row, so A and B are equally hard. Practice feedback skipped after a correctly ignored non-match. Quick-mode test 10/10 (hits/misses/false alarms graded right, RT 400–402 ms for taps at 400 ms, every trial 2.50 s). Note: the browser backup CSV writes empty values as the text "null" (the Firestore data and researcher CSV keep real empty values).
  - [x] Step 3 (2026-10-22): `js/dsst.js` DSST: key (digits 1-9 + 9 SVG symbols) always on screen (plugin `header`), a symbol appears, participant taps its DIGIT on a 1-9 keypad (changed from the first proposal "digit → tap symbol", which could be answered by button position alone). 90 s block (clock starts at first test item; last item's response window is the time left, so the block ends exactly at 90 s); 198 items (22 per digit, no immediate repeats); 9 practice items untimed with feedback, separate practice key. Form B's key shares no digit-symbol pair with A.
  - [x] Step 4 (2026-10-22): `js/stroop.js` Stroop (pilot only): RED/GREEN/BLUE/YELLOW in coloured ink on a dark screen, 4 colour-patch buttons (no words), tap the ink. 96 trials (48 congruent, 12 per colour; 48 incongruent, each word/ink pair 4×), 16 practice; fixation 500 ms, 2 s window. Colour vision: intake question added in 0.3.1 (see Questionnaires). Quick-mode full-battery test 14/14 (order PVT→2-back→flanker→DSST→Stroop with breaks; DSST stopped at 19.99 s for a 20 s dev block; grading incl. deliberate errors; RT 250–254 / 301–303 ms for taps at 250 / 300 ms).
  - [x] 0.3.1-m2 (2026-10-22): intake question `colour_blind` (required); flanker 220 trials (55 per cell) to match the plan's ~4 min (measured: 3.87 min at a simulated mean RT of 546 ms). Emulator test 5/5 (question required, saved in `participants/{code}.intake`, in researcher intake CSV).
  - [x] Step 5 (2026-10-22): tests moved INTO the repo (`tests/`, see tests/README.md; the scratchpad copies kept getting deleted): `npm run test:tasks` (21 checks, quick mode), `test:schedule` (10, dev off), `test:e2e` (31, emulator: 8 sessions + quit/resume on a 2nd device + researcher download + 10 rule attacks), `timing` (real-length measurement). DSST block rewritten as a loop (listing 198 items and skipping unused ones left gaps in trial_index). Measured real-length battery (human-like RTs, excluding instruction reading ~1.5-2 min): familiarization 19.3 min (PVT 3.4, 2-back 4.7, flanker 5.0, DSST 1.7, Stroop 2.5, breaks 2.0); baseline/test 16.8 min (3.1 / 3.8 / 4.6 / 1.5 / 1.9 / 2.0). Plan target ~15 min for the 4-task main battery; pilot battery with Stroop is ~18.5 min incl. reading.
  - Firestore volume: ~550-620 trial writes per session. Free plan = 20,000 writes/day (~35 sessions/day) and 50,000 reads/day; a whole-study researcher download (~4,500 rows per participant) exceeds the read limit for > ~10 participants. Decide before the pilot: Blaze (pay-as-you-go) plan with a budget alert, or download in parts.
- [ ] **M3** — TloadDback fatigue task (titrated pace) + neutral video condition
- [ ] **M4** — full session flow, version tagging (`git tag v1.0-pilot`), timing-check page, GitHub Pages deploy

## Repo layout

```
index.html            all screens: home, create account, login, participant home, task area
researcher.html       researcher data page (CSV downloads)
js/config.js          frozen protocol settings
js/plugin-vas.js      custom VAS plugin
js/plugin-pvt-touch.js custom PVT trial plugin
js/pvt.js             PVT block builder
js/survey.js          questionnaires
js/firebase-setup.js  Firebase config + connection (?emulator=1 for local testing)
js/storage.js         accounts + session/trial uploads (Firebase), identity kept apart from code-only research data; local backup copy
firestore.rules       database security rules (paste into Firebase console)
tools/serve.py        local test server with caching off (python3 tools/serve.py → http://localhost:8000/); use instead of http.server, which let Safari run stale JS
tools/make-forms.mjs  generates js/forms.js (seeded, reproducible)
firebase.json         emulator + rules config
tests/                automated tests (npm run test:tasks | test:schedule | test:e2e | timing), see tests/README.md
package.json          dev-only test tools (Playwright, firebase-tools); the website itself has no build step
vendor/firebase/      Firebase 12.19.0 compat SDK (do not edit)
js/researcher.js      researcher page: login check, session table, CSV downloads
js/battery.js         task order + 30 s breaks
js/plugin-touch-choice.js  shared stimulus + tap trial (flanker, 2-back, Stroop)
js/nback.js           2-back block
js/flanker.js         flanker block
js/dsst.js            digit-symbol block (symbols drawn as SVG)
js/stroop.js          Stroop block (pilot only)
js/forms.js           GENERATED frozen trial orders, forms A/B (tools/make-forms.mjs)
js/main.js            screens, sign-up/login, session schedule, session flow + saving
css/style.css         layout and touch styles
vendor/               jsPsych 8.3.0 + plugins (do not edit)
```

## Working style for Claude

- Small, reviewable steps; test before claiming something works.
- After each change, tell Abhi in plain words what it does and why, and what to test on the iPad.
- Don't add features beyond the protocol without asking; the protocol is fixed by the research plan.
