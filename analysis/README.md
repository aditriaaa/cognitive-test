# Analysis

The app saves only raw, trial-level data. All scoring and statistics happen
here, separately, so the analysis can be improved without touching the
frozen app or the data.

## Data check (`check_data.py`)

Checks that the downloaded data contains everything the planned analysis
needs, before any real data is collected and after each pilot download. It is
not the analysis: it computes each planned measure once, only to prove it can.

1. On the researcher page (`researcher.html`), download the three files:
   all trials, session list, intake (real or dev data).
2. Run:

   ```
   python3 analysis/check_data.py cogbat_dev_trials_DATE.csv cogbat_dev_sessions_DATE.csv cogbat_dev_intake_DATE.csv
   ```

It prints one line per check with how many sessions passed:

| Check | What it proves |
|---|---|
| All trials present, in order | row count = the session's `n_trials`; `trial_index` 0, 1, 2, ... |
| Every row has ID, session, ... | hard rule 4 columns, plus UTC + local start time and device |
| Pre-session facts | sleep hours etc. (the < 5 h sleep exclusion) |
| VAS ratings | all ratings, incl. the fatigue check in test sessions |
| PVT / 2-back / flanker / Stroop / DSST | mean RT + lapses, d′, RT costs, DSST score, RT variability; missing/anticipatory rate (> 30% exclusion) |
| Baselines 4 + 5 | the TloadDback calibration result |
| T-rest / T-fatigue | video watched; TloadDback compliance (≥ 70% accuracy, no 2-min stretch without a tap) |
| Intake answers and consent | incl. colour-blind (for the Stroop rule); consent version, when, and whether a parent/guardian signed |

then example values and known gaps. It exits with an error if any check
fails. Standard Python only (no installs).

`npm run test:e2e` runs this check automatically on the data from its
simulated 8-session study.
