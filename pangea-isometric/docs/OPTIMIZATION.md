# PANGEA 0.7.2 optimization

23 October 2026. This follow-up compares against the already optimized main commit `b5cbecf99269a55ff74f92f053e656f78f6d0f93` (0.7.1). The measurements below are additional gains on the same cloud machine, not comparisons against the original simulation.

## Simulation and persistence

Three alternating baseline/candidate samples compare complete snapshots after every timed run. Setup, hashing, invariants and save/resume are outside the timed section. Node v24.19.0, Linux, Intel Xeon Platinum 8370C; simulation execution remains single-threaded.

| Starting people / workload | 0.7.1 median | 0.7.2 median | Additional speedup |
|---|---:|---:|---:|
| 4 founders, 30 days | 51.1 ms | 47.2 ms | 1.08× |
| 250, constructed city, 3 days | 101.8 ms | 79.2 ms | 1.29× |
| 1,000, constructed city, 3 days | 515.1 ms | 378.9 ms | 1.36× |
| 2,000, constructed city, 3 days | 1,307.5 ms | 816.8 ms | 1.60× |
| 2,000, constructed city, 15 days | 7,444.2 ms | 4,952.2 ms | 1.50× |
| 2,000, constructed winter, 15 days | 8,986.9 ms | 5,087.3 ms | 1.77× |

These final runner results include exact save/resume checks between samples, outside timing. A separate advance-only paired run measured 1.59×/1.85× for the 1,000/2,000-person three-day cases and 2.14× for winter. Repeated runs therefore show approximately 1.4–1.9× on the large three-day workloads, with timing and garbage-collection variability; no single multiplier applies to every world.

The winter case explicitly starts on day 270 with planet temperature −15°C. These are constructed scale workloads; they do not establish natural city growth or guarantee throughput on other machines. Social contact selection uses a bounded 32-query, tick-local ordered bitset cache with incremental movement updates. It retains resident order, group preference, the existing same-tick death behavior and RNG consumption. Winter clothing delivery takes one resident snapshot instead of repeatedly rebuilding it for every person. All derived indexes stay out of saves.

The server retains the committed snapshot JSON for HTTP responses and serializes state once per durable commit. Complete localhost HTTP reads, including body transfer, measure 3.2–3.5× faster at 240/2,000 people across two paired runs; eight SQLite WAL/FULL commits measure 1.4–2.0× faster. The final run measures reads at 550.6→157.1 ms / 836.1→254.4 ms and commits at 523.5→368.0 ms / 899.2→471.7 ms, respectively. These timings exclude simulation stepping, fixture setup and client validation. Historical checkpoint bytes, authentication, command revisions and response JSON remain preserved. The browser still validates received snapshots, but unchanged paused polls retain the current simulation and renderer instead of rebuilding them.

Storage regressions also fixed two failure paths: a rejected `BEGIN IMMEDIATE` restores the last committed simulation, and recovery from an older checkpoint advances the authoritative revision. Recovery retains the historical checkpoint rows, pauses the world and clears its elapsed backlog. Clients therefore observe recovery as a new world state.

## Rendering and verification

A settled settlement camera retains one transparent, device-resolution terrain raster of at most eight million pixels (about 32 MB of RGBA storage). Moving cameras draw terrain directly. Camera, viewport/DPR, terrain replacement, map layer, settlement and world replacement invalidate the cache; world view and oversized viewports release it. Roads use native cached paths and viewport culling, while ocean motion, people, crops, roads, weather and lighting remain live. Hit lookup no longer copies/reverses the hit list.

Rendering results vary by view and run. An isolated paced run improved about 1.25× in three views, with a fourth 1.69× result affected by a baseline outlier. The final production acceptance repeat measured 1,000-person views at 46.2→49.3 and 43.4→44.1 ms per frame (flat to slightly slower), while 2,000-person views improved 59.4→53.1 and 55.9→45.1 ms (1.12–1.24×). Both use 48 animation frames after ten warm-ups. Final median CPU draw submissions fell from 19.8–25.2 ms to 4.2–9.1 ms, freeing main-thread time, but deferred canvas/GPU work limits presentation throughput. Across these runs, tight batches including a synchronous flush ranged from 0.95× to 1.51×. Raw submission medians alone are not a valid overall speedup claim. Panning and cold/rebuild frames do not receive the settled-camera benefit. These paused, software-Chromium measurements do not establish end-to-end simulation FPS.

All 121 Node tests pass, including ordered contact/RNG/movement cases and five server serialization, legacy load, rollback, lock and recovery tests. Strict PANGEA lint, TypeScript, production and offline builds pass. Complete baseline snapshots, invariants and save/resume remain exact in all 36 measured simulation samples and seven additional natural, legacy-generation, migrated-save and scarcity continuations. Final standalone SHA-256: `1fabbe93c35bbb4def5ea11727c67ed6775317413357e557462b768d3355ceeb`.

