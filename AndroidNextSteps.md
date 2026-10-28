# Android app: next steps (on hold 2026-10-28)

**On hold 2026-10-28, decision pending.** The end user isn't keen on an
offline app, and sideloading or paying for Play is a lot of work and
money for a hobby. Being considered: proposing Google Play's **internal
testing track** to the end user (one-time Play developer fee; the
developer is willing to pay it himself). If it's not that, no app. iOS is out (Apple's USD 99/year fee).

Everything below picks up where the work stopped. Background and
decisions: `AndroidApp.md`.

## Where things stand

Done, committed and deployed (image 0.1.1):

- All calculations the app uses run in the browser, in
  `static/engine/` on the dev server: charts, divisional charts,
  panchanga, transits, time zones, Muhurta analysis and search. All
  of it matches the server exactly (parity tests in this repo:
  `tests/engine-*.spec.js`).
- `index.html` follows the rule **"server reachable → use the server;
  otherwise use the engine"** through `apiFetch()`. Offline answers come
  from `static/engine/offline-api.js`. Tested in
  `tests/offline-mode.spec.js`.
- Website behaviour is unchanged: the engine only loads when the server
  can't be reached.

Not started: the Android project itself. Repo `jyotish-query-android`
exists on GitHub (AGPL licence, Android .gitignore), still empty.

## Before starting (on Windows, not WSL)

1. Install **Android Studio** (default options); open it once so it
   downloads the Android SDK. It includes the phone emulator, so no test
   phone is needed.
2. Install **Node.js** (LTS) for Windows, for Capacitor's command-line
   tool.
3. Clone `jyotish-query-android` to
   `C:\Users\brook\Desktop\builds\jyotish-query-android`.

## Build steps

1. **Capacitor project** in `jyotish-query-android`: `npm init`,
   install `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`;
   `npx cap init` (app id e.g. `net.allthisisthat.jyotish`, name
   "Jyotish Query"); `npx cap add android`.
2. **Bundle the web files.** A script copies the current `static/`
   folder from the dev server (or a checkout of `jyotish-chart-saas`)
   into the app's web folder, with `index.html` at its root and
   `static/` beside it, the same layout the website serves. No copy of
   `index.html` is kept in this repo, so it can't drift.
3. **Server address.** In the app, `index.html` must call
   `https://jyotish.allthisisthat.net/api/...` instead of `/api/...`:
   set `window.JYOTISH_API_BASE` before the main script (`apiFetch()`
   already reads it).
4. **Let the server accept the app's requests.** Either enable
   Capacitor's native HTTP (`CapacitorHttp`, no server change), or add
   a CORS rule on the server for the app's origin
   (`https://localhost`). Prefer CapacitorHttp.
5. **Bundle `marked`** (help pages' Markdown renderer). `index.html`
   loads it from the jsdelivr CDN, unversioned. Copy a pinned version
   into `static/` and load it from there, on the website too.
6. **Icons and splash**: reuse `static/icon-512.png`.
7. **Signing key.** Create a release keystore and keep it safe, with a
   backup. Every update must be signed with the same key, or users have
   to uninstall (losing their data) to update.
8. **Build and test** in the emulator: online (uses the server) and
   with networking switched off (uses the engine). Check New Chart,
   transits (slider and arrows), Muhurta, Export/Import, help pages.
9. **Distribute.** Either sideload the APK, or use Google Play's
   internal testing track (see below).

## Open questions

- **Charts and transits on the phone even when online?** The current
  rule sends everything to the server when it is reachable. Computing
  charts and transits on the phone always (identical results) would
  make the transit slider and arrows react instantly over a slow mobile
  connection, keeping the server for place search and Muhurta.
- **Update notice.** A sideloaded app doesn't update itself. The app
  could check the server for a newer version and say so.
- **Moving data from the browser to the app.** The app has its own
  storage. Use Export in the browser, then Import in the app.
- **Play Store route.** One-time USD 25 developer account, identity
  verification. The internal testing track (up to 100 testers added by
  email) delivers installs and updates through the Play Store without a
  public release. A public release from a new personal account first
  needs a closed test with several testers over about two weeks (check
  Google's current rules when the time comes).
- **iPhone/iPad**: not possible without an Apple developer account
  (USD 99/year) and App Store or TestFlight; sideloading isn't
  available there.

## Why (for the end user)

The app is online-first: with a connection it uses the server exactly
like the website. Offline is a fallback, not a replacement. See the
pros and cons discussed on 2026-10-28.
