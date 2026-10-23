// make-forms.mjs — generates js/forms.js, the frozen trial orders for parallel
// forms A and B (and the practice lists).
//
// Run once:   node tools/make-forms.mjs
//
// The random generator is SEEDED, so running this again always produces the
// exact same file. That makes the forms reproducible: anyone can check that
// js/forms.js came from these rules. Never edit js/forms.js by hand; change the
// rules here (or the counts in js/config.js), re-run, and bump CONFIG.VERSION.
//
// Rules for every list:
//   - conditions are exactly balanced (e.g. flanker: equal numbers of each
//     congruent/incongruent x left/right combination)
//   - no more than 3 trials in a row with the same correct answer or the same
//     condition, so participants can't ride a streak or guess a pattern
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Read CONFIG from js/config.js (a plain browser script, so evaluate it).
const CONFIG = new Function(fs.readFileSync(path.join(root, "js/config.js"), "utf8") + "\nreturn CONFIG;")();

// Small seeded random number generator (mulberry32): same seed, same numbers.
function rng(seedText) {
  let a = [...seedText].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Longest run of equal values of key(item). A key that returns null for an
// item means "don't limit runs of this kind of item".
function longestRun(list, key) {
  let best = 0, run = 0;
  list.forEach((x, i) => {
    run = i > 0 && key(x) !== null && key(x) === key(list[i - 1]) ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// Builds a random order one trial at a time: at each step, pick at random among
// the remaining trials that don't make a run longer than maxRun for any key.
// If it gets stuck, start again (same seed stream, so still deterministic).
function constrainedShuffle(items, seed, keys, maxRun = 3) {
  const random = rng(seed);
  const breaksRule = (order, item) => keys.some((k) => k(item) !== null &&
    order.length >= maxRun && order.slice(-maxRun).every((x) => k(x) === k(item)));
  for (let tries = 1; tries <= 10000; tries++) {
    const left = shuffle(items, random);
    const order = [];
    while (left.length) {
      const ok = left.map((x, i) => i).filter((i) => !breaksRule(order, left[i]));
      if (!ok.length) break; // stuck: try again
      const pick = ok[Math.floor(random() * ok.length)];
      order.push(left.splice(pick, 1)[0]);
    }
    if (!left.length && keys.every((k) => longestRun(order, k) <= maxRun)) return order;
  }
  throw new Error("No order found for " + seed);
}

// Every combination of the given factor levels, `perCell` times each.
function balanced(factors, perCell) {
  let cells = [{}];
  for (const [name, levels] of Object.entries(factors)) {
    cells = cells.flatMap((c) => levels.map((v) => ({ ...c, [name]: v })));
  }
  return cells.flatMap((c) => Array.from({ length: perCell }, () => ({ ...c })));
}

// ---- Flanker: { congruent: true/false, target: "left"/"right" } ----
function flankerList(n, seed) {
  if (n % 4) throw new Error("Flanker trial count must be a multiple of 4");
  const items = balanced({ congruent: [true, false], target: ["left", "right"] }, n / 4);
  return constrainedShuffle(items, seed, [(t) => t.target, (t) => t.congruent]);
}

// ---- 2-back: { letter: "K", target: true/false } ----
// Rules: exactly `targets` matches (never in the first 2 trials, which have
// nothing 2 back), no more than 2 matches in a row, and NO "lures": a
// non-match letter never repeats the letter 1 or 3 back (B B, or B K D B).
// Lures tempt wrong taps, and their number would differ between forms by
// chance, so banning them keeps forms A and B equally hard.
function nbackList(n, targets, seed) {
  const random = rng(seed);
  // Where the matches go: only runs of matches are limited (key null for non-matches).
  const flags = [false, false, ...constrainedShuffle(
    [...Array(targets).fill(true), ...Array(n - 2 - targets).fill(false)], seed + "-targets", [(x) => (x ? "match" : null)], 2)];
  // Then the letters: a match repeats the letter 2 back; any other letter must
  // differ from the previous three (not a match, not a lure).
  const letters = [];
  flags.forEach((isTarget, i) => {
    if (isTarget) return letters.push(letters[i - 2]);
    const options = CONFIG.NBACK.letters.filter((l) => !letters.slice(Math.max(0, i - 3), i).includes(l));
    letters.push(options[Math.floor(random() * options.length)]);
  });
  return letters.map((letter, i) => ({ letter, target: flags[i] }));
}

// ---- DSST ----
// key:   which symbol goes with each digit 1-9 (a different pairing per form,
//        so the key can't simply be remembered from the last session)
// items: the digit whose symbol is shown, e.g. [4, 7, 1, ...]; every digit
//        equally often, never the same digit twice in a row
const SYMBOLS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"]; // drawn in js/dsst.js
// avoidKey: another form's key; no digit may keep the same symbol as in it.
function dsstForm(nItems, seed, avoidKey = null) {
  if (nItems % 9) throw new Error("DSST item count must be a multiple of 9");
  const random = rng(seed + "-key");
  let symbols;
  do { symbols = shuffle(SYMBOLS, random); }
  while (avoidKey && symbols.some((s, i) => avoidKey[i + 1] === s));
  const key = Object.fromEntries(symbols.map((s, i) => [i + 1, s]));
  const digits = Array.from({ length: nItems }, (_, i) => (i % 9) + 1);
  return { key, items: constrainedShuffle(digits, seed + "-items", [(d) => d], 1) };
}

// ---- Stroop: { word: "red", ink: "blue" } ----
// Main list: each colour word in its own ink 12 times (congruent) and each
// word/other-ink pair 4 times (incongruent). Practice: 2 congruent per colour
// + 2 incongruent per ink. No more than 3 in a row of the same ink, word or condition.
function stroopList(perCongruent, perPair, seed) {
  const colors = Object.keys(CONFIG.STROOP.colors);
  const items = [];
  for (const ink of colors) {
    for (let k = 0; k < perCongruent; k++) items.push({ word: ink, ink });
    const others = colors.filter((c) => c !== ink);
    // perPair = how many times each other word appears in this ink (a fraction
    // means: cycle through the other words, e.g. practice uses 2 per ink in total)
    const nInc = Math.round(perPair * others.length);
    for (let k = 0; k < nInc; k++) items.push({ word: others[k % others.length], ink });
  }
  return constrainedShuffle(items, seed, [(t) => t.ink, (t) => t.word, (t) => t.word === t.ink]);
}

const F = CONFIG.FLANKER, N = CONFIG.NBACK, D = CONFIG.DSST, S = CONFIG.STROOP;
const forms = {
  A: { flanker: flankerList(F.trials, "flanker-A"), nback: nbackList(N.trials, N.targets, "nback-A"),
       dsst: dsstForm(D.items, "dsst-A"), stroop: stroopList(12, 4, "stroop-A") },
  B: { flanker: flankerList(F.trials, "flanker-B"), nback: nbackList(N.trials, N.targets, "nback-B"),
       dsst: dsstForm(D.items, "dsst-B", dsstForm(D.items, "dsst-A").key), stroop: stroopList(12, 4, "stroop-B") },
  practice: {
    flanker: flankerList(F.practiceTrials, "flanker-practice"),
    nback: nbackList(N.practiceTrials, N.practiceTargets, "nback-practice"),
    dsst: dsstForm(D.practiceItems, "dsst-practice"),
    stroop: stroopList(2, 2 / 3, "stroop-practice")
  }
};

const out = `/*
 * forms.js — GENERATED by tools/make-forms.mjs. DO NOT EDIT BY HAND.
 *
 * Frozen trial orders for parallel forms A and B, plus practice lists.
 * Everyone doing form A gets exactly the same order (same for B).
 * Generated for CONFIG.VERSION ${CONFIG.VERSION}.
 * To change: edit tools/make-forms.mjs or the counts in js/config.js,
 * run "node tools/make-forms.mjs", and bump CONFIG.VERSION.
 */
const FORMS = ${JSON.stringify(forms)};
`;
fs.writeFileSync(path.join(root, "js/forms.js"), out);
for (const [name, f] of Object.entries(forms)) {
  console.log(`${name}: ` + Object.entries(f).map(([task, list]) => `${task} ${(list.items || list).length} trials`).join(", "));
}
