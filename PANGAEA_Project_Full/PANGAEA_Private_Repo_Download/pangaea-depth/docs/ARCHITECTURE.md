# Implementation boundaries

## State and determinism

`Simulation.state` owns all gameplay state and the seeded linear-congruential random generator. There are four simulation ticks per game day and 360 days per game year. No `Date.now`, render delta, DOM or wall-clock random value drives gameplay. `snapshot()` produces ordinary JSON; `fromSnapshot()` validates and clones it before replacing a running world.

The renderer reads this state but cannot advance it. Decorative smoke and globe marker pulses use an independent wall clock and are not serialized. The DOM UI schedules whole simulation steps within a frame budget. This is currently main-thread execution, not a Worker/ECS implementation.

## Decisions

`scoreActions` produces a sorted candidate set. It incorporates individual needs, trait bonuses, skills, current shortages, active jobs and the food-safety belief. `decide` finds a legal target, establishes a path and writes a task. `stepPerson` handles needs, interruptions and movement, then applies `work` after reaching the task destination. Task execution is internal; no external model action endpoint exists.

Gathering transfers a node's quantity into carried stock. Replanning preserves that stock. Delivery adds it to common inventory. `spend` checks every recipe input before subtracting anything. Completed farms do not generate food directly into storage: crops grow on the field and still need to be harvested and delivered. Some subsystems, such as spoilage and tool wear, use direct bounded arithmetic rather than going through the recent-transaction ledger; that ledger is not a complete event-sourced accounting journal.

## Navigation

Local maps have 96×80 logical cells. Buildings have occupancy footprints. A* explores four-connected legal cells with a lower cost for worn paths. Deep water/river cells are impassable; fords are walkable. Paths are rechecked as agents move so a changed obstacle invalidates a stale path. Movement is accelerated game time, not realistic walking speed.

Migration uses a coarse 180×90 planetary land grid. Local terrain is generated from the same seed and a settlement's context, but is not an exact projection of the global mesh. Completed parent/child settlement links on the globe are schematic; active journeys display their coarse land routes. These are not seamless planetary coordinates.

## Memories and family

Agents retain a small bounded episodic set. A memory contains a timestamp, tag, importance, mood contribution, text and affected IDs. Retrieval is importance plus recency plus tag match. A periodic rule-based reflection updates the food-safety belief. Memory influence is tested by comparing action scores with/without that belief.

Births add actual people with parent IDs, household lineage and separate needs. Adult partnerships require repeated contact; immediate family and grandparent pairings are excluded. There is no genetic model. House capacity, not a complete relationship-dependent room assignment model, controls shelter. The population admission check reserves space for existing pregnancies. The maximum planning population is 250; expansion stops at 12 settlements. Neither maximum has been performance-certified.

## Failure and continuity

Empty food stocks can cause health loss and death. Death releases the surviving partner and records grief. Drought, storms, winter and illness are simplified game systems. Total extinction is possible; it pauses the UI without erasing the chronicle. Forty-year checkpoints and a sixty-year continuation cover multiple generations and aging, but do not prove balance for every seed or century-long run.

Save validation rejects old versions, impossible shapes, some invalid references, out-of-range core values and unsafe style strings. This is not a comprehensive security audit, schema compiler or guarantee against every maliciously constructed input. Import size is capped in the UI. No arbitrary scripts or model-generated programs are evaluated.

## Next architecture work

Add stable goal IDs and a household plan graph; then isolated proposal schemas and event IDs. Move simulation into a Worker before increasing scene complexity. Profile object scans and A* allocations before choosing an ECS. Geography needs persistent regional/chunk IDs before a seamless globe. Model reasoning should be asynchronous and budgeted, with local fallback and stale-state rejection.
