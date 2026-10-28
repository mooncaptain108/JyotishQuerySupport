# Android app (offline)

End user wants the app on his Android phone, working offline, with the
same look and feel as the web app.

## Decisions (2026-10-27)

- **Approach:** keep `static/index.html` as the UI; move the calculations
  into the browser (JavaScript + Swiss Ephemeris WebAssembly); wrap
  `static/` with **Capacitor** to make the Android app. The web app gets
  offline use too.
- **Licence:** open source under the **AGPL**, so no Swiss Ephemeris
  commercial licence. `jyotish-chart-saas` is MIT (from rsaisankalp);
  keep that copyright notice. Source must be public once the app is
  handed out.
- **Repos:**
  - `jyotish-chart-saas` (dev server): the app *and* the engine,
    `static/engine/`.
  - `jyotish-query-android` (GitHub, AGPL, Android .gitignore): the
    Capacitor wrapper, cloned on Windows; builds copy in `static/`.
  - `JyotishQuerySupport` (this folder): tests, including
    `tests/engine-parity.spec.js`, and notes.
- **Tools:** Android Studio on Windows (emulator; no test phone yet),
  Node.js. Sideload APKs to the end user for testing.
- **When the phone is online:**
  - do the geo lookup for **new** locations (offline: saved atlas
    locations or typed coordinates only);
  - check whether **jyotish.allthisisthat.net** is reachable, and if so
    run Muhurta searches there; otherwise run them on the phone.

## Progress

1. Proof of concept (2026-10-27): chart, lagna, houses, nakshatras and
   dasha in the browser match the server exactly on 61 charts
   (`tests/engine-parity.spec.js`). About 2 ms per chart.
2. Engine moved to `static/engine/` on the dev server (2026-10-27).
3. Ported and matching the server (2026-10-27): divisional charts,
   panchanga (sunrise), transits, time zone offsets
   (`tests/engine-tz-parity.spec.js`) and zone lookup by coordinates
   (bundled map, coarse near borders: use the server when online).
   Ashtakavarga skipped: the app doesn't use it.

4. Muhurta (2026-10-27): analysis + screening (`muhurta.js`, port of
   `muhurta_analysis.py`) identical on 150 charts x 3 configs; search
   (`muhurta-search.js`, Web Workers) gives identical result lists to the
   server. Desktop: 10 days x 4 signs in 1.6 s. Phone speed unknown.

## Next

**Parked 2026-10-28** (end user not keen on an offline app). Next steps
are in `AndroidNextSteps.md`.

5. `index.html` switched (2026-10-27, server 9de62ac, image 0.1.1):
   server when reachable, engine otherwise, via `apiFetch()`. Remaining:
   the Capacitor wrapper.
