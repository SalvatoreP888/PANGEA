# PANGAEA — research and integration review
**Reviewed 16 October 2026 · Depth prototype 0.2**

## Recommendation

Build a world simulator with a selective reasoning layer, not a collection of chatbots that narrate a world into existence.

The game should remain authoritative over positions, inventories, construction, crops, births, deaths and travel. Above that, agents can remember experiences, maintain goals, negotiate and eventually form institutions. A language model may propose a plan or express a character's interpretation, but it should not be allowed to declare that a house exists or invent food in storage.

The accompanying playable build implements an initial, entirely local version of this architecture. It uses original deterministic game code informed by the research below. It does **not** contain the full research frameworks, call an LLM, train a model, or reproduce their published experiments. That distinction matters: a tagged memory and utility score are useful gameplay systems, but are not equivalent to a paper's language-model cognition.

## 1. Research worth adapting

### AIvilization v0: stable goals in a changing world

**Paper:** https://arxiv.org/abs/2602.10429  
**Detailed architecture inspected:** https://arxiv.org/html/2602.10429v1  
**Latest abstract inspected:** v2, revised July 2026.

The paper describes hierarchical branches for long-term objectives, simulation-guided checks, several levels of replanning, and a separation between short-term execution records and longer-term profile consolidation. Its setting includes constrained production and a sandbox economy. The public deployment is research evidence in that setting, not proof of a drop-in real-time game engine.

**PANGAEA adaptation:** give a household a durable objective such as “establish a safe home,” with separate shelter, food and relationship branches. A blocked quarry should change the next supply step, not erase the household's larger objective. Invalidated plans should be repaired at the smallest necessary level.

**Status:** the current build has immediate utility decisions and community shortage-driven planning, but not persistent branching household plans. This is the highest-priority reasoning addition after the deterministic simulation boundary is hardened. No public implementation or redistribution license was verified during this review; treat it as an architectural reference, not imported code.

### Generative Agents: memory must change future behavior

**Paper:** https://arxiv.org/abs/2304.03442  
**Repository:** https://github.com/joonspk-research/generative_agents  
**Retrieval implementation inspected:** https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/retrieve.py

The architecture combines remembered experiences, retrieval, reflection and planning. Its retrieval machinery accounts for recency, importance and relevance. The paper's demonstration is a small social environment, not a survival economy.

**PANGAEA adaptation implemented:** bounded episodic memories with importance, timestamps, tags, affected people and mood effects. Retrieval ranks importance, recency and an exact context-tag match. Every 28 simulated days, structured reflection updates a food-safety belief. Hunger experience can increase gathering urgency and the settlement's reserve target. The decision inspector exposes the actual scores.

**Difference from the paper:** no embeddings, semantic retrieval or LLM-written reflections. Reflections are authored templates derived from state. Tests verify that hunger memories change a decision score rather than merely adding flavor text.

**Code license observed:** Apache-2.0. No source from the repository is vendored in 0.2.

### Humanoid Agents: needs, emotion and relationships

**Paper:** https://arxiv.org/abs/2310.05418  
**Repository:** https://github.com/HumanoidAgents/HumanoidAgents

The paper adds basic needs, emotion and relationship closeness to generative-agent behavior. Its contribution is particularly relevant to a game in which an exhausted person should stop working even when the community has an ambitious construction plan.

**PANGAEA adaptation implemented:** fullness, energy, belonging and warmth compete with productive work. Health, shelter, illness and remembered experience influence mood. Repeated contact builds relationships. Adults form partnerships, children have their own learning/play decisions, and family records survive a death.

**Limits:** this is stylized game behavior, not a validated model of human psychology. Relationship scores are currently reciprocal; personality is a small trait set rather than a deeply evolving profile.

**Code license observed:** Apache-2.0, not MIT.

### GovSim: cooperation requires real scarcity

**Paper:** https://arxiv.org/abs/2404.16698  
**Repository:** https://github.com/giorgiopiatti/GovSim

GovSim studies agents exploiting and sustaining shared resources. Its results demonstrate that cooperation is not guaranteed merely because several capable language models are placed together; communication and reasoning conditions matter in its tested scenarios.

