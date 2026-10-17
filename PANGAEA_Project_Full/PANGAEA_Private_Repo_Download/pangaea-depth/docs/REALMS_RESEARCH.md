# Realms 0.4 — game references and generation research

The owner requested Songs of Syx style supply chains, WorldBox style fantasy observation and a space-to-city transition. Those are design references; this is an original implementation on the existing PANGAEA engine, not a port or reproduction of either commercial game.

## Commercial references and access limits

The Songs of Syx Industry/Logistics wiki pages, its Steam page, and the WorldBox official site returned proxy HTTP 403 in this environment. Their current pages could not be inspected. No exact recipe, throughput statistic, mechanic detail or asset from those pages is presented as freshly verified. The following high-level design direction uses general prior knowledge of settlement-production and fantasy sandbox games, plus the owner's explicit requests:

| Direction | Implemented here | Remaining abstraction |
|---|---|---|
| Interdependent production | Wheat → grain → flour → bread; fish → meals; clay → bricks; flax → cloth; ore/coal → iron/steel/machinery | Recipes use a communal store; dedicated producer input buffers and warehouse-routing policies are not implemented. |
| Labor and delivery bottlenecks | People reach working buildings; harvests/catches/clay are carried to storage; atomic recipes require every input; shortages are exposed in Supply | Crafted outputs are credited to the communal store; dedicated output-hauler jobs are future work. |
| Avoid mindless overproduction | Grain/flax fields stop taking labor when stocks exceed authored local targets; grain acreage scales with population | Targets are authored; this is not a market-price or demand-planning solver. |
| Mixed fantasy civilization | Human, elf, dwarf and orc founders share the same settlement, jobs, storage, housing and kinship rules; descendants preserve mixed heritage | No racial segregation/war system. Species identity and appearance are implemented; distinct lifespans, magic and species economies are not claimed. |
| World observer and ecological interventions | Globe/city inspection, finite renewable fisheries, seasonal/local climate, six planet sliders and existing storm/drought experiments | No continuous simulation outside the active session; no full atmospheric solver. |
| Space to settlement | Animated selected-town zoom/fade, scroll into/out of cities, reduced-motion fallback | Globe and local maps remain separate scales; this is not seamless 3D terrain. |

## GitHub sources actually inspected

**[Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator/tree/b4a0dcb933586a57242508f558f775da16c35c64)** — MIT license and package metadata checked. Inspected `src/generators/temperature-generator.ts`: temperature by latitude and altitude, including the 6.5°C/km lapse rate. Inspected `src/generators/precipitation-generator.ts`: latitude rainfall bands, winds carrying humidity, and altitude barriers. Original compact PANGAEA code now combines warm equator/cold poles, opposite seasonal phase by hemisphere, elevation cooling, precipitation belts and a simple elevation-drying term. No Azgaar code or art is shipped, and its global-state runtime was not integrated.

**[Red Blob Games mapgen2](https://github.com/redblobgames/mapgen2/tree/f16f485a62510344afe13e9c6aa01f7fa25be17e)** — Apache-2.0 license checked; README and `elevation.js` inspected. Its coast-rooted graph traversal and downslope links informed the decision to store actual drainage. The smaller original grid implementation uses a boundary outlet, a weighted elevation traversal and a river path that strictly descends to that outlet. It reuses the vendored ISC FlatQueue. A full Voronoi/Delaunay engine migration was deferred.

**[simplex-noise.js 4.0.3](https://github.com/jwagner/simplex-noise.js/tree/4.0.3)** — MIT license, README seed injection and npm metadata checked. Evaluated and deferred: another noise generator alone would not solve climate or drainage, and replacing seeded geography would change existing save locations. No additional runtime dependency was added.

Machine-readable source records and blocked requests are in `EVIDENCE/realms/research-sources.json`. The existing FlatQueue license remains distributed beside its source and inside the standalone HTML. There are no new third-party game assets.
