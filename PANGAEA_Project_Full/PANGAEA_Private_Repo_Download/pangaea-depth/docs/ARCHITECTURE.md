# Implementation boundaries

## State and determinism

`Simulation.state` owns all gameplay state and the seeded linear-congruential random generator. There are four simulation ticks per game day and 360 days per game year. No `Date.now`, render delta, DOM or wall-clock random value drives gameplay. `snapshot()` produces ordinary JSON; `fromSnapshot()` validates, clones and migrates version 2 to the version 3 city ruleset before replacing a running world. Version 3 persists links, construction projects, journey modes, delivered totals, topic progress banks and local streets. Derived navigation/building/render caches are excluded.

The renderer reads this state but cannot advance it. Decorative smoke and globe marker pulses use an independent wall clock and are not serialized. The DOM UI schedules whole simulation steps within a frame budget. This is currently main-thread execution, not a Worker/ECS implementation.

## Decisions

`scoreActions` produces a sorted candidate set. It incorporates individual needs, trait bonuses, skills, current shortages, active jobs and the food-safety belief. `decide` finds a legal target, establishes a path and writes a task. `stepPerson` handles needs, interruptions and movement, then applies `work` after reaching the task destination. Task execution is internal; no external model action endpoint exists.

Gathering transfers a node's quantity into carried stock. Replanning preserves that stock. Delivery adds it to common inventory. `spend` checks every recipe input before subtracting anything. Completed farms do not generate food directly into storage: crops grow on the field and still need to be harvested and delivered. Some subsystems, such as spoilage and tool wear, use direct bounded arithmetic rather than going through the recent-transaction ledger; that ledger is not a complete event-sourced accounting journal.

## Navigation

Local maps retain 96×80 logical cells, with compact 1–3-cell building footprints and 16-pixel logical tiles. Housing density, not a larger terrain array, supplies city capacity. Buildings have occupancy footprints. A* explores four-connected legal cells with lower costs for constructed streets. FlatQueue supplies its priority queue; an occupancy mask is derived and invalidated on layout changes. Foot-traffic marks are visual; path cost uses infrastructure state so presentation cache timing cannot affect outcomes. Deep water/river cells are impassable; fords are walkable. Paths are rechecked as agents move so a changed obstacle invalidates a stale path. Movement is accelerated game time, not realistic walking speed.

Migration uses a coarse 180×90 planetary land grid. Local terrain is generated from the same seed and a settlement's context, but is not an exact projection of the global mesh. Persistent parent/child links and journeys display their actual coarse land routes. Route points contain only longitude/latitude: retaining a full town at an endpoint would duplicate mutable state on save/resume. These are not seamless planetary coordinates.

## Memories and family

Agents retain a small bounded episodic set. A memory contains a timestamp, tag, importance, mood contribution, text and affected IDs. Retrieval is importance plus recency plus tag match. A periodic rule-based reflection updates the food-safety belief. Memory influence is tested by comparing action scores with/without that belief.

Births add actual people with parent IDs, household lineage and separate needs. Adult partnerships require repeated contact; immediate family and grandparent pairings are excluded. There is no genetic model. House capacity, not a complete relationship-dependent room assignment model, controls shelter. The population admission check reserves space for existing pregnancies. The admission ceiling is 2,000 living people plus reserved pregnancies; expansion stops at 12 settlements. Constructed 250/1,000/2,000-person worlds were benchmarked and save/replay checked; this is separate from organic growth and is not a maximum-performance certification.

## Failure and continuity

Empty food stocks can cause health loss and death. Death releases the surviving partner and records grief. Drought, storms, winter and illness are simplified game systems. Total extinction is possible; it pauses the UI without erasing the chronicle. Forty-year checkpoints and a sixty-year continuation cover multiple generations and aging, but do not prove balance for every seed or century-long run.

Save validation rejects old versions, impossible shapes, some invalid references, out-of-range core values and unsafe style strings. This is not a comprehensive security audit, schema compiler or guarantee against every maliciously constructed input. Import size is capped in the UI. No arbitrary scripts or model-generated programs are evaluated.

## Next architecture work

Add stable goal IDs and a household plan graph; then isolated proposal schemas and event IDs. Move simulation into a Worker before increasing scene complexity. Profile object scans and A* allocations before choosing an ECS. Geography needs persistent regional/chunk IDs before a seamless globe. Model reasoning should be asynchronous and budgeted, with local fallback and stale-state rejection.

## City planning, production and transport (0.3)

`city.mjs` owns compact frontage siting, protected through streets, housing selection and road connection/resurfacing. The planner checks footprints, access, resource sites and existing individuals before placing a site. Housing selection checks whether advanced material chains actually exist; this avoids blocking a village forever on unbuilt steel or machinery industry. Construction still reserves inputs and requires a worker. Existing projects persist through immediate need interruptions, but this is not yet the full persistent household-goal system described in the original handoff.