**PANGAEA adaptation implemented:** wild food and timber deplete and regenerate. Seasons and drought change renewal. Crops require sowing, growth and harvesting. Food can spoil. Aid removes provisions from the donor before a delayed arrival at the recipient. These systems make conservation and cooperation meaningful possibilities.

**Not implemented:** negotiated harvesting limits, competing private ownership, sanctions, pollution or emergent resource laws. The aid rule is authored, not evidence that a society spontaneously invented mutual assistance.

**Code license observed:** MIT. Its Python experiment suite is better used as a future evaluation reference than embedded in the browser runtime.

### Concordia: proposed actions versus authoritative outcomes

**Repository:** https://github.com/google-deepmind/concordia  
**Foundational paper:** https://arxiv.org/abs/2312.03664

Concordia separates agents from an environment/Game Master that handles the consequences of their actions. It is a generative social-simulation framework, not a renderer or a ready-made colony game.

**PANGAEA adaptation:** preserve a proposal/validation/execution boundary. A future model can propose “construct a granary at this site.” Game code checks its technology prerequisite, land, reservations, materials and available labor before admitting the project. Completion must still result from simulated work.

**Current status:** ordinary game decisions are separate from execution, construction reserves materials, and workers follow legal paths. A production-strength external action API and model-backed Game Master are not yet present.

**Code license observed:** Apache-2.0. Do not adopt model-arbitrated inventory changes when exact conservation is required.

### Voyager: reusable skills, not unbounded code execution

**Paper:** https://arxiv.org/abs/2305.16291  
**Repository:** https://github.com/MineDojo/Voyager

Voyager's Minecraft agent uses a curriculum, feedback and a growing library of executable skills. Its reusable capability approach is useful, but its Minecraft-specific runtime should not become the foundation of PANGAEA.

**Proposed adaptation:** validated game-domain skills such as “prepare a winter food reserve,” “construct a timber home” and “establish a daughter settlement.” Each skill has explicit prerequisites, bounded actions and a verifiable completion condition. Agents could learn which combinations work and teach selected skills to apprentices.

**Current status:** skill experience and six authored technology unlocks exist. There is no learned program library, open-ended invention or self-modifying game code. A future model should submit a schema-constrained plan, not arbitrary JavaScript for evaluation inside the game.

**Code license observed:** MIT.

### Agentopia: whole lives, with an important cost warning

**Paper:** https://arxiv.org/abs/2606.07513

This 2026 work addresses multi-year social lives, persistent memory files and longer-term development. Its world operates at an abstract social level rather than rendering every physical action. The paper reports that an average ten-year simulation consumed roughly 13.7 billion tokens across 567,000 model calls and took about 186 wall-clock hours. Those are its experimental costs, not an estimate for PANGAEA.

**Proposed adaptation:** bounded weekly reviews, per-person relationship notes, and periodic identity updates. Keep immutable event evidence separate from an agent's interpretation of that evidence. Consolidation should preserve important family facts and explain why a memory was retained or discarded.

**Decision:** use the memory-management ideas selectively. Do not put an LLM in every movement, meal or production tick. An implementation repository and code license were not verified here; this is a paper reference.

### AgentSociety 2: evaluation infrastructure, not a game client

**Current repository:** https://github.com/tsinghua-fib-lab/AgentSociety  
**Current-platform paper:** https://arxiv.org/abs/2607.11895  
**Original city-simulation paper:** https://arxiv.org/abs/2502.08691

The current repository distinguishes the newer AgentSociety 2 research platform from the original city simulator. It offers modular environments, distributed execution and replay-oriented research workflows. Its README also identifies a licensing exception for a commercial subtree; a top-level Apache label must not be treated as blanket permission for every path.

**Proposed use:** an optional external laboratory for intervention tests, not a dependency of the single-file prototype. Compare policy variants using the same geography and initial conditions, preserve action traces, and examine failure cases rather than just attractive anecdotes.

**Version caution:** a result from the original paper is not automatically a benchmark of the current default branch, nor evidence of real-time browser performance.

### Project Sid: valuable evidence, not a downloadable civilization engine

**Paper:** https://arxiv.org/abs/2411.00114  
**Repository:** https://github.com/altera-al/project-sid

Project Sid is relevant to specialization, collective behavior and civilization-scale ambitions. However, the inspected public repository states that it contains the technical report. It is not a complete implementation that can be dropped into this game.

