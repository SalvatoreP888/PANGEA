# City life: source research and implementation

Reviewed 2026-10-23. The city-life implementation uses PANGEA's actual buildings,
residents, task locations, carried resources, workshop buffers and transport
trips. It adds no simulation entities or resources and changes no save schema.

## Sources and licenses

| Source | Reviewed revision | License | Result |
|---|---|---|---|
| [amilich/isometric-city](https://github.com/amilich/isometric-city) | foundation `b774dd7913103e9dd9ec51b2151893c22683886e` | MIT, copyright 2025 amilich; full notice retained in project `LICENSE` | Directly imports `getDarkness` and `pseudoRandom` from `src/components/game/lightingSystem.ts` for static light presentation and stable window variation. The native Canvas approach fits this renderer. |
| [tweenjs/tween.js](https://github.com/tweenjs/tween.js) | `84a27a74febbda783eebb7ee3e7d7c7abfd25009` | MIT, Tween.js authors 2010–2012; Robert Penner easing equations 2001 | Cloned and examined `src/Tween.ts`, `src/Group.ts`, `src/Easing.ts` and actual `LICENSE`. Research only for city life. No dependency or copied code from this project. |
| [straker/kontra](https://github.com/straker/kontra) | `a449fcdf3b1060c35a7cfd0e897e31c0a0e36a48` | MIT, Steven Lambert 2015 | Cloned and examined `src/pool.js`, the bounded object lifecycle and actual `LICENSE`. Research only. Current effects use fewer than a handful of immediate Canvas strokes per working building; adding an engine or pool is unnecessary. |

Research clones are outside the shipped app in
`/workspace/work/oss-research/life/tween.js` and
`/workspace/work/oss-research/life/kontra`. The wider research notes are at
`/workspace/work/oss-research/life/RESEARCH.md`.

IsoCity's `vehicleSystems.ts` and `pedestrianSystem.ts` were also inspected.
Their randomly spawned decorative residents and traffic were not adopted:
PANGEA already owns resident identity, movement, freight and passenger records.
Construction, cargo, production pulses and vehicle silhouettes in `cityLife.ts`
are new project drawing code.

### Asset review

No candidate repository artwork, example media or documentation screenshots are
incorporated by this track. Code license and asset clearance were checked
separately. Kontra's `docs/assets/imgs/Attribution.txt` marks listed Kenney
platformer/UI material as CC0 1.0, but it is not treated as blanket clearance for
third-party game screenshots in the same tree. Tween.js project gallery media
is excluded. The procedural lighting imports use no artwork.

Attribution means preserving the existing MIT copyright/permission notice and
documenting actual use. No upstream issue, message or contribution was sent.

## Integration contract

- `activity.mjs` is the read-only simulation adapter, with `activity.d.mts`
  supplying the TypeScript contract. It reads production buffers without calling
  their mutating initialization helper.
- Create one `CityActivityTracker` per renderer. Call
  `tracker.sample(town, simulation.residents(town), timeInSeconds)` once per city
  frame and `tracker.reset()` when replacing/loading the world. Passing ordinary
  wall-clock frame time lets one-tick production completion effects expire while
  paused. Reduced-motion is applied in drawing, not by freezing this clock.
- Each frame has `buildings` and `carriers` maps indexed by existing IDs.
- Unfinished structures use `drawConstruction` in place of the finished sprite;
  `drawBuildingActivity` overlays real buffered output and work feedback. Remove
  the old blanket chimney smoke on completed buildings.
- Call `drawCarrierCargo` at the real person's position instead of the previous
  generic parcel. This does not create local carts or upgrade technology.
- `drawTrip` replaces the existing dot on an actual intercity trip. Mode 0 stays
  a foot carrier, 1–2 are road carts and 3–4 are trains. Cargo depiction requires
  positive real cargo; passenger depiction uses the existing passenger IDs.
- `buildingLight` returns a light only for a completed building with actual
  assigned household residents or an on-site worker. A hearth additionally uses
  actual people physically gathered nearby. Pass screen positions and
  scaled widths. After restoring the camera transform, call `drawCityLighting`
  before labels. All lighting uses a static day/dusk/night presentation choice.

The simulation advances four ticks per simulated day and commonly runs at 16
days per real second. A raw simulated hourly darkness cycle would flash, so this
implementation deliberately introduces no automatic day/night cycle. Lighting
changes do not change simulation time or productivity.

The short production pulse is observed only after an actual
`building.production.batches` increase. First observation and world reset are
silent baselines. This is needed because one-tick recipe tasks clear immediately
after successful work; it does not claim a continuing worker assignment.

## Verification

`node --test --test-isolation=none tests/pangea/activity.test.mjs` covers real
funding/labor stages, on-site worker filtering, valid carried amounts, separate
workshop buffers and incoming shipments, real housing assignments, exact legacy
toolmaking positions, actual transport modes, a real simulation batch completion
and effect expiry/reset. It compares complete natural and constructed snapshots
before/after activity reads and checks simulation invariants.

The renderer helpers preserve their Canvas state with save/restore. Reduced
motion uses static work/cargo/vehicle accents while retaining inventory and
construction information. Browser integration and full build are verified by
the coordinating change.
