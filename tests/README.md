# Automated tests

These tests drive the real website in WebKit (Safari's engine) with an
emulated iPad. A **simulated participant** taps each task a known number of
milliseconds after the stimulus appears, and makes some deliberate mistakes,
so the tests can check that reaction times and scores are recorded correctly.

All test data is dev/test data. Nothing here ever touches the real Firebase
project: tests use quick mode (nothing uploaded) or the local **Firebase
Emulator** (a fake Firebase on this computer).

## One-time setup

```
npm install                 # installs Playwright and firebase-tools (test tools only)
npx playwright install webkit
```

The emulator test also needs Java (e.g. `brew install --cask temurin`).

## Running

Start the local server first, in its own terminal: `python3 tools/serve.py`

| Command | What it checks | Needs | Time |
|---|---|---|---|
| `npm run test:tasks` | All five tasks in one quick-mode session: order, trials follow the frozen forms, scoring (incl. mistakes and no-taps), reaction-time accuracy, DSST time limit, 2-back pace | server | ~3 min |
| `npm run test:schedule` | Session plan, counterbalancing, 24-hour lock (with dev mode off) | nothing | 1 s |
| `npm run test:e2e` | The whole study in the emulator: sign-up, all 8 sessions, quitting and continuing on a second device, uploads, researcher download matches the uploads, security rules refuse 10 kinds of misuse | server + Java | ~8 min |
| `npm run test:calibration` | TloadDback calibration rule: simulated people of known ability end at the right pace; pace choice for T-fatigue | nothing | 1 s |
| `npm run test:tload` | TloadDback in quick mode: familiarization + calibration lands at the simulated person's limit; the 16-min task (40 s in dev) keeps an exact pace, one continuous stream, every item scored, RT recorded | server | ~6 min |
| `npm run timing` | How long the real-length battery takes (a measurement, not pass/fail) | server | ~20 min |

Each test prints one PASS/FAIL line per check and a total at the end.

**Keep the Mac awake and not overloaded while tests run** (e.g. `caffeinate -dims npm run test:e2e`).
The tests use real timers; if macOS sleeps or is swapping heavily, timers in the
test browser stall and a session can time out (a helper prints "STUCK for 60 s"
with the screen it stopped on). That is the computer, not the app: rerun when
the Mac is idle or after a restart.

## How the timing checks work

The simulated participant schedules its tap for, say, 300 ms after the frame
on which the stimulus is drawn. If the app records 300–303 ms, the app's own
timing (requestAnimationFrame onset, `pointerdown` responses) adds at most a
few milliseconds. This checks the software; it does not measure the touch
screen's own delay, which needs a real iPad.
