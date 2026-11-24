// video.test.mjs — the T-rest video, in quick mode (15 s instead of 16 min).
//
// Run:  python3 tools/serve.py   (in another terminal), then  npm run test:video
// Needs an internet connection (the video streams from Wikimedia Commons).
//
// Runs in Chromium and WebKit: the video (from Wikimedia Commons) loads,
// "Start video" appears, it plays to the end point counted in VIDEO time, a
// tap on the video does not pause it, the licence credit is shown, and the
// data row records what happened.
import { chromium, webkit } from "playwright";
import { BASE, check, finish, backupRows, playSession } from "./helpers.mjs";

for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch();
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true })).newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  await page.goto(`${BASE}/index.html?quick=1&type=test-rest`);

  // Answer the questions and sliders until the video screen offers "Start video".
  await playSession(page, { until: "#rv-start:not([hidden])", maxMinutes: 2 }).catch(() => {});
  const ready = await page.locator("#rv-start:visible").count();
  check(`${name}: video loads and offers "Start video"; credit shown`, ready === 1 && (await page.locator(".rv-credit").innerText()).includes("CC BY 3.0"),
    await page.locator("#rv-msg").innerText().catch(() => ""));
  if (!ready) { await browser.close(); continue; }

  await page.click("#rv-start");
  await page.waitForTimeout(4000);
  await page.locator(".rv-shield").click();         // a tap on the video must not pause it
  await page.waitForSelector(".rv-area", { state: "detached", timeout: 120000 }).catch(() => {});
  const row = (await backupRows(page)).find((r) => r.task === "rest_video");
  console.log(`  ${name} row:`, row && JSON.stringify({ watched: row.video_seconds_watched, wall: row.wall_seconds,
    ended_by: row.ended_by, pauses: row.n_pauses, stalls: row.n_stalls, error: row.error, source: row.video_source.split(".").slice(-2).join(".") }));
  check(`${name}: video plays to the end point (15 s of video in dev)`, row && row.ended_by === "reached the end point" &&
    Number(row.video_seconds_watched) >= 14.5);
  check(`${name}: a tap on the video did not pause it`, row && row.n_pauses === "0");
  check(`${name}: event log saved`, row && JSON.parse(row.events).some(([, what]) => what === "start tapped"));
  await browser.close();
}
finish();
