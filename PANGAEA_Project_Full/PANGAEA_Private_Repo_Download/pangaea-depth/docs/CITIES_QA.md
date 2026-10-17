# Cities 0.3 — fresh verification

Historical Cities 0.3 report. The reused city/browser/benchmark runners may refresh files under EVIDENCE/cities; use [REALMS_QA.md](REALMS_QA.md) for current results.

17 October 2026. Node v24.19.0; Linux; AMD EPYC 9V45 96-Core Processor. Browser: Chromium 154.0.8037.57. Build SHA-256: `b10352d9052a9d4fc6535befbdf7a4dc556ebc7af6674aaa94bebc14bb069056`.

## Passed

- `npm run build`: generated self-contained HTML, no runtime network dependencies. Original source/save fixtures remain preserved.
- `npm test`: **31 tests passed, zero failed/skipped** (14 original simulation regressions plus 17 city/technology/transport/save checks).
- `npm run test:browser`: **19 baseline + 14 city checks passed**, with zero page exceptions or external requests. Tests include HTTP boot; exactly four founders; pause; inspection; mature v2 migration; canvas camera/building interaction; drought; JSON export/import; actual-origin browser storage across reload; 30-node connected technology atlas; real freight arrival; live passenger display; population search/pagination; 390×844 mobile and 844×390 landscape layouts. Actual screenshots are retained, and inspected, in `EVIDENCE/cities/`.
- `npm run benchmark`: 250/1,000/2,000-person constructed worlds passed invariants and exact save/resume comparison after a further two days. The 2,000-person checkpoint is approximately 5.6 MB, so browser storage can be insufficient; portable export is available.
- `git diff --check`: passed.

## Natural growth (separate from synthetic fixtures)

Seed 481217, from exactly four founders with no interventions or grants, completed **100 years: 310 living people, two settlements, 30 technologies at the original settlement**, and no checked invariants failed. The imported checkpoint is `saves/cities-seed-481217-after-100-years.json`.

That century run completed before final presentation caching and the passenger knowledge-transfer polish; those additions passed focused simulation/browser coverage afterward. A second century run was not claimed. The end-of-winter original-settlement pantry is nearly empty. This is growth evidence, not a guarantee of stable food balance or future survival.

Three additional seeds completed 60 years without invariant failures:

| Seed | Living at year 60 | Settlements | Deaths |
|---|---:|---:|---:|
| 17 | 90 | 2 | 3 |
| 9901 | 83 | 3 | 2 |
| 881 | 63 | 3 | 4 |

The century run took approximately 262.9 seconds on this shared cloud machine. Natural worlds can die out, and no seed is tuned to an asserted population curve. The original four-founder baseline is preserved. The optional City laboratory is explicitly constructed and labelled in both city and globe views; its population/buildings/resources are never counted as natural growth.

Repeat natural checks with `npm run scenarios -- 481217 100` and `npm run scenarios -- 17 60` (also 9901 and 881). Add `--save` only when a separate generated world checkpoint is wanted; the runner never overwrites the original v2 fixtures.

## Measured performance

A matched synthetic opening workload (1,000 adults, seeded opening, ample temporary stocks, 12 ticks) had a three-run median of **1044 ms before versus 287 ms after**, approximately **3.6× faster**. Baseline commit: `547bd71c4632c96db789ed0c29e1634aaeec9948`. Trials were sequential on the same host, but normal cloud scheduling/JIT variation applies. This compares the combined indexing/occupancy/queue changes; it does not isolate FlatQueue's contribution.

Constructed city simulation (12 ticks, distinct from that opening workload):

| Population | Towns | Buildings | Elapsed ms | Exact save/resume |
|---|---:|---:|---:|---|
| 250 | 3 | 100 | 80.9 | passed |
| 1000 | 3 | 198 | 383.9 | passed |
| 2000 | 3 | 299 | 800.5 | passed |

In headless Chromium at 1600×1000 with 1,000 people, 60 explicit renderer draws measured a median **15.8 ms** and p95 **21.9 ms**. The pre-cache observation was about 27.9 ms median / 40.8 ms p95. These are draw costs, not full frame pacing or 60 FPS gameplay claims. Main-thread simulation ticks can still exceed a frame budget at large populations. Worker execution is a next architecture task.

## Defects diagnosed and corrected

- Housing selection could request an apartment before a steelworks/factory existed, blocking all construction. It now selects housing backed by available material chains.
- University inputs included machinery that required later science/steam progress. Its prerequisite cost cycle was removed.
- Too few fields and too small a winter reserve caused the first diagnostic natural run to collapse. Field targets and seasonal reserves were revised, then the century/additional-seed checks above were completed.
- A route's first point retained an entire mutable town object. JSON save/load duplicated that object and broke exact replay. Routes now contain coordinates only; regression comparisons include in-flight services and dense cities.
- Large city DOM lists, per-neighbor occupancy scans, repeated comparator reductions, terrain invalidation on gathering and repeated road/resource drawing were reduced or cached.

## Blocked / untested / remaining

- Direct `file://` launch: **blocked**, `ERR_BLOCKED_BY_ADMINISTRATOR` from Chromium policy. No policy was changed. HTTP and identical standalone content passed.
- Firefox, WebKit/Safari, physical mobile devices, sustained background tabs and comprehensive accessibility audits: **not run**.
- arXiv/ar5iv/export API reads: **blocked by proxy 403**. GitHub repository descriptions were inspected; papers were not represented as fully read. FlatQueue is pinned and licensed ISC; no OpenTTD, CityFlow or Generative Agents code/assets imported.
- The wider 20-seed/100-year release matrix from the old handoff remains **unrun**. Synthetic large populations do not prove natural worlds reach or sustain those sizes.
- Convoy crews, vehicles as owned assets, lane traffic, electric generation, full household goal graphs, worker execution and seamless globe/local geography remain **not implemented**. Steam fuel, construction labor, transported people, carried provisions and cargo arrival are implemented and tested.

Detailed raw evidence: `unit-results.tap`, `baseline-browser/browser-results.json`, `city-browser-results.json`, `benchmark.json`, `baseline-benchmark.json`, `natural-481217.json`, `natural-additional-seeds.json` and research source records under `EVIDENCE/cities/`.
