# PANGEA 0.8 visual verification

This visual pass starts at GitHub PR #6/main `741e8f4fbd569024b23d68ee9f043d77bdd384e2`. The 121 Node regressions pass, together with strict PANGEA lint, TypeScript, production/offline builds and browser checks. New visual checks preserve complete simulation snapshots, city hit geometry/picks and world entity markers across desktop and DPR 2 phone views. Moved/unfinished/removed building ground matches a forced cache rebuild pixel-for-pixel.

See [VISUALS.md](docs/VISUALS.md) and [visual evidence](docs/qa/visuals.json). World label positions and all terrain/art pixels intentionally change; the older renderer pixel-exact optimization comparison is historical evidence, not an acceptance target for redesigned artwork. The simulation/server source is unchanged.

# PANGEA verification

The 0.7.2 optimization follow-up passes 121 Node tests, 67 production browser checks, 32 focused renderer views, strict lint, TypeScript, production and standalone builds. Current performance, parity and browser verification is documented in [OPTIMIZATION.md](docs/OPTIMIZATION.md). The 0.7 release results below remain historical evidence for the six-track evolution.

## PANGEA 0.7 — October 23, 2026

The six-track evolution passes 105 automated Node tests, the production Next.js build, whole-repository TypeScript checks and strict PANGEA lint. Original simulation regressions remain included. Historical `PANGAEA_Project_Full/` files are unchanged.

## Browser evidence

Chromium 154 / Python Playwright exercised the real production application at 1536×1024, 1280×800 and 390×844, including real touch input at DPR 2. The Browser connector's control tool was unavailable, so local Playwright supplied browser QA. Reports are retained under [docs/qa](docs/qa/); screenshots are under [docs/screenshots](docs/screenshots/).

| Suite | Passed checks | What it establishes |
| --- | ---: | --- |
| General production app | 30 | Real city/person/building inspection, world selection, layers/camera/playback,36 discoveries, inventories/history, modal focus, exact JSON/checkpoint roundtrip, malformed saves, four-founder starts, fresh random seeds, fixed-seed reproduction, original IsoCity route, laptop/phone/reduced motion and zero JavaScript/asset errors. |
| Six-track evolution | 8 | Eight distinct industrial/transport pixel sources load; family keyboard selection opens a real person; imported legacy terrain/sites remain exact; town Chronicle detail/order; generation2 determinism; static lighting; timer autosave/reload; real phone pinch. |
| Camera integration | 9 | Exact town/hall seam anchor, world/city camera memory, interruption, double click, dynamic reduced motion, resize, small-scale zoom limits and DPR 2 moving-centroid pinch without phantom selection. |
| IndexedDB | 6 | Real transactional rotating checkpoints, overlapping writes, stale revision rejection, invalid checkpoint recovery, legacy migration and large state. |
| Frontend + authoritative server | 8 | UI provisioning, actual independent ticks after page closes, fresh launch/rejoin, persisted pause, same-seed import removing selected town, and delayed command/poll results cannot overwrite a disconnected local world. |
| Standalone export | 4 | All 30 prepared sprites load with valid terrain 2 state; offline city/night controls work; nine complete license notices are embedded; zero HTTP requests or JavaScript errors. |

The original generic browser suite was updated for intentional asynchronous checkpoints, 720ms camera completion, and an honest empty settlement Chronicle in the constructed preview. A separate browser harness bug was corrected: this installed Playwright resolves asynchronous wait predicates before their promised Boolean; IndexedDB polling now awaits actual reads and checks the result in Python. The final autosave evidence confirms committed revision 2/tick 4, reload and exact paused restoration.

Production sampled Canvas frame time was 5.45ms median / 5.9ms maximum in the 240-person constructed world on software Chromium. This is a bounded sample, not a guarantee for larger populations or every device. The activity adapter separately sampled roughly 0.23ms for 1,399 residents/232 buildings. Terrain cache generation sampled approximately 10–30ms per seed in Node; caches are bounded.

## Visual review and fixes

Desktop world/city, night, phone and prepared-art contact-sheet images were visually inspected. The existing charcoal/brass/ivory interface remains coherent; 30 cleaned IsoCity sprites now distinguish housing density, civic roles and production structures. Floor anchors retain complete building bases. River presentation joins real drainage edges into rounded channels. Construction, stockpiles, actual carried goods, trips and scoped occupied windows read simulation state.

Integration review fixed stale hit targets during interrupted camera travel, mobile zoom jumps, live server revision conflicts, late-response world replacement, same-seed import cache/removed-town failures, cross-tab checkpoint branch conflicts, and false import success. Settings focus handles collapsed server/credits disclosures; phone wordmark spacing protects playback controls. Imported old terrain and complete local generation retain pre-upgrade fingerprints.

The application remains an interactive isometric map with two registered scales, rather than the previous concept image's continuous painted landscape. Local rivers inherit macro watershed/climate information but retain playable fine-scale geometry. Small residents are procedural silhouettes. The constructed preview has granted capacity/resources, not invented claims of natural growth; profiles explicitly distinguish recorded production from installed capacity and retained history from an exhaustive archive.

## Persistence and publishing boundary

The Node 24.15+ service runs the same simulation independently, stores SQLite snapshots/revisions/clock/backlog/pause atomically, hashes owner keys and validates commands/imports. Real HTTP and disk tests cover authentication, CORS/DNS rebinding, body/capacity limits, concurrent writes, rollback, restart and deterministic continuation. Tests use temporary databases and remove them afterward; no credential or world database is committed.

The private Sites preview remains static and uses device-local autosaves. Continuous cross-device worlds require separately deploying the implemented server with durable disk and explicit origin/creation-key configuration. No permanent server infrastructure was provisioned or claimed. See [PERSISTENCE.md](docs/PERSISTENCE.md).

The single-file export is about 4.2MiB with embedded architecture, atlas, meadow material, fonts and full licenses. Direct `file://` navigation is restricted by this execution environment; its actual HTML was executed through Playwright `set_content`. Hosted-origin IndexedDB was tested separately. No private-preview authentication bypass was requested or used.

## Reproduce

```sh
npm ci
npm test
npm run lint:pangea
npx tsc --noEmit
npm run build
npm run build:standalone
npm run build:site
# Start production frontend in another terminal: npm start -- -p 3002
PANGEA_URL=http://127.0.0.1:3002/ npm run test:browser
PANGEA_URL=http://127.0.0.1:3002/ npm run test:evolution
PANGEA_URL=http://127.0.0.1:3002/ npm run test:camera:browser
npm run test:persistence:browser
PANGEA_URL=http://127.0.0.1:3002/ npm run test:server:browser
npm run test:standalone
```

The six research records provide pinned source/license evidence and actual contribution scope: [OSS research](docs/oss/README.md). Full MIT/ISC/Apache-2.0/OFL notices ship in the source, in-app Credits and offline export. Research-only clones are not bundled as dependencies and no upstream PR or endorsement is claimed.