**Use:** design reference for a later institutional layer. Do not budget the project as if the working agent engine has already been obtained.

## 2. GitHub components worth a targeted integration spike

These are candidates, not installed dependencies. Licenses below are the metadata/text observed during this review, not a full distribution-compliance audit. Before importing code, pin the exact version or commit, review the actual files, inspect assets and transitive dependencies, and preserve applicable notices.

| Component | Practical role | Observed license | Recommendation |
| --- | --- | --- | --- |
| **Yuka** — https://github.com/Mugen87/yuka | Goal/state-driven agents, navigation, steering and perception in JavaScript; independent of a particular 3D engine | MIT | Good candidate when movement becomes continuous or 3D. Benchmark a small adapter against the present grid AI first. |
| **Mapgen4** — https://github.com/redblobgames/mapgen4 | Procedural wilderness terrain, elevation, rainfall and river-generation ideas | Apache-2.0 for its own code; dependencies have their own licenses | High-value geography prototype. It is not already a spherical town/civilization engine. |
| **H3 JS** — https://github.com/uber/h3-js | Hierarchical global spatial indexing | Apache-2.0 | Useful for stable regional IDs, neighboring regions, ownership and coarse travel. It does not render the globe or generate terrain. |
| **bitECS** — https://github.com/NateTheGreatt/bitECS | Data-oriented entity/component organization | **MPL-2.0** on the inspected repository | Consider only after profiling and license review. Do not assume it is MIT or promise a population increase merely from adopting it. |
| **AI Town** — https://github.com/a16z-infra/ai-town | Social-agent starter with a browser client and backend orchestration | MIT | Inspect for optional conversation/state coordination. Avoid replacing the survival engine with a chat-town stack. |

Yuka's features are described in its official README. Mapgen4 documents the division between its map algorithms, worker and renderer, along with dependency licenses. H3's purpose is indexing, not procedural geology. These boundaries prevent an attractive repository from becoming an unnecessary rewrite.

### Licensing sources checked

- Generative Agents: https://github.com/joonspk-research/generative_agents/blob/main/LICENSE
- Humanoid Agents: https://github.com/HumanoidAgents/HumanoidAgents/blob/main/LICENSE
- GovSim: https://github.com/giorgiopiatti/GovSim/blob/main/LICENSE
- Concordia: https://github.com/google-deepmind/concordia
- Voyager: https://github.com/MineDojo/Voyager
- Yuka: https://github.com/Mugen87/yuka
- Mapgen4 and dependency summary: https://github.com/redblobgames/mapgen4
- H3 JS: https://github.com/uber/h3-js
- bitECS: https://github.com/NateTheGreatt/bitECS
- AI Town: https://github.com/a16z-infra/ai-town
- AgentSociety README and licensing exception: https://github.com/tsinghua-fib-lab/AgentSociety

## 3. What is actually in Depth 0.2

The simulation is original JavaScript, divided into geography, game data, simulation, rendering and UI modules. The packaged HTML is built from those modules and needs no runtime network access.

**Individual lives.** Four adult founders; needs; mood and health; a small trait set; repeated-contact relationships; adult partnerships; pregnancy and birth; parent/child links; aging; death and grief. Children learn and play rather than receiving adult work. Near-family exclusions exist, but there is no genetic model. This is not a claim that a four-person biological founder population is realistic.

**Decisions and memory.** Agents score alternatives from needs, shortages, skills and a food-safety belief. Emergency needs can interrupt work. The inspector shows the chosen action, reason and alternatives. Episodic memories affect mood and reflection. These are transparent rule-based calculations, not a hidden language-model conversation.

**A material economy.** Harvesting removes stock from the land into a person's carried inventory. Delivery is separate. Construction reserves its materials before progress. There are timber homes, hearths, fields, wells, granaries, workshops, herbalist huts and halls. Cooking consumes raw food and fuel. Tools require inputs and wear with work. Agriculture has a growth/harvest cycle instead of passive “farm count” income.

**A changing environment.** Regrowth, spoilage, seasonal effects, drought and storms influence survival. The inspectable map has fertility, resource and traffic views. Agents use four-neighbor A* on legal terrain, with roads forming from repeated traffic. Rivers cannot be crossed except at walkable fords.

