# PANGAEA Depth 0.2 — verification notes
**16 October 2026**

## Result

**14 automated simulation tests passed. 19 browser checks passed.** The browser runner recorded no page exceptions and no external network requests. Seeded simulation checks found no violations of the implemented state invariants in the tested runs.

This is limited regression evidence, not AAA certification, a security audit, a statistically representative balance evaluation or a claim about maximum population performance.

## Seeded scenarios

| Seed | Simulated years elapsed | Living people | Settlements | Total births | Total deaths | Completed structures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 481217 | 10 | 11 | 1 | 7 | 0 | 14 |
| 481217 | 20 | 16 | 1 | 12 | 0 | 17 |
| 481217 | 30 | 20 | 2 | 16 | 0 | 27 |
| 481217 | 40 | 29 | 4 | 25 | 0 | 49 |
| 481217 | 60 | 37 | 4 | 37 | 4 | 56 |
| 17 | 10 | 10 | 1 | 6 | 0 | 13 |
| 9901 | 10 | 11 | 1 | 7 | 0 | 14 |
| 881 | 10 | 10 | 1 | 6 | 0 | 13 |

Seed 481217 completed three migration departures by year 40. Its continuation includes four deaths by year 55, with the living population continuing to develop. No manual resource gifts or manufactured residents were used in these seeded runs. The maps intentionally contain reachable starter resource nodes; this is an explicit opening-balance rule, not a naturally validated ecology.

The original forty-year headless run took approximately 26.1 seconds under Node 22.16.0 in this container. The subsequent twenty-year continuation took about 30.3 seconds. These are simulation-only observations, not browser frame-rate benchmarks or predictions for the user's computer. The populations and amount of state differ between runs.

## Unit checks

`npm test` verifies exact four-founder initialization; deterministic same-seed evolution; save continuation; rejection of old/malformed saves; atomic resource spending; gathering/carrying/delivery conservation; materials before construction progress; cooking input/output; a fractional-ration deadlock regression; memory-driven decision influence; childhood action limits and family exclusions; births with parent links; drought/regrowth differences; adjacent walkable A* routes; and death/partner/grief behavior.

Some tests exercise individual internal methods with controlled state. They do not prove every possible combination of subsystems. The simulation invariants check duplicate people, ages, reciprocal living partnerships, walkable living positions, bounded needs, finite/nonnegative carried and communal inventories, and natural resource bounds. They are not an exhaustive proof of resource accounting or navigation optimality.

## Browser checks

Chromium 144.0.7559.96; desktop viewport 1600×1000 and emulated touch/mobile viewport 390×844. The checks exercise boot, pause and keyboard resume, view switching, mature-save restoration, people/knowledge/chronicle inspectors, overlays, pointer drag, wheel zoom, canvas building inspection, JSON download/import, drought intervention, storage error fallback, modal controls and horizontal overflow. Screenshots of the actual canvas states are included in `previews/`.

**Environment limitation:** the runner's Chromium policy blocked `file://` and loopback navigation. No policy was changed. The same complete standalone HTML was loaded with Playwright `page.set_content`. Export/import worked. Successful localStorage persistence and normal file launching were **not** verified in that restricted origin. The app reports storage errors and offers JSON export rather than silently saying a save succeeded.

Safari, Firefox, real mobile devices, long suspended-tab behavior, browser storage quotas, all population/settlement caps, accessibility with screen readers, and every seed were not tested. Reduced-motion behavior and a full visual accessibility audit remain open.

## Reproduce

```sh
npm run build
npm test
node tests/long-run.mjs 481217 40
node tests/continue-run.mjs
node tests/long-run.mjs 17 10
node tests/long-run.mjs 9901 10
node tests/long-run.mjs 881 10
CHROMIUM_PATH=/usr/bin/chromium python3 tests/browser.py
```

Long runs write report JSON and regenerate the relevant checkpoints. Browser tests need separately installed Playwright and Chromium. `tests/browser-results.json`, `tests/unit-results.tap`, `tests/scenario-*.json` and `tests/continuation-60-years.json` preserve observed results.

## Bugs fixed during this pass

Fractional pantry amounts no longer cause agents to select impossible one-ration meals indefinitely. Repeated hunger memories have cooldowns and bounded mood contribution instead of flooding the memory set. Short-distance travel was rebalanced so productive work can realistically support the game's accelerated needs. Self-bonding is ignored. Carried inventory survives task replanning. JSON-loaded colors and core enums are validated before insertion into the DOM.

## Open production work

Persistent household plans, asymmetric social conflict, full worker isolation, coherent global/local terrain, deeper ownership and markets, richer animal/ecology simulation, model integration and inference budgets, production art/animation/audio, and cross-browser QA remain open. The current build is a depth prototype.
