# Realms 0.5.1

- Faster exact simulation: reusable A* scratch arrays and a bounded route cache; ordered spatial social lookups; incremental resource/field/patient reservations; tick-local research and crop availability caches. Cache invalidation covers roads, buildings, harvesting, illness, healing and discoveries within a tick.
- City drawing reuses its resident list and builds person hit targets without repeated array prepends. Identical paused inspectors retain their DOM, focus and scroll. MAX benefits from the faster ticks and keeps its existing deterministic scheduler.
- Measured 1.6–2× faster constructed-city simulation and 2–3× faster close-up canvas submission against 0.5 on this cloud machine. Overview drawing remains roughly unchanged. No balance, save-format, terrain or art change; complete snapshots and rendered pixels match the baseline in tested scenarios.
- Added five regression tests plus reproducible timing, baseline-continuation, pixel/click-order and inspector checks. See `docs/OPTIMIZATION.md` for results and reproduction.

# Realms 0.5

- Industrial inputs must be carried into a producer's saved buffer. Crafted outputs remain at the producer until collected and delivered; full output buffers stop work. Eight recipe chains now pay local delivery time as well as worker travel.
- Supply and building inspectors expose delivered inputs, uncollected outputs, hauling, completed batches and blockers. Perishables decay inside workshop inventories too.
- Save validation rejects invalid delivery targets and incompatible marked cargo. Empty-catch/consumed-ration inventory keys are cleared before new shipments to keep large-city saves valid. Interruptions, death and passenger departure retain or recover materials under existing rules. Production reservations use incrementally maintained per-tick indexes.
- Primary-source research covers nine games, inspected WorldBox screenshots/changelog, pinned open-source collection/economy sources and specified climate-paper sections. See DEEP_RESEARCH.md for adopted concepts and future acceptance criteria.
- Regression, browser, constructed-scale and three natural 30-year reports are tracked separately in LOGISTICS_QA.md. Earlier fixtures remain preserved.

# Cities 0.3

- Compact, connected settlement frontages; people are about a quarter of their previous sprite size. Joined dirt/graded/paved streets replace square traffic marks. Zoom supports both city overview and close inspection.
- Housing progresses from 4-bed timber homes through 8-bed cottages, 20-bed terraces, 48-bed tenements and 96-bed apartments. The natural population admission limit is now 2,000, with pregnancies counted before admission. A safety ceiling is not a natural-growth promise.
- Thirty discoveries across five eras and five branches. The technology atlas shows prerequisites; available topics can be prioritized without discarding accumulated work. Later eras require a supporting population.
- Finite ore and coal, worker-operated iron/steel/machinery recipes, schools, universities, markets and rail termini. Irrigation, rotation, forestry, sanitation and mechanization change actual simulation behavior.
- Persistent intercity links evolve from trails to dirt roads, paved highways, steam and electric rail. Upgrades cost materials and builder labor. Freight leaves a stockpile, travels, then arrives once. Passenger services relocate existing individuals, reserve beds and carry consumed provisions; steam services burn coal. Arriving passengers bring the knowledge their origin held at departure.
- Searchable, paginated population inspector and transport overview. Explicit 1,000-person City laboratory in the world menu; it constructs a sandbox and is never represented as organically grown history.
- Indexed occupancy, cached building/people lookups, allocation-light FlatQueue A*, precomputed respect scores, culled drawing and cached road/resource art.
- Corrected blocked housing/industry chains, a university prerequisite cycle, underplanned winter food, and route objects retaining entire mutable towns across saves.

## Save compatibility

New exports are version 3. Version 2 saves remain importable: people, existing inventory, buildings and locations are retained; compact footprints and the new rules apply going forward. Finite geological seams and parent/child trails are initialized. This is a ruleset migration, not bit-identical continuation of 0.2 behavior. Local saves use a new key, with fallback reads of the old key. Version 0.1 remains unsupported. Preserve your original exported saves.

# Realms 0.4

See `docs/REALMS_CHANGES.md` for the road correction, MAX mode, eight new resource chains/producers, climate controls, mixed fantasy populations, new drainage and space/city transitions. Fresh checks and limits are in `docs/REALMS_QA.md`; the earlier Cities counts above are historical.
