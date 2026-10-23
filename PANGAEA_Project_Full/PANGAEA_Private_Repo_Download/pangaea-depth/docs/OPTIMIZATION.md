# Realms 0.5.1 — performance and verification

23 October 2026. Baseline: merged Realms 0.5, commit `bd967b422bba2466e1e27e2f52c51bd36a7110eb`. Current standalone HTML SHA-256: `231db236f65ef0a3790fce5f83af2de4661a3923ce9eaf2d8be9bb2bf4b14009`. No runtime dependency, balance, save format or artwork change. The simulation ruleset identifier stays `realms-0.5`.

## Measured results

Node v24.19.0, Linux, Intel Xeon Platinum 8370C, four available logical CPUs. Each implementation warms up on the same constructed 250-person city. Three measured samples alternate baseline/candidate order in the same process. Timings include only advancing the simulation; construction, hashes, invariants and save/resume are outside the timed section. Four founders use an ordinary 30-day opening; larger rows use explicitly constructed three-day city workloads (12 complete ticks).

| Starting people | Baseline median | Current median | Speedup |
|---|---:|---:|---:|
| 4, natural opening | 56.2 ms | 41.0 ms | 1.37× |
| 250, constructed city | 170.7 ms | 86.9 ms | 1.96× |
| 1,000, constructed city | 851.9 ms | 543.3 ms | 1.57× |
| 2,000, constructed city | 2,269.5 ms | 1,272.1 ms | 1.78× |

Chromium 154 at 1600×1000, paused city, fixed drawing time, five warm-up draws and 45 timed draws per view:

| People / view | Baseline median | Current median | Speedup |
|---|---:|---:|---:|
| 1,000 / close (1.7×) | 16.5 ms | 8.3 ms | 1.99× |
| 2,000 / close (1.7×) | 27.0 ms | 8.9 ms | 3.03× |
| 1,000 / overview (0.72×) | 36.0 ms | 35.8 ms | Roughly unchanged |
| 2,000 / overview (0.72×) | 38.7 ms | 40.0 ms | Roughly unchanged |

These are cloud observations with scheduling variance, not hardware-independent guarantees. Canvas timings measure CPU draw submission, not sustained FPS. The overview still draws many trees, buildings and fields. A large-population tick can exceed a frame budget. MAX benefits from faster exact ticks but still executes on one simulation thread; all-core workers are future work. Constructed benchmarks establish neither natural metropolitan growth nor long-term balance.

## Changes and correctness

A CPU profile identified repeated pathfinding, reservation scans, social pools and per-person rendering scans. A* now reuses typed arrays/queue storage and holds at most 512 directional routes per map. Road/building/navigation changes invalidate routes, and each returned path owns its points. Float32 costs, neighbor order and search limits are preserved.

Large settlements use tick-local spatial buckets and ordered bit iteration for social pools; villages below 64 people keep a direct scan. Original resident order and age preference remain exact, preserving random choices. Movement and care update local indexes immediately. Resource-node and adult field assignments update around each actor. Research and crop availability caches invalidate after discoveries, sowing/harvesting, stock changes and layout changes. These caches are derived state and never enter exports.

Drawing gathers residents once per frame and appends/reverses person hits once instead of prepending each one. The inspector only replaces changed markup: over a paused 1.3-second observation it went from three replacements to zero, retaining keyboard focus, scroll and nodes. Changed worlds and loaded saves still refresh it.

All 61 unit/regression tests pass. Five new regressions exercise ordered social pools/movement/age boundaries, patient priority updates, route ownership/invalidation, multiple discoveries within a tick and two farmers sowing different fields within a tick. Independent review also matched 1,200 routes against baseline through LRU eviction, 143 social queries after movement, and 1,000 patient updates.

Complete snapshots match baseline for every measured sample. Seven additional continuations match exactly: three event-enabled seeds for 720 days, the natural 0.5 30-year save for 180 days, legacy v2 40-year and Cities century migrations, and a constructed illness/shortage/interrupted-work/death/paving case. Each passes invariants and exact save/resume. The seven continuations then match baseline again after the resume interval. All four paused city canvases have identical pixel hashes and complete click-target ordering. Drawing leaves world snapshots unchanged. Desktop and 390×844 supply screenshots were visually inspected; mobile controls and panel have no horizontal overflow. No browser page errors were observed.

All 55 existing browser acceptance checks and six optimization browser checks pass, including exact MAX reference replay and responsive pause. Full browser results, raw timing samples, snapshot/pixel/build hashes and verification metadata are retained under `EVIDENCE/optimization/`. Earlier evidence and all curated saves remain preserved.

## Reproduce

From the application directory, archive the baseline without replacing the checkout:

```sh
mkdir -p /tmp/pangaea-opt-baseline
git -C ../../.. archive bd967b422bba2466e1e27e2f52c51bd36a7110eb:PANGAEA_Project_Full/PANGAEA_Private_Repo_Download/pangaea-depth | tar -x -C /tmp/pangaea-opt-baseline
node /tmp/pangaea-opt-baseline/build.mjs
npm run build
npm test
npm run benchmark:optimization -- --baseline /tmp/pangaea-opt-baseline --out /tmp/pangaea-optimization-benchmark.json
npm run test:optimization-browser -- --baseline /tmp/pangaea-opt-baseline --out /tmp/pangaea-optimization-browser
npm run test:browser
```

Without `--baseline`, the new runners test the current implementation without claiming a comparison. Browser artifacts default to a fresh temporary directory. Existing browser runners refresh historical evidence locations; preserve their original versions when collecting a new delivery's reports. Chromium/Python Playwright are needed only for QA; the game itself is offline and self-contained. Firefox, Safari and physical touch devices were not tested.
