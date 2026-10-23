# OSS research, incorporation and contribution record

Research date: 2026-10-23. Six parallel tracks cloned and inspected candidate source code before implementation. Checkouts remain locally under `/workspace/work/oss-research/`; they are not nested repositories in the application or runtime dependencies merely because they were researched.

| Track | Actually incorporated | Locally cloned alternatives explored | Detailed evidence |
| --- | --- | --- | --- |
| Terrain | simplex-noise.js 2D module (MIT); Mapgen4 drainage adapted to PANGEA grid (Apache-2.0); existing FlatQueue (ISC) | simplex-noise.js, Mapgen4 | [terrain](terrain.md) |
| Building progression | Existing IsoCity era artwork selected, trimmed, keyed and anchored under its repository's MIT declaration | KayKit Medieval Hexagon (CC0), MaxRects (MIT); canonical Kenney art packs (CC0) downloaded separately | [art](art.md) |
| City life | IsoCity's pure darkness/window utilities (MIT); original activity adapter and drawing helpers | Tween.js, Kontra (MIT) | [city life](city-life.md) |
| Camera continuity | Adapted d3-interpolate zoom math (ISC), original cross-scale registration/input | d3-interpolate, Tween.js | [transitions](transitions.md) |
| Persistence | Vendored idb promise wrapper (ISC), original IndexedDB checkpoint layer and Node SQLite authoritative service | idb, better-sqlite3 (MIT; not shipped) | [persistence](persistence.md) |
| Settlement identity | Original read-only derivation and shields using existing PANGEA hash | seedrandom/Alea (MIT), original Tracery (Apache-2.0); fork license ambiguity documented and rejected | [identity](identity.md) |

Each detailed record names exact revisions, license evidence, relevant source files, actual adaptation, separate asset scope, tests and limitations. Source licenses are checked directly, not inferred solely from GitHub/npm metadata. The selected permissive licenses permit modification and commercial redistribution subject to their retained notices. No GPL/AGPL, noncommercial, no-derivatives or unlicensed candidate source was incorporated.

Contribution here means accurate credit and a record of PANGEA's adaptations. No upstream PR, endorsement, external communication or upstream authorship of original PANGEA glue is claimed. Candidate repositories that were not copied remain research-only. Potential future upstream patches require a concrete relevant change and review; no token contribution is submitted just to claim one.

Full notices ship in their source locations, `public/pangea/licenses.txt`, the in-app Credits and the offline HTML. `scripts/build-pangea-credits.mjs` regenerates those bundled notices. The original PANGEA simulation came from the user's workspace at `bd967b4`; IsoCity foundation was `b774dd7913103e9dd9ec51b2151893c22683886e`. Historical source remains intact.
