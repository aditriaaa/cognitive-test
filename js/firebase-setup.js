/*
 * firebase-setup.js — connects the site to the Firebase project.
 *
 * Firebase does two jobs here:
 *   - Authentication: checks email + password logins (Firebase stores the
 *     passwords securely; this site never sees or saves them).
 *   - Firestore: the online database (location nam5, United States).
 *
 * This config is NOT secret. Every Firebase website ships it in its public
 * code. What protects the data is firestore.rules, which runs on Google's
 * servers.
 *
 * TESTING: ?emulator=1 in the URL connects to the Firebase Emulator (a fake
 * Firebase running on this computer) instead of the real project, under a
 * "demo-" project name that can never reach real data. Emulator runs are
 * always dev mode.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCBIte53wPzPhx92gXfFdd3znQ7SEuHDw8",
  authDomain: "cognitivebattery.firebaseapp.com",
  projectId: "cognitivebattery",
  storageBucket: "cognitivebattery.firebasestorage.app",
  messagingSenderId: "612001058740",
  appId: "1:612001058740:web:0b91a5ccfb4b19776c6ce1"
};

// The emulator only exists on the developer's own computer, so ?emulator=1 is
// ignored anywhere else. A participant opening a link that accidentally
// contains it still gets the real site instead of a login that can never work.
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const USE_EMULATOR = IS_LOCAL && new URLSearchParams(window.location.search).get("emulator") === "1";

firebase.initializeApp(USE_EMULATOR
  ? { ...FIREBASE_CONFIG, projectId: "demo-cognitivebattery" }
  : FIREBASE_CONFIG);

const fbAuth = firebase.auth();
const fbDb = firebase.firestore();

if (USE_EMULATOR) {
  fbAuth.useEmulator("http://127.0.0.1:9099");
  fbDb.useEmulator("127.0.0.1", 8080);
}

// Closing the tab logs the participant out (same as before), so a shared
// family computer doesn't stay logged in.
fbAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
