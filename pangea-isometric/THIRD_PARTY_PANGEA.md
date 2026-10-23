# PANGEA source and artwork attribution

| Incorporated source | Revision | License | Use and retained notice |
| --- | --- | --- | --- |
| [IsoCity, amilich](https://github.com/amilich/isometric-city) | `b774dd7913103e9dd9ec51b2151893c22683886e` | MIT | Foundation, projection, tile drawing, image cache, lighting helpers and era sprites. `LICENSE`; sprite notice at `public/pangea/buildings/IsoCity-MIT.txt`. Extraction/normalization and PANGEA mappings are modifications. |
| [simplex-noise.js, Jonas Wagner](https://github.com/jwagner/simplex-noise.js) | `6bfff874f5f0efed6375a9bf27fbd39b3cec6b4e` | MIT | Pinned 2D ESM adaptation. `src/pangea/simulation/vendor/simplex-noise.LICENSE` and source legal comment. |
| [Mapgen4, Red Blob Games](https://github.com/redblobgames/mapgen4) | `c1d8cb018a11a8b9e17d59233c36c176429d37eb` | Apache-2.0 | Ocean-rooted drainage/flow grid adaptation in explicitly Apache-licensed `terrain.mjs`. Full license at `src/pangea/simulation/vendor/mapgen4.LICENSE`. No upstream NOTICE file found. |
| [d3-interpolate, Mike Bostock](https://github.com/d3/d3-interpolate) | `2eeffc0d02f2947552cf0a0b73bdf26fe90e1c28` | ISC | Zoom math modified for two scene coordinate systems. `LICENSES/d3-interpolate-ISC.txt` and `camera.mjs` header. |
| [idb, Jake Archibald](https://github.com/jakearchibald/idb) | `654c746bef13f9fe7f5871e03ac58015cebace5a` (8.0.4) | ISC | Vendored IndexedDB promise wrapper. `src/pangea/persistence/vendor/idb.LICENSE`. |
| [FlatQueue, Vladimir Agafonkin](https://github.com/mourner/flatqueue) | 3.0.0 | ISC | Existing priority queue. `src/pangea/simulation/vendor/flatqueue.LICENSE`. |
| [Manrope Project Authors](https://github.com/sharanda/manrope) | Local font files | SIL OFL 1.1 | Copyright 2018. `public/pangea/Manrope-OFL.txt`. |

React and Lucide runtime notices are included in bundled credits alongside the sources above. Standard package dependencies remain recorded in `package-lock.json`; their licenses continue to apply. Generated PANGEA atlas and ground material from the previous version remain in `public/pangea/`; newly prepared era sprites derive from the retained IsoCity sheets.

The renderer-independent PANGAEA Realms simulation originated in the user's existing workspace at `bd967b4`; generation/version propagation is now extended in this application. Original historical project files remain unmodified.

PANGEA-specific code is MIT except marked Apache-2.0 derived terrain code. This repository is not a claim that all third-party material was relicensed as MIT. Full legal notices are retained and bundled into the online/offline application's Credits and `public/pangea/licenses.txt` using `scripts/build-pangea-credits.mjs`.

[Six-track research and contribution record](docs/oss/README.md) identifies inspected alternatives that are **not shipped**. No upstream contributions or endorsements have been claimed.
