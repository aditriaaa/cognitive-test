# CLAUDE.md — Cognitive Battery (ISEF project)

Context for any Claude session working in this repo. Read this first.

## Who and what

- Student researcher: Abhi. This is a science-fair (ISEF-track) human-participants study.
- This repo is the **testing software**: a browser-based cognitive battery built with **jsPsych 8**, run on **district-issued iPads with touch input**, developed on a MacBook.
- Full research plan (the source of truth for the protocol): https://claude.ai/code/artifact/583df1ea-9b84-4588-a00a-00d472274f77
- Abhi is still learning the code and the stats. **Explain changes in plain language, comment the code well, and make sure he can answer a judge's question about any part of it.** AI assistance must be disclosed on his fair forms and in his methods, so be transparent about what was generated.

## The study in one paragraph

Does comparing a person to their own past performance detect a real change in cognitive performance better than comparing them to everyone else, and how many baseline sessions does that take? Participants do a familiarization session, several baseline sessions, then two test sessions in counterbalanced order: one rested (watch a neutral 16-min video) and one after a 16-min cognitive-fatigue task (TloadDback). Four detectors (population norms, Reliable Change Index, individual baseline, Bayesian hierarchical/partial pooling) classify each test session as changed or not. Primary outcome: ROC AUC. Secondary: number of baseline sessions needed. Planned extra analysis: synthetic change injection into rested-session data.

## Hard rules (scientific integrity)

1. **No participant data before IRB/SRC approval.** That includes the pilot. Software can be built and tested on Abhi himself / simulated data only, and that data must be flagged (dev mode).
2. **Freeze the protocol.** Everything that defines the protocol lives in `js/config.js`. Any change to tasks, trial counts, timing, or questionnaire wording after approval → bump `CONFIG.VERSION` and it may need IRB re-approval. Never silently change wording.
3. **Questionnaire wording and VAS endpoint labels must be identical every session.**
4. **Save trial-level raw data**, never only summaries. Every row carries participant ID, session number, session type, form, version, dev flag, timestamp.
5. **No health data, names, or contact info** in data files. Participant codes only (e.g. P017).
6. Never write code or docs that misrepresent how/where data was collected.

## Technical decisions (already made, with reasons)

| Decision | Reason |
|---|---|
| jsPsych 8 (`jspsych@8.3.0`, plugins `2.1.0`), files **vendored in `vendor/`**, no CDN | Runs offline; version is frozen; credible, citable tool (de Leeuw, 2015) |
| **Touch input on identical district iPads**, not home computers | Same hardware = constant latency that cancels in within-person comparisons. Mixed home devices add between-person noise that unfairly hurts the population model and would bias results toward the hypothesis. |
| Time responses on **`pointerdown`**, not `click` | Fires at finger contact; click fires on release and adds 50–150 ms noise |
| Stimulus onset from **`requestAnimationFrame`** timestamp | Times the frame the stimulus is actually drawn on |
| **Custom unanchored VAS** (`js/plugin-vas.js`) | Default slider starts at a position and biases answers toward it. Ours: blank line, no ticks/numbers, mark appears on first touch, draggable, Continue disabled until placed |
| Pre-generated **parallel forms A/B** for stimulus orders | Limits memorization across sessions; same versions for everyone |
| `?dev=1` URL flag shortens tasks and sets `dev=true` on every row | Test data can never be mistaken for real data |
| Plain HTML/JS, no build step | Abhi can read and edit everything; hostable on GitHub Pages |

Open questions: where data is saved on iPads (local CSV download vs. a service like DataPipe → OSF; must match the IRB privacy plan), whether district IT allows the web app, in-person group sessions vs. hybrid (first visit in person, rest at home). A hybrid is acceptable only if **all analyzed sessions for a person are in the same setting**.

## Session structure

| Session | Contents |
|---|---|
| 1. Familiarization | Consent check (offline), intake survey, practice versions of every task with feedback, one full battery (not analyzed) |
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

- **Intake (familiarization only):** age, handedness, prior cognitive-test experience, video game hours/week, typical school-night sleep, needs glasses.
- **Pre-session facts (every session):** sleep hours last night, caffeine in last 4 h (+ optional detail), time since last meal, hard exercise in last 2 h, feeling unwell (yes/no, no details), unusual day (+ optional note).
- **Pre-session VAS (every session):** sleep quality, mental fatigue, motivation, stress.
- **Post-manipulation VAS (test sessions only):** mental fatigue (manipulation check).
- **Post-session VAS (every session):** effort, distraction.
- Recorded automatically, not asked: participant ID, session number/type, form, version, dev flag, start/end time.

Prespecified session exclusions: sleep < 5 h; > 30% of trials missing or anticipatory (RT < 150 ms); logged technical failure; failed TloadDback compliance.

## Milestones and status

- [ ] **M1 — launcher, questionnaires, touch PVT, CSV saving** (in progress, NOTHING TESTED YET)
  - [x] `js/config.js` — protocol settings, version `0.1.0-m1`
  - [x] `js/plugin-vas.js` — unanchored touch VAS plugin
  - [x] `js/survey.js` — intake, pre-session facts, VAS items
  - [x] `js/plugin-pvt-touch.js` — single PVT trial (pointerdown + rAF timing, outcomes: response / false_start / false_start_isi / miss)
  - [x] `js/pvt.js` — PVT block (instructions, practice in familiarization, timed loop). Check the `on_start`/`loop_function` block-timer logic actually works in jsPsych 8.
  - [ ] `index.html` — launcher form: participant ID (`P###`), session type (familiarization / baseline / test-rest / test-fatigue), session number, form A/B, researcher initials; validate before starting
  - [ ] `js/main.js` — `initJsPsych`, `data.addProperties` for metadata + `dev` flag, build the timeline per session type (placeholder screen for the fatigue task/video until M3), save CSV `P017_S03_baseline_<timestamp>.csv` on finish, plus a localStorage backup wrapped in try/catch
  - [ ] `css/style.css` — large touch targets, no text selection / zoom / scroll bounce on iPad, PVT box and counter, VAS track styles (`.vas-*`, `.pvt-*`, `.form`, `.big-btn` classes are already used)
  - [ ] Test a full session in a headless browser with simulated touches; check the CSV
- [ ] **M2** — 2-back, DSST, flanker, Stroop with parallel forms A/B
- [ ] **M3** — TloadDback fatigue task (titrated pace) + neutral video condition
- [ ] **M4** — full session flow, version tagging (`git tag v1.0-pilot`), timing-check page, GitHub Pages deploy

## Repo layout

```
index.html            launcher (to build)
js/config.js          frozen protocol settings
js/plugin-vas.js      custom VAS plugin
js/plugin-pvt-touch.js custom PVT trial plugin
js/pvt.js             PVT block builder
js/survey.js          questionnaires
js/main.js            session flow + saving (to build)
css/style.css         (to build)
vendor/               jsPsych 8.3.0 + plugins (do not edit)
```

## Working style for Claude

- Small, reviewable steps; test before claiming something works.
- After each change, tell Abhi in plain words what it does and why, and what to test on the iPad.
- Don't add features beyond the protocol without asking; the protocol is fixed by the research plan.
