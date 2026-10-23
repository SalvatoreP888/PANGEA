# PANGEA 0.7.1 optimization

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
git archive 9d37e49104201fd53a135db8f0b0b579bfc5a4e8:pangea-isometric | tar -x -C /tmp/pangaea-isometric-opt-baseline
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
