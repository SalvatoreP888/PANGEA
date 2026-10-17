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