The final production build passes 67 browser acceptance checks: 30 general, eight evolution, nine camera, six IndexedDB, ten server and four offline-export checks. The added server check observes a real paused poll and verifies that it retains the loaded simulation object and tick. Desktop and phone production screenshots were visually inspected.

The paced comparison/idle harness also passes all four checks: both implementations leave simulation state unchanged; the four views preserve complete hit geometry/order within the explicit pixel bounds; paused inspector queries stay at zero and resume after advancing.

The separate renderer regression passes 32 desktop/phone views with exact complete hit geometry/order, sampled picks and unchanged simulation state. Moving-camera, world and oversized fallback frames are pixel exact. Cached alpha compositing introduces small rounding differences: maximum 7/255 per channel; the worst fractional camera changes 0.905% of pixels, mostly by at most 2/255, with RMS 0.063/255. The four fixed performance views match exactly in three cases; the remaining view changes 0.0043% of pixels, maximum 6/255. Desktop and phone screenshots were visually inspected. No art, world rules or save format changed.

## Reproduce this follow-up

Run from `pangea-isometric/`; generated reports and screenshots default to temporary directories.

```sh
mkdir -p /tmp/pangaea-071-baseline
git -C .. archive b5cbecf99269a55ff74f92f053e656f78f6d0f93:pangea-isometric | tar -x -C /tmp/pangaea-071-baseline
npm test
npm run lint:pangea
npx tsc --noEmit
npm run build
npm run build:standalone
npm run benchmark:optimization -- --baseline /tmp/pangaea-071-baseline --seasonal --out /tmp/pangaea-072-simulation.json
npm run benchmark:server -- --baseline /tmp/pangaea-071-baseline --out /tmp/pangaea-072-server.json
npm run test:renderer:browser -- --baseline /tmp/pangaea-071-baseline
# Optional production UI/idle check with a running frontend:
npm run test:optimization-browser -- --baseline /tmp/pangaea-071-baseline --max-channel-delta 8 --max-changed-pixel-ratio 0.0001 --url http://127.0.0.1:3010/
```

The renderer regression runner compares desktop and DPR-2 phone views, complete hit geometry/order and actual picks. It also checks camera changes, terrain layers, navigation changes, reset, live ocean motion, lighting/weather and world-view cache release. Chromium is the tested engine; physical devices and other engines remain unverified.

## Historical 0.7.1 results

23 October 2026. This patch optimizes the active isometric app against main commit `9d37e49104201fd53a135db8f0b0b579bfc5a4e8`. It preserves the newer terrain, architecture, activity, camera, persistence and identity work. The earlier Canvas app also has an independently verified optimization patch under `PANGAEA_Project_Full/`; its drawing measurements describe that renderer only.

Final standalone SHA-256: `388977799024f5af71f6aefe57b6a4e7da1c18c29410788f067799b7c1f420fb`. The final production build passes 66 browser checks: 30 general, eight evolution, nine camera, six IndexedDB, nine server and four offline-export checks. The separate render/idle harness passes four checks, including exact pixels/hit geometry across four views. Final desktop and mobile settlement screenshots were visually inspected.

## Measured simulation throughput

Node v24.19.0, Linux, Intel Xeon Platinum 8370C, four available logical CPUs. Three samples alternate baseline/candidate order in the same process, after identical warm-up. Only simulation advance is timed: setup, snapshot hashing, invariants and save/resume are excluded. The natural four-founder opening advances 30 days; constructed cities advance three days (12 complete ticks).

| Starting people | Baseline median | Current median | Speedup |
|---|---:|---:|---:|
| 4, natural opening | 51.7 ms | 31.7 ms | 1.63× |
| 250, constructed city | 161.1 ms | 76.2 ms | 2.11× |
| 1,000, constructed city | 879.3 ms | 506.9 ms | 1.73× |
| 2,000, constructed city | 2,176.1 ms | 1,300.6 ms | 1.67× |

These are measured cloud workloads, not hardware-independent guarantees or evidence of natural metropolitan growth. The deterministic simulation remains single-threaded; large-city ticks can exceed the browser frame budget. The same optimized simulation module runs in local worlds and the authoritative server. Connected server worlds are still never stepped locally.

## What changed

A* reuses typed arrays and its queue, and holds at most 512 directional routes per town. Navigation/building/road changes invalidate the cache, and returned routes own their points. Float32 costs, neighbor order and search limits stay unchanged. Tick-local spatial social queries return residents in their original order, including adult/child preference, so random choices remain exact. Villages below 64 people use a direct scan. Patient and node/field reservations update around each actor. Research and crop caches invalidate after same-tick discoveries, illness/healing, sowing/harvesting, stock changes and new construction. All indexes/caches are derived, absent from saves.

