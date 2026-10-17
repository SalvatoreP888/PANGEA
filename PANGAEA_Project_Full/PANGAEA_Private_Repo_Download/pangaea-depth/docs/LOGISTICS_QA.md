# Realms 0.5 — verified results

17 October 2026. Node v24.19.0; Chromium 154.0.8037.57. Standalone `index.html` SHA-256: `32d491b2dcf25547b15b65280392ce054dbe80ae633e0e7759bc6ecce205ed15`. The game still requires no runtime network requests or external API.

## Checks

| Check | Result | Evidence |
|---|---|---|
| Unit/regression suite | 56 passed; zero failed/skipped | `EVIDENCE/logistics/unit-results.txt` |
| Combined browser checks | 55 passed: 19 original, 14 city, 14 Realms, 8 physical-production | `EVIDENCE/logistics/browser-log.txt`, existing component reports, `verification.json` |
| Browser errors / external runtime requests | None observed | Component JSON reports |
| Constructed 250/1,000/2,000-person cities | Invariants and exact save/resume passed | `EVIDENCE/logistics/benchmark.json` |
| Three natural 30-year runs | No injected population or workshop stock; zero deaths/invariant failures in these runs | `EVIDENCE/logistics/natural-scenarios.json` |
| Generated artifact and source delivery | Build hash retained in component evidence and final verification | `EVIDENCE/logistics/verification.json` |

The browser tests cover HTTP boot, existing localStorage/JSON saves, road/rail, MAX pause and reference replay, climate controls, fantasy composition, space/city transitions, reduced motion and mobile layout. The new checks use a labelled constructed fixture to show inputs leaving storage with a real resident, arriving in a mill buffer, turning into uncollected flour, surviving import/export, appearing in the selected building inspector, and entering shared storage only after collection and delivery. Screenshots were visually inspected at desktop and 390px mobile sizes.

The production regressions exercise every recipe, missing ingredients, distance/arrival, full output buffers, interrupted delivery replay, duplicate pickup reservations, read-only inspection, perishable residual inputs, malformed cargo/targets and autonomous milling/baking. Review additionally checked death and passenger packing: carried inputs return or become trip cargo once, and delivery markers clear. Production task/inbound indexes were checked against explicit resident scans during incremental updates.

## Bugs found and fixed

An imported delivery marker could point to a valid producer while carrying the wrong ingredient. Depositing it made the next save invalid. Imports now reject incompatible cargo; runtime decisions return such cargo to common storage instead of poisoning a workshop.

The 2,000-person benchmark then found a legitimate empty-catch key, `fish: 0`, left in a resident's carry map. A later grain pickup preserved that inert key and strict shipment validation rejected the save. Empty catches no longer add inventory entries; a new shipment clears verified zero-only remnants before adding its ingredients. A regression covers both empty fish and fully consumed carried-food keys. The strict validator remains in place, and the final 2,000-person save/replay passes.

## Natural growth

All three starts use exactly four founders with events disabled for a controlled comparison, ordinary resources, normal labor and normal demography. Climate, seasons, spoilage and ecological renewal remain active.

| Seed | Living at year 30 | Births / deaths | Discoveries in first town | Completed industrial batches | First-town food days |
|---|---:|---:|---:|---:|---:|
| 481217 | 23 | 19 / 0 | 25 | 13,959 | 226.4 |
| 17 | 24 | 20 / 0 | 25 | 15,361 | 590.2 |
| 9901 | 21 | 17 / 0 | 25 | 14,588 | 466.4 |

The current natural fixture is `saves/logistics-seed-481217-after-30-years.json`. The 0.4, Cities and original saves are preserved. These results establish early-chain operation and survival for these seeds/settings, not natural metropolitan growth or all-climate balance. Constructed city tests are separate evidence.

## Performance and boundaries

Production assignment queries now use per-building task/delivery indexes maintained around each actor's turn, replacing repeated resident scans. This is derived state and is not saved. It preserves deterministic ordering and does not approximate away people or shipments.

The final isolated benchmark measured the constructed 250/1,000/2,000-person workloads at approximately 218/895/3,015 ms for 12 complete ticks. These are short cloud observations, not stable hardware-independent rates or a claim of overall speedup against a different workload. The renderer and the complete simulation are measured separately. A large-population tick can exceed the frame budget; the simulation still executes on one thread. MAX runs real ticks as fast as that thread allows and yields between slices; it is not an all-core worker implementation.

Common storage still has no spatial capacity limit. There are no district warehouse links, storage filters, permanent hauling crews, commodity-specific wagons or simulated power generation. Basic hearth cooking/toolmaking retain communal-input production. The eight industrial recipes have physical buffers and hauling. Planet climate remains an authored latitude/elevation/season model, not a general circulation solver. Space and city maps are separate scales.

Chromium's administrator policy blocks direct `file://` navigation. HTTP launch and the identical self-contained HTML loaded as browser content pass. No policy bypass was attempted. Safari, Firefox and physical touch devices were not tested.

Research evidence and decisions are in [DEEP_RESEARCH.md](DEEP_RESEARCH.md) and `EVIDENCE/logistics/research-sources.json`. Earlier QA reports describe historical deliveries; the existing browser runners refresh several screenshots/reports in their original `EVIDENCE/cities/` and `EVIDENCE/realms/` locations. PR#1 preserves their 0.4 versions in Git history.
