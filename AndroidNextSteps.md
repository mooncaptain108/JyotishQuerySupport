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

## Sideloading for the end user (Pakistan), checked 2026-10-29

Sideloading is possible today, but the end user has to click past
several security warnings. Google's new rules will make it harder in
2027.

### What the end user has to do

1. **Get the APK onto the phone.** Easiest: a download link on
   `jyotish.allthisisthat.net`, opened in Chrome on the phone. Gmail
   blocks `.apk` attachments. WhatsApp (sent as a Document) and Google
   Drive work, but often add their own warnings.
2. **Turn off Samsung Auto Blocker.** He has a Samsung. On recent One UI
   versions Auto Blocker is on by default and silently blocks installs
   from outside the stores: Settings → Security and privacy → Auto
   Blocker → Off. He can turn it back on after installing, but has to
   switch it off again for every update.
3. **Allow "Install unknown apps"** for the app that opens the APK
   (Chrome, My Files or WhatsApp). Android asks the first time and links
   straight to the switch.
4. **Get past Play Protect.** It will probably say it doesn't recognise
   the app, or block it: "More details → Install anyway". It may offer
   to send the app to Google for scanning; either answer is fine.
5. **Move his charts across.** The app keeps its own storage, separate
   from Chrome and from the installed web app: Export in the browser,
   Import in the app.
6. **Updates are manual.** Each new version: send a new APK, repeat
   steps 1–4. Installing over the old one keeps his data, as long as
   every version is signed with the same key. A different key forces an
   uninstall, which wipes his data. So: export before any reinstall, and
   back up the signing keystore.

Phone needs roughly Android 7 or later (Capacitor's minimum). Any recent
Samsung is fine.

### Pakistan specifically

- **Nothing Pakistan-specific blocks sideloading.** PTA's device
  registration (DIRBS) is about phone IMEIs, not apps. He already
  reaches the server from Pakistan via the website, so online mode works
  the same.
- **Google's developer verification rules are the real issue.** Since
  30 Sep / 1 Oct 2026, certified Android phones in Brazil, Indonesia,
  Singapore and Thailand refuse to install apps from developers who
  haven't verified with Google, sideloaded APKs included. A global
  rollout is planned for 2027, which would include Pakistan.
  - **Now:** Pakistan isn't in the first wave; steps 1–4 are enough.
  - **From 2027:** either register as a verified developer through the
    Android Developer Console (the same kind of identity check that is
    currently stuck on the Play account), or he uses Google's "advanced
    flow": enable developer options and wait a one-time 24 hours before
    unverified installs are allowed; reportedly it also applies to
    updates. Installing over USB with ADB from a PC still gets around
    it, but that's not realistic for him.

### Compared with Play internal testing

Internal testing removes nearly all of the above: no Auto Blocker
change, no unknown-sources switch, no Play Protect warnings, automatic
updates, and it already meets the verification rules. The cost is the
USD 25 fee and getting the Play account verified. Given how nervous he
was about the offline app, internal testing is clearly the smoother
option for him. Sideloading works for now, but each update means
repeating the warning screens, and from 2027 it gets worse.

Sources:

- [Android Developers Blog: Android developer verification (June 2026)](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)
- [Android Developers Blog: rolling out to all developers (March 2026)](https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html)
- [Understanding Android developer verification – Android Developer Console Help](https://support.google.com/android-developer-console/answer/16561738?hl=en)
- [Android Authority: advanced flow rollout begins](https://www.androidauthority.com/google-android-advanced-flow-sideloading-rollout-begins-3700073/)
- [XDA: advanced flow ahead of stricter verification](https://www.xda-developers.com/googles-controversial-advanced-flow-sideloading-rolling-out-ahead-of-stricter-developer-verification/)
- [Android Authority: bypassing the new sideloading rules](https://www.androidauthority.com/how-to-bypass-android-developer-verification-sideloading-rules-3718002/)