`data.mjs` defines 30 technology nodes, housing capacities, recipes and five transport tiers. Research can select an available topic and retains progress in other topics. Later eras have authored population requirements. Every unlock has a building, recipe, capacity, speed or productivity effect; it is a finite game progression, not open-ended scientific invention.

`transport.mjs` keeps persistent links separate from journeys. Upgrading consumes the origin's materials once; builder tasks advance paid work. Dispatch validates seats, cargo, stations, fuel, destination beds, passenger identity and carried goods before mutation. Destination stock is credited on arrival once. Passenger provisions are packed, consume capacity and are eaten in transit. Incoming passengers and pregnancies reserve bed capacity. Passengers carry a departure-time copy of communal knowledge, which is shared after a living passenger actually arrives. Automatic relocation moves an eligible household when its origin is crowded and its destination has food/beds. Markets dispatch surplus against current demand while accounting for incoming cargo.

Transport is a bounded economic abstraction: crews, vehicle construction, power generation, track signals and lane congestion are not modeled. `scenarios.mjs` constructs an explicitly labelled sandbox for city-scale inspection; normal world creation never calls it.

## Performance boundaries

Population/job/building indexes avoid repeated full scans in per-person decisions. Occupancy is rebuilt only on layout changes; respect scores are computed before sorting. The renderer culls visible objects, caches road layers and resource sprites, and avoids rebuilding terrain after every gathering action. Static sprite variation is decorative; road traffic display refreshes at most every five game days, while authoritative paths use infrastructure tiers.

The simulation remains on the main thread. A single large-population tick can exceed a frame budget even when rendering is fast. See measured values in CITIES_QA.md rather than assuming 60 FPS. Worker isolation and broader held-out balance tests remain next work.

## Realms 0.4 corrections and additions

The street system above has been revised: `streetEdges` stores reciprocal actual connections and a per-town network version. New doors join the nearest existing network. Rendering traces these edges into rounded strokes; adjacent traffic cells never create roads. Old v2/v3 saves rebuild only street topology, preserving people/buildings/stockpiles/terrain. Parcel selection is irregular and respects actual street access rather than a reserved grid.

`economy.mjs` adds finite river habitat, fish catch/regrowth/spoilage and worker-gated production. There are now 19 resources and 36 discoveries. Specialized crops produce grain/flax, milling/baking produce bread, clay/kilns produce bricks, and weaving produces cloth. Gathered/harvested goods are carried to storage; recipes still consume and credit the shared store after a worker reaches a producer. Dedicated building buffers/output haulers are not implemented. Specialist fields stop taking jobs when stock targets are full.

Planet parameters and species/heritage are authoritative saved state. Temperature follows latitude, hemisphere season and elevation; rainfall belts and elevation drying affect biome classification. Local warm/cold conditions affect crops, warmth, fish and vegetation. A boundary-rooted weighted height traversal creates a strictly descending local river channel for new maps. Existing terrain is preserved during migration. This is not a global fluid/tectonic solver or seamless globe/local mesh.

MAX runs uncapped ticks in elapsed-time slices and yields for input/rendering. It shares the exact deterministic core with fixed speeds; no coarse population approximation is substituted. The animation is renderer-only: a zoom/fade snapshot transitions between separate map scales; reduced motion bypasses it. Species share the same economy, family and settlement systems, and offspring retain mixed heritage.

## Realms 0.5 physical production

`production.mjs` replaces shared-store recipe conversion for the eight industrial recipes. A supply task reaches the common store and atomically collects enough available ingredients to enable at least one batch, targeting two batches at the destination. A saved `productionDelivery` marker routes the carried shipment into that producer's input buffer. Work requires the correct building, knowledge, position and buffered inputs. Output stays in a separate four-batch buffer until a resident collects it and delivers it into common storage. Perishables decay inside buffers. Basic hearth cooking and primitive toolmaking retain their earlier shared-store model.

Producer inventories and batch counts are authoritative JSON state. Import validation checks resource compatibility, quantities and marked delivery destinations; malformed cargo cannot poison a producer's next save. Interrupted tasks retain carried material; death recovery and passenger packing preserve existing conservation rules. Old v2/v3 inventories and buildings are retained, with buffers initialized only when the new simulation uses them. Inspectors never initialize inventory or change state.

Derived task and inbound-delivery maps are built once per town/tick. The active actor is removed before its decision and added after its new state, making reservation queries independent of resident count. The maps are not saved. Direct out-of-tick score inspection builds the same index from current residents. This keeps deterministic order without repeated all-resident searches for every producer.

See LOGISTICS_QA.md for the current build, nine additional regressions, browser inventory checks, constructed-scale replay and natural growth. DEEP_RESEARCH.md records verified primary sources and separates future district warehouses, water budgets and street redundancy from implemented behavior.