The isometric renderer caches projected street geometry until its navigation revision changes; camera transforms still apply each frame. The React frame loop refreshes the inspector when the simulation object or tick changes; controls, save replacement and remote commands retain their explicit state updates. A paused production inspector made zero periodic food-summary queries over 1.1 seconds, then refreshed when simulation advanced. Canvas animation and input continue.

Isometric drawing CPU submission medians stayed roughly flat: 41–52 ms for the deliberately large 1,000/2,000-person full-canvas views in the new harness. The road cache removes repeated coordinate allocations, but these samples do not establish a general rendering speedup. Smaller UI canvases, other cameras and GPU configurations have different costs. No sustained FPS claim is made.

## Correctness and evidence

All 115 Node tests pass, including five new simulation regressions for ordered social pools/movement, patient priority, path ownership/invalidation, multiple research discoveries within a tick and distinct farmers within a tick. Three request-queue tests cover ordering, rejected polls and disconnected clients; two server/client tests cover clock/control revision boundaries, restart and stale controls after another client's import. Strict PANGEA lint, whole-repository TypeScript, the production Next.js build and the self-contained offline build pass.

Complete snapshots match the archived 0.7 app for every measured sample. Seven additional baseline comparisons cover three event-enabled generation-2 seeds for 720 days, an explicit generation-1 start, legacy v2 and Cities century imports, and a constructed illness/scarcity/interruption/death/paving case. Each passes invariants and exact save/resume. Generation versions, original terrain fingerprints, seeds and saved residents remain preserved.

Four 1,000/2,000-person city views at overview/close zoom have identical PNG hashes and complete hit geometry/order. Drawing leaves complete simulation snapshots unchanged. The isometric city/world screenshots were visually inspected. Browser acceptance and verification metadata are collected separately under `docs/qa/optimization/`; original 0.7 evidence and historical saves remain preserved. Timing samples, snapshot/pixel hashes and source/build hashes make the comparison reviewable. Chromium is the tested engine; Safari, Firefox and physical devices are unverified.

The server browser check exposed two control bugs. A Pause click during an in-flight poll returned without sending anything. After queueing it, all three revision retries could still be rejected when the server clock advanced faster than the round trip. Requests now serialize per client; failures release the queue, and connection identity is checked before sending/applying results. Implicit pause/resume/speed controls can cross clock-only commits if no newer control/import intervened. Explicit revision requests and imports still require the exact reviewed revision. Blind conflict retries were removed: an intervening control/import requires a fresh read/review, rather than applying an old command to an unseen replacement world. A derived control revision resets conservatively to the loaded revision on restart; no database schema or save change is needed. Authentication, speed validation and atomic storage stay intact. The browser regression holds a poll, clicks Pause and verifies that the server actually pauses after release; delayed-response/disconnect cases remain covered. Existing clients retain their earlier behavior; the clock-only option requires the updated frontend and server.

An early test attempt overlapped dependency installation and failed to load two packages; it also encountered a real-timer revision conflict under that load. After installation, the isolated scheduler and full regression suite passed. No test or server concurrency guarantee was weakened. The sandbox's default npm cache was unavailable, so installation used an explicit writable `/tmp` cache.

## Reproduce

From `pangea-isometric/`, archive the baseline without replacing the checkout:

```sh
mkdir -p /tmp/pangaea-isometric-opt-baseline
git -C .. archive 9d37e49104201fd53a135db8f0b0b579bfc5a4e8:pangea-isometric | tar -x -C /tmp/pangaea-isometric-opt-baseline
npm ci
npm test
npm run lint:pangea
npx tsc --noEmit
npm run build
npm run build:standalone
npm run benchmark:optimization -- --baseline /tmp/pangaea-isometric-opt-baseline --out /tmp/pangea-benchmark.json
npm start -- -H 127.0.0.1 -p 3002
```

In another terminal:

```sh
npm run test:optimization-browser -- --baseline /tmp/pangaea-isometric-opt-baseline --url http://127.0.0.1:3002/ --out /tmp/pangea-render-parity
PANGEA_URL=http://127.0.0.1:3002/ npm run test:browser
PANGEA_URL=http://127.0.0.1:3002/ npm run test:evolution
PANGEA_URL=http://127.0.0.1:3002/ npm run test:camera:browser
npm run test:persistence:browser
PANGEA_URL=http://127.0.0.1:3002/ npm run test:server:browser
npm run test:standalone
```

The renderer harness bundles both source revisions using the current unchanged dependencies and shared unchanged art, at a fixed draw time with reduced motion. Five warm-up draws precede 45 measured draws per view. Output defaults to a fresh temporary directory, and all generated bundles/screenshots remain outside source control. The benchmark without a baseline tests current scale/save-resume without claiming a comparison. The standalone export remains under ignored `dist/` and can be regenerated; no deployed preview or persistent server was updated by this patch.
