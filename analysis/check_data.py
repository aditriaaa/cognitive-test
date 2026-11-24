"""
check_data.py — does the downloaded data contain everything the analysis needs?

This is NOT the analysis. It checks, session by session, that every measure
the research plan uses can be computed from the raw data, by computing each
one once. Run it on the CSV files from the researcher page (researcher.html):

    python3 analysis/check_data.py TRIALS.csv SESSIONS.csv INTAKE.csv

(e.g. cogbat_dev_trials_2026-11-24.csv, cogbat_dev_sessions_... , cogbat_dev_intake_...)

It prints a checklist (one line per check, with how many sessions passed),
details for anything that failed, example values, and known gaps. It exits
with code 1 if any check fails, so tests can use it.

Uses only Python's standard library: nothing to install.
"""
import csv
import json
import math
import statistics
import sys
from collections import defaultdict

# ---------------------------------------------------------------------------
# What the data should contain (from the research plan and js/survey.js)
# ---------------------------------------------------------------------------

# Columns every row must have (CLAUDE.md hard rule 4 + time of day + device).
ROW_COLUMNS = ["participant_id", "session_number", "session_type", "form", "version", "dev",
               "timestamp", "session_start", "session_start_local", "timezone", "user_agent"]

PRE_SESSION_FACTS = ["sleep_hours", "caffeine_4h", "last_meal", "exercise_2h", "unwell_today", "unusual_day"]
VAS_EVERY_SESSION = ["sleep_quality", "fatigue_pre", "motivation_pre", "stress_pre", "effort_post", "distraction_post"]
VAS_TEST_SESSIONS = ["fatigue_post_manipulation"]
INTAKE = ["age", "handedness", "prior_cognitive_tests", "video_game_hours_week",
          "typical_sleep_hours", "needs_glasses", "colour_blind",
          "consent_version", "consent_signed_at", "consent_guardian_permission"]   # consent version, when, guardian signed?
TASKS = ["pvt", "nback", "flanker", "dsst", "stroop"]
CALIBRATION_SESSIONS = {5: "1", 6: "2"}   # end of baselines 4 and 5 (session numbers)

PVT_LAPSE_MS = 355        # PVT-B lapse threshold (Basner & Dinges, 2011)
ANTICIPATION_MS = 150     # RTs under this count as anticipations (plan)
COMPLIANCE_ACCURACY = 0.70   # TloadDback compliance (CLAUDE.md, M3 decisions)
COMPLIANCE_MAX_GAP_S = 120

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def num(value):
    """A cell as a number, or None if empty / not a number."""
    try:
        x = float(value)
        return None if math.isnan(x) else x
    except (TypeError, ValueError):
        return None

def is_true(value):
    return str(value).lower() == "true"

def mean(xs):
    return statistics.fmean(xs) if xs else None

def cv(xs):
    """Coefficient of variation (SD / mean): the plan's response-variability measure."""
    return statistics.pstdev(xs) / statistics.fmean(xs) if len(xs) > 1 and statistics.fmean(xs) else None

def d_prime(hits, n_targets, false_alarms, n_nontargets):
    """d' with the log-linear correction (add 0.5 / 1), so 0% or 100% rates still work."""
    from statistics import NormalDist
    z = NormalDist().inv_cdf
    return z((hits + 0.5) / (n_targets + 1)) - z((false_alarms + 0.5) / (n_nontargets + 1))

def r(x, digits=1):
    return "n/a" if x is None else round(x, digits)

# ---------------------------------------------------------------------------
# The measures (one function per task), each returning a dict or raising
# MissingData with the reason.
# ---------------------------------------------------------------------------

class MissingData(Exception):
    pass

def test_rows(rows, task):
    found = [x for x in rows if x["task"] == task and x.get("phase") == "test"]
    if not found:
        raise MissingData(f"no {task} test trials")
    return found

def pvt_measures(rows):
    trials = test_rows(rows, "pvt")
    rts = [num(x["rt"]) for x in trials if x["outcome"] == "response" and num(x["rt"]) is not None]
    if not rts:
        raise MissingData("no PVT responses with an RT")
    bad = sum(1 for x in trials if x["outcome"] != "response" or (num(x["rt"]) or 0) < ANTICIPATION_MS)
    return {"mean_rt": mean(rts), "lapses": sum(rt > PVT_LAPSE_MS for rt in rts), "rt_cv": cv(rts),
            "missing_or_anticipatory": bad / len(trials), "n": len(trials)}