**Expansion.** An eligible household packs real supplies and leaves the source settlement. A delayed land journey precedes the new town. Knowledge is carried to the destination. Aid convoys also deduct resources before arrival, although their transport labor is abstracted. Towns are not simply spawned by a global population timer.

**Presentation and continuity.** A rotatable globe, town view, building/person inspectors, history, pause/speeds, mobile observation sheet, browser save controls, portable JSON import/export and version checks. Procedural art only; no purchased assets, font files, model weights or paper figures are distributed.

## 4. Architecture for the next real depth pass

### Layer A — authoritative world

Keep geography, stocks, jobs, movement, births and construction in deterministic systems. Introduce stable IDs and explicit event schemas before external agents are allowed to submit actions. Reject stale or impossible proposals without changing inventory. Fix simulation time independently of render rate.

### Layer B — individual and household goals

Add a durable goal graph above today's utility scorer. Work is selected through that graph; needs can interrupt it; the unfinished objective remains. Store knowledge about locations and resources per person, so newcomers do not automatically know every node on the map. Add asymmetric trust and remembered promises separately from simple closeness.

### Layer C — bounded deliberation

Make longer reasoning event-triggered: a failed harvest, a household split, a disputed store, a migration proposal or an important discovery. Routine walking, carrying, eating and crop growth stay local. Queue inference separately from the renderer, use a fixed budget, and fall back to deterministic behavior on timeout. A model outage must never freeze the settlement.

Suggested proposal fields are `agentId`, `observedTick`, `goalId`, `actionType`, `targetId`, `requiredInputs`, `reasonEventIds`, `expiresAtTick` and `successConditionId`. The game validates the schema and world state. No direct script execution or arbitrary file/network tools should be exposed to characters.

### Layer D — institutions and geography

Only after households and stocks work reliably should the game add private/common stores, exchange, resource disputes, enforceable agreements, membership, law, succession and diplomacy. A leader label alone is not a government. A technology checkbox alone is not cultural evolution.

A larger world also needs a consistent geography hierarchy: global regions, local chunks and detailed active settlements with stable IDs. Any change in simulation resolution must conserve people and inventory. The current globe and local maps share seeded context but are separate views, not seamless continuous geometry.

## 5. Milestones with acceptance criteria

**Milestone 1: durable households.** Persistent shelter/food/family branches, targeted replanning, job reservations and asymmetric social ties. Acceptance: a blocked building site changes a supply or location step without deleting the household goal; interrupted work resumes; no duplicated inventories.

**Milestone 2: scarcity with choices.** Work orders, storage access, hunting/fishing alternatives, finite soil fertility and food preservation tradeoffs. Acceptance: identical-seed policy comparisons produce measurable stock and survival differences; no free production from an unattended building.

**Milestone 3: coherent world scale.** Chunked geographic identity, cached regional navigation and a simulation worker. Acceptance: zooming and changing active settlements never alters the saved world; trace replay agrees with headless execution; benchmark the target machine before raising population limits.

**Milestone 4: selective model reasoning.** Bounded memory retrieval, household deliberation and evidence-linked dialogue. Acceptance: invalid/stale outputs are rejected; model timeout preserves play; token usage is visible; evaluations compare against a no-model baseline.

**Milestone 5: societies and production art.** Ownership, councils with actual decisions, inherited institutions, diplomacy, authored assets, animation, audio and visual effects. Acceptance: every political decision has an executable consequence and every generated historical claim has an event source. Art and performance need their own production QA; research integration does not make an alpha AAA.

## 6. Tests and honest limits

See `QA.md` and the machine-readable files in `tests/`. The principal seeded run was checked annually through 40 years, then continued to 60. Three additional seeds were checked over ten years each. These are regression checks, not a statistically representative balance study.

Future evaluation should measure shortages, mortality, stranded agents, illegal proposals, inventory conservation, repeatability, task completion, memory influence, model cost and wall-clock performance. Compare memory enabled/disabled and policy variants under the same conditions. Do not count an attractive story as evidence that a mechanism improved the game.

0.2 has bounded population planning, bounded settlements and memories, a small authored technology tree, coarse travel, simple health, limited relationships, no combat, no full market, no generated laws, no LLM calls and no seamless globe-to-interior terrain. It is a materially deeper playable prototype, not a finished AAA game.
