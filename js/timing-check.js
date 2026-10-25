/*
 * timing-check.js — measurements for timing.html (see the comment there).
 *
 * All times come from performance.now() / requestAnimationFrame timestamps,
 * the same clocks the tasks use.
 */

const results = {};   // name -> { value, note }
const $ = (id) => document.getElementById(id);
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

function show(name, value, note = "") {
  results[name] = { value, note };
  const tbody = $("results").querySelector("tbody");
  tbody.innerHTML = "";
  for (const [k, v] of Object.entries(results)) {
    const tr = document.createElement("tr");
    for (const text of [k, v.value, v.note]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// ---- Device ----
show("Date", new Date().toISOString());
show("App version", CONFIG.VERSION);
show("Device / browser", navigator.userAgent);
show("Screen", `${screen.width} x ${screen.height} (pixel ratio ${devicePixelRatio})`);

// ---- 1. Automatic checks ----
async function runAuto() {
  $("run-auto").disabled = true;
  const status = (t) => { $("auto-status").textContent = t; };

  // Screen refresh: frame-to-frame intervals for 5 s.
  status("Measuring the screen refresh (5 s)...");
  const frames = [];
  let prev = await nextFrame();
  const end = prev + 5000;
  while (prev < end) { const t = await nextFrame(); frames.push(t - prev); prev = t; }
  const frameMs = median(frames);
  const dropped = frames.filter((d) => d > frameMs * 1.5).length;
  show("Screen refresh", `${round(1000 / frameMs, 0)} Hz (one frame = ${round(frameMs, 2)} ms)`,
    `median of ${frames.length} frames; SD ${round(sd(frames), 2)} ms`);
  show("Dropped frames", `${dropped} of ${frames.length} (${round(100 * dropped / frames.length, 1)}%)`,
    "frames that took over 1.5x the normal time; should be near 0%");

  // Timers: how late does a 100 ms timer fire?
  status("Measuring timer accuracy (4 s)...");
  const late = [];
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    await wait(100);
    late.push(performance.now() - t0 - 100);
  }
  show("Timer lateness", `mean ${round(mean(late))} ms, 95% within ${round(pct(late, 0.95))} ms, max ${round(Math.max(...late))} ms`,
    "how late a 100 ms timer fires (sets trial lengths and the 2-back pace)");

  // Stimulus onset: from asking to show something to the frame that draws it.
  status("Measuring stimulus onset (5 s)...");
  const onset = [];
  const flash = $("flash");
  flash.hidden = false;
  for (let i = 0; i < 40; i++) {
    await wait(60 + Math.random() * 60);        // a random moment, like a real task
    const asked = performance.now();
    flash.classList.toggle("on");               // "show the stimulus"
    const frameTime = await nextFrame();        // the frame that draws it (the tasks' onset time)
    onset.push(frameTime - asked);
  }
  flash.hidden = true;
  show("Stimulus onset delay", `mean ${round(mean(onset))} ms, max ${round(Math.max(...onset))} ms`,
    "from a change being requested to its frame; the tasks time from that frame, so this delay is NOT in the reaction times");

  status("Done.");
  $("run-auto").disabled = false;
}
$("run-auto").addEventListener("click", runAuto);

// ---- 2. Touch check ----
const handlerDelay = [], clickLag = [];
const types = new Set();
let lastDown = null;
const target = $("tap-target");
target.addEventListener("pointerdown", (e) => {
  const now = performance.now();
  // e.timeStamp: when the browser created the event; now: when our code runs.
  handlerDelay.push(now - e.timeStamp);
  types.add(e.pointerType);
  lastDown = now;
  target.classList.add("hit");
  setTimeout(() => target.classList.remove("hit"), 80);
});
target.addEventListener("click", () => {
  if (lastDown === null) return;
  clickLag.push(performance.now() - lastDown);
  lastDown = null;
  $("tap-count").textContent = `${clickLag.length} / 20`;
  if (clickLag.length === 20) {
    show("Touch: event to code", `mean ${round(mean(handlerDelay))} ms, max ${round(Math.max(...handlerDelay))} ms`,
      "from the browser creating the touch event to the app's code running (part of every RT)");
    show("Touch: click after pointerdown", `mean ${round(mean(clickLag))} ms (SD ${round(sd(clickLag))})`,
      "how much later a 'click' would have timed the tap; the app uses pointerdown");
    show("Input type", [...types].join(", "), "touch = finger, mouse, pen");
    $("tap-count").textContent = "Done";
  }
});

// ---- Copy ----
$("copy").addEventListener("click", async () => {
  const text = Object.entries(results).map(([k, v]) => `${k}: ${v.value}${v.note ? "  (" + v.note + ")" : ""}`).join("\n");
  try { await navigator.clipboard.writeText(text); $("copied").textContent = "Copied."; }
  catch (e) { $("copied").textContent = "Couldn't copy automatically: select the table and copy it."; }
});