def nback_measures(rows):
    trials = test_rows(rows, "nback")
    targets = [x for x in trials if is_true(x["target"])]
    others = [x for x in trials if not is_true(x["target"])]
    if not targets or not others:
        raise MissingData("2-back needs both match and non-match trials")
    hits = sum(x["response"] == "match" for x in targets)
    false_alarms = sum(x["response"] == "match" for x in others)
    hit_rts = [num(x["rt"]) for x in targets if x["response"] == "match" and num(x["rt"]) is not None]
    return {"d_prime": d_prime(hits, len(targets), false_alarms, len(others)),
            "hit_rt": mean(hit_rts), "rt_cv": cv(hit_rts), "n": len(trials)}

def conflict_measures(rows, task):
    """Flanker and Stroop: accuracy and the incongruent - congruent RT cost (correct trials)."""
    trials = test_rows(rows, task)
    rt = {c: [num(x["rt"]) for x in trials if x["condition"] == c and is_true(x["correct"]) and num(x["rt"]) is not None]
          for c in ("congruent", "incongruent")}
    if not rt["congruent"] or not rt["incongruent"]:
        raise MissingData(f"{task} needs correct trials in both conditions")
    all_rts = rt["congruent"] + rt["incongruent"]
    missing = sum(1 for x in trials if num(x["rt"]) is None or num(x["rt"]) < ANTICIPATION_MS)
    return {"accuracy": sum(is_true(x["correct"]) for x in trials) / len(trials),
            "rt_cost": mean(rt["incongruent"]) - mean(rt["congruent"]), "rt_cv": cv(all_rts),
            "missing_or_anticipatory": missing / len(trials), "n": len(trials)}

def dsst_measures(rows):
    trials = test_rows(rows, "dsst")
    rts = [num(x["rt"]) for x in trials if num(x["rt"]) is not None]
    return {"correct": sum(is_true(x["correct"]) for x in trials), "rt_cv": cv(rts), "n": len(trials)}

def tload_compliance(rows):
    """T-fatigue: weighted accuracy over the whole task and the longest stretch without a tap."""
    chunks = [x for x in rows if x["task"] == "tload" and x.get("phase") == "main"]
    if not chunks:
        raise MissingData("no TloadDback chunks")
    items, std_ms = [], num(chunks[0]["std_ms"])
    for c in chunks:
        items += json.loads(c["items"])   # [pos, char, kind, target, response, rt, correct]
    shown = [i for i in items if i[4] != "skipped"]
    acc = lambda kind: mean([1.0 if i[6] else 0.0 for i in shown if i[2] == kind])
    weighted = 0.65 * acc("L") + 0.35 * acc("D")
    longest = run = 0
    for i in items:                       # count items in a row without any tap
        run = 0 if i[4] not in (None, "skipped") else run + 1
        longest = max(longest, run)
    longest_s = longest * std_ms / 1000
    return {"weighted_accuracy": weighted, "longest_no_tap_s": longest_s, "pace_ms": std_ms,
            "pace_source": chunks[0].get("std_source", ""),
            "compliant": weighted >= COMPLIANCE_ACCURACY and longest_s < COMPLIANCE_MAX_GAP_S}

# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------

