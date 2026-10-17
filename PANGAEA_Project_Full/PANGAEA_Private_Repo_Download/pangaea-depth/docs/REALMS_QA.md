# Realms 0.4 — verified results

17 October 2026. Node v24.19.0; Chromium 154.0.8037.57. Built standalone HTML SHA-256 `bec19eaf7607cc7506a097e6d6c15b77fd5b68ecf817b5e6869e8ff96cfce9d8`.

- `npm run build`: passed; standalone HTML has no runtime network dependencies.
- `npm test`: **46 passed, 0 failed/skipped**.
- `npm run test:browser`: **47 checks passed** (19 original, 14 city, 14 Realms); no page exceptions. All actual UI flows use HTTP or identical standalone content. Direct file navigation remains blocked by Chromium's administrator policy.
- `npm run benchmark`: 250/1,000/2,000-person constructed worlds passed invariants and exact save/resume comparison. These synthetic fixtures are labelled separately from natural growth.
- `git diff --check`: passed.

## Required fixes and acceptance evidence

The supplied road screenshot was reproduced with a mature world. The old renderer joined neighboring footfall cells into false streets and the planner reserved grid corridors. The new renderer only draws stored reciprocal street edges, branch construction joins one existing network, and parcels are irregular. `EVIDENCE/roads/century-before.png` / `century-after.png` show the same preserved buildings with the grid removed. A regression fills every walking counter to its maximum and compares the normal-view canvas exactly; it cannot create a road or junction. The Activity layer still displays traffic intentionally.

MAX has no simulated-days or tick-count target. It runs exact ticks in elapsed CPU-time slices and yields for interaction/rendering. In the fresh GitHub-delivery run it advanced **283.75 days in 2.19 observed seconds** (approximately 130 days/s), paused through the UI and exactly matched a reference simulation with the same tick count. An earlier run observed approximately 423 days/s; throughput varies with machine load. This is one cloud-machine observation, not a guaranteed rate or all-core execution claim.

Economy tests cover bank-sited fisheries, finite catches, carry/delivery, fish recovery, grain harvest, milling/baking/eating, atomic recipes, clay/bricks, flax/cloth warmth, and bounded specialist-field work. Climate tests cover both poles versus equator, altitude cooling, opposite hemisphere seasons, rainfall, editable bounds, saved parameters and disabled random weather. River tests check adjacent cells, strictly descending heights and a boundary outlet. Species tests cover four shared founders and inherited mixed parentage.

Browser acceptance covers Supply inputs/blockers, mixed-species composition, climate sliders applied without replacing people, MAX/fixed-speed switching, mature road saturation, animated descent, scroll in/out, reduced motion and 390px mobile controls. Actual screenshots and a short `space-city-transition.webm` recording are under `EVIDENCE/realms/`.

## Natural runs and current scope

The final seed-481217 run completed 30 years with **22 living people, 1 settlement, 25 discovered technologies and zero invariant failures**. Its food reserve was 132.6 days. Import `saves/realms-seed-481217-after-30-years.json` to inspect it.

Three 30-year natural runs were also completed during the Realms integration pass; they built fisheries, mills, bakeries, clay yards, kilns and weaving sheds without grants. Those runs preceded the final field-stock and warm-season sowing refinements; the final seed above was rerun afterward. Results for every seed, including lower population outcomes, are retained in `natural-scenarios.json`. The earlier Cities century run belongs to a historical ruleset and is not a Realms century certification. A new 20-seed/100-year release matrix was not run.

## Limits and research coverage

This is a compact fantasy/city game model. Dedicated warehouse buffers/output haulers, vehicle ownership, multi-core/worker execution, full weather/tectonic physics, species lifespan economies and seamless 3D globe-to-local terrain are not implemented. Crafts still consume/credit a communal store after a worker reaches the producer; harvested/caught resources are physically carried first. The view transition is a renderer-only zoom/fade between map scales.

Azgaar temperature/precipitation sources and Red Blob elevation/drainage code were actually inspected through GitHub. Official Songs of Syx and WorldBox pages and arXiv reads were blocked by proxy 403; exact current mechanics were not presented as freshly verified. See `REALMS_RESEARCH.md` and `research-sources.json` for exact reads, commits, licensing and original adaptations. FlatQueue is the only distributed third-party runtime code and remains ISC licensed.

Firefox, WebKit/Safari, physical mobile devices and a comprehensive accessibility audit remain unrun. Browser storage may be insufficient for large worlds; JSON export remains available. The owner subsequently authorized GitHub delivery on 17 October 2026. A fresh build, all 46 unit tests and all 47 browser checks passed before that merge; no deployment is included.
