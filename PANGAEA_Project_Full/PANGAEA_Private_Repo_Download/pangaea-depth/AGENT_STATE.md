# PANGAEA working state

Current owner requests, all part of one expansion: remove the mature-world road lattice; restore machine-speed MAX; add fisheries, bakeries, material chains and planet parameters; use Songs of Syx / WorldBox as references; make mixed-species fantasy cities; add latitude/elevation climate, realistic drainage and a space-to-city transition.

Implementation is **Realms 0.4** on existing Canvas/ESM modules. User priority supersedes old handoff milestone ordering. The owner explicitly authorized GitHub push and merge on 17 October 2026. Realms 0.4 is being delivered through a reviewed feature branch and pull request; deployment is outside this delivery. Preserve the accumulated changes and original fixtures.

Checkout `/workspace/PANGEA`; application `PANGAEA_Project_Full/PANGAEA_Private_Repo_Download/pangaea-depth`. Generated entry point `index.html`, built by `npm run build`. Commands: `npm test`, `npm run test:browser`, `npm run benchmark`, `npm run scenarios -- 481217 30`.

`src/city.mjs`: irregular parcels, nearest-network branch streets, reciprocal edge topology, legacy street repair and polylines. Footfall remains a separate activity heatmap. The original visible grid was caused by joining every adjacent traffic cell; heavy-traffic regression now compares exact rendered output.

`src/economy.mjs`: fisheries/ecology, material demand, climate effects; `data.mjs` has 19 resources, 36 technologies, species and planet parameters. `world.mjs` has latitude/elevation/rainfall climatology and outlet-rooted local drainage. `ui.mjs` has MAX, Supply, six climate controls, species/heritage and scroll transitions. `render.mjs` animates a zoom/fade between distinct map scales and respects reduced motion.

Evidence is under `EVIDENCE/realms/` and road before/after screenshots under `EVIDENCE/roads/`. `docs/REALMS_QA.md` is the current readiness report; earlier CITIES_QA.md and natural century reports are historical ruleset evidence. Current natural fixture: `saves/realms-seed-481217-after-30-years.json`. Original v0.2 saves/previews/reports are preserved; baseline source is at Git commit `547bd71c4632c96db789ed0c29e1634aaeec9948` and `/workspace/pangaea-environment/baseline/source.tar` outside checkout.

Research: official Songs of Syx / WorldBox sites and arXiv are blocked by proxy 403. Azgaar climate generators and Red Blob elevation/drainage sources were actually inspected via GitHub. Their engines/code/assets are not bundled. Existing ISC FlatQueue is reused for routing/drainage. See REALMS_RESEARCH.md for exact refs and limits.

No full atmospheric/tectonic solver, seamless 3D planet, racial warfare, magic, worker execution, production input buffers, output haulers or vehicle ownership is claimed. Species share the same work/food/housing rules, with identity, appearance and inherited heritage. Next depth tasks: dedicated producer/warehouse deliveries and worker isolation, then broader long-run balance coverage.