def main(trials_path, sessions_path, intake_path):
    trials, sessions, intake = read_csv(trials_path), read_csv(sessions_path), read_csv(intake_path)
    by_session = defaultdict(list)
    for row in trials:
        by_session[row["session_id"]].append(row)
    intake_by_code = {x["participant_id"]: x for x in intake}

    results = defaultdict(lambda: [0, 0, []])   # check name -> [passed, applicable, failures]
    examples = []

    def check(name, session_id, fn):
        """Run fn(); count a pass, or record why it failed."""
        results[name][1] += 1
        try:
            value = fn()
            results[name][0] += 1
            return value
        except (MissingData, KeyError, ValueError, TypeError, json.JSONDecodeError) as e:
            results[name][2].append(f"{session_id}: {e}")
            return None

    complete = [s for s in sessions if is_true(s["complete"])]
    for s in sorted(complete, key=lambda s: (s["participant_id"], int(s["session_number"]))):
        sid, rows = s["session_id"], by_session.get(s["session_id"], [])
        number, kind = int(s["session_number"]), s["session_type"]

        def all_trials_present():
            if len(rows) != int(s["n_trials"]):
                raise MissingData(f"{len(rows)} rows but n_trials = {s['n_trials']}")
            if [int(x["trial_index"]) for x in rows] != list(range(len(rows))):
                raise MissingData("trial_index not 0, 1, 2, ...")
        check("All trials present, in order", sid, all_trials_present)

        def row_columns():
            gaps = sorted({c for x in rows for c in ROW_COLUMNS if not x.get(c)})
            if gaps:
                raise MissingData("empty: " + ", ".join(gaps))
        check("Every row has ID, session, form, version, dev, timestamp, start time (UTC + local), device", sid, row_columns)

        def facts():
            row = next((x for x in rows if x["task"] == "presession_facts"), None)
            if row is None:
                raise MissingData("no pre-session facts row")
            answers = json.loads(row["response"])
            missing = [k for k in PRE_SESSION_FACTS if k not in answers]
            if missing or num(answers.get("sleep_hours")) is None:
                raise MissingData("missing: " + ", ".join(missing or ["sleep_hours as a number"]))
            return answers
        facts_answers = check("Pre-session facts (incl. sleep hours for the < 5 h exclusion)", sid, facts)

        def vas():
            wanted = VAS_EVERY_SESSION + (VAS_TEST_SESSIONS if kind.startswith("test") else [])
            got = {x["item"]: num(x["response"]) for x in rows if x["task"] == "vas"}
            missing = [k for k in wanted if got.get(k) is None]
            if missing:
                raise MissingData("missing: " + ", ".join(missing))
        check("VAS ratings (incl. fatigue check in test sessions)", sid, vas)

        m = {
            "pvt": check("PVT: mean RT, lapses, RT variability", sid, lambda: pvt_measures(rows)),
            "nback": check("2-back: d', hit RT, RT variability", sid, lambda: nback_measures(rows)),
            "flanker": check("Flanker: accuracy, RT cost, RT variability", sid, lambda: conflict_measures(rows, "flanker")),
            "stroop": check("Stroop: accuracy, RT cost, RT variability", sid, lambda: conflict_measures(rows, "stroop")),
            "dsst": check("DSST: correct items", sid, lambda: dsst_measures(rows)),
        }

        if kind == "test-fatigue":
            m["tload"] = check("T-fatigue: TloadDback compliance (accuracy, no-tap stretch)", sid, lambda: tload_compliance(rows))
        if kind == "test-rest":
            def video():
                row = next((x for x in rows if x["task"] == "rest_video"), None)
                if row is None or num(row["video_seconds_watched"]) is None:
                    raise MissingData("no rest-video row")
                return row
            check("T-rest: video watched (seconds, how it ended)", sid, video)
        if number in CALIBRATION_SESSIONS and kind == "baseline":
            def calibration():
                row = next((x for x in rows if x["task"] == "tload_calibration_result"), None)
                if row is None or num(row["std_final"]) is None:
                    raise MissingData("no calibration result")
                return row
            check("Baselines 4 + 5: TloadDback calibration result", sid, calibration)

        line = f"{s['participant_id']} S{number} {kind:15}"
        if m["pvt"]: line += f" PVT {r(m['pvt']['mean_rt'], 0)} ms/{m['pvt']['lapses']} lapses"
        if m["nback"]: line += f" | 2-back d' {r(m['nback']['d_prime'], 2)}"
        if m["flanker"]: line += f" | flanker cost {r(m['flanker']['rt_cost'], 0)} ms"
        if m["stroop"]: line += f" | Stroop cost {r(m['stroop']['rt_cost'], 0)} ms"
        if m["dsst"]: line += f" | DSST {m['dsst']['correct']}"
        if m.get("tload"): line += f" | Tload {r(m['tload']['weighted_accuracy'] * 100, 0)}%, compliant={m['tload']['compliant']}"
        if facts_answers: line += f" | slept {facts_answers['sleep_hours']} h"
        examples.append(line)

    for code in sorted({s["participant_id"] for s in complete}):
        def intake_ok():
            row = intake_by_code.get(code)
            if row is None:
                raise MissingData("no intake row")
            missing = [k for k in INTAKE if not row.get(k)]
            if missing:
                raise MissingData("missing: " + ", ".join(missing))
        check("Intake answers (incl. colour-blind) and consent record", code, intake_ok)

    # ---- Report ----
    print(f"Data check: {len(complete)} complete sessions ({len(sessions) - len(complete)} incomplete attempts), "
          f"{len({s['participant_id'] for s in complete})} participants, {len(trials)} trial rows\n")
    failed = False
    for name, (passed, applicable, failures) in results.items():
        mark = "OK  " if passed == applicable else "FAIL"
        failed |= passed != applicable
        print(f"{mark} {name}: {passed}/{applicable}")
        for f in failures[:5]:
            print(f"       - {f}")
    print("\nExample values (computed only to prove they can be):")
    for line in examples:
        print("  " + line)
    print("\nKnown gaps (not checkable from the data yet):")
    print("  - 'Logged technical failure' exclusion: the app has no way to report a problem yet.")
    return 1 if failed else 0

if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    sys.exit(main(*sys.argv[1:]))
