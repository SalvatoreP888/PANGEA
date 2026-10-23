# World generation: source research and contribution record

Reviewed 2026-10-23. The two selected projects were cloned into the research workspace and their source and actual license files inspected. Research checkouts remain outside the application. No upstream services, remote APIs or assets are required at runtime.

| Source | Pinned revision | License verified from source | Contribution to PANGEA |
| --- | --- | --- | --- |
| [Jonas Wagner, simplex-noise.js](https://github.com/jwagner/simplex-noise.js) | [`6bfff874f5f0efed6375a9bf27fbd39b3cec6b4e`](https://github.com/jwagner/simplex-noise.js/tree/6bfff874f5f0efed6375a9bf27fbd39b3cec6b4e), v4.0.3, 2024-07-26 | [MIT](https://github.com/jwagner/simplex-noise.js/blob/6bfff874f5f0efed6375a9bf27fbd39b3cec6b4e/LICENSE) | Exact 2D noise implementation, used for warped coastlines, coherent ridge belts and moisture |
| [Red Blob Games, Mapgen4](https://github.com/redblobgames/mapgen4) | [`c1d8cb018a11a8b9e17d59233c36c176429d37eb`](https://github.com/redblobgames/mapgen4/tree/c1d8cb018a11a8b9e17d59233c36c176429d37eb), 2026-03-29 | [Apache-2.0](https://github.com/redblobgames/mapgen4/blob/c1d8cb018a11a8b9e17d59233c36c176429d37eb/LICENSE) | Ocean-rooted priority exploration and reverse tributary accumulation adapted to PANGEA's orthogonal grid |

## Exact reuse and attribution

`src/pangea/simulation/vendor/simplex-noise.mjs` is generated from the pinned upstream `simplex-noise.ts` by esbuild with ESM output and ES2020 target. TypeScript annotations and unused 3D/4D implementations were removed. The 2D algorithm is unchanged. The original 2024 source copyright, algorithm credits and complete MIT notice remain in a legal comment, alongside revision/provenance. The upstream root MIT license, crediting Jonas Wagner 2018, is preserved as `vendor/simplex-noise.LICENSE` too. There is no npm runtime dependency.

`src/pangea/simulation/terrain.mjs` adapts the traversal/flow approach in [Mapgen4 `map.ts` lines 303–386](https://github.com/redblobgames/mapgen4/blob/c1d8cb018a11a8b9e17d59233c36c176429d37eb/map.ts#L303). Its header retains Red Blob Games' 2018 copyright, Apache attribution, source revision and a prominent description of modifications. The complete Apache-2.0 license is in `vendor/mapgen4.LICENSE`. No upstream NOTICE file was present. This file's Apache license is distinct from the enclosing project's MIT license.

Changes from Mapgen4 include an orthogonal grid rather than dual mesh, strict priority-flood depression filling, a drainage surface separate from physical elevation, basin IDs, grid rainfall and normalized immutable river segments. PANGEA's continental layout, ridge construction, field cache and settlement score were written for this integration. Existing vendored FlatQueue (ISC, `vendor/flatqueue.LICENSE`) supplies the queue; Mapgen4's dual-mesh, rendering and transitive dependencies are not shipped.

Distribution must retain these legal comments and full license files, including offline packaging. Apache-derived files must continue to identify modifications. Commercial use is permitted under the respective license conditions; no branding or upstream endorsement is implied.

## Suitability and maintenance

simplex-noise v4.0.3 has ESM/CJS and TypeScript exports, no runtime dependencies and an injected random-function API. Its stable latest source is from 2024 and is not archived. PANGEA injects isolated deterministic streams; it never uses the default Math.random or the simulation's evolving RNG for terrain.

Mapgen4 is a private browser application rather than a supported Node SDK. Its README explicitly marks it unmaintained despite later source/subrepo updates. Only the small algorithm adaptation is taken. Its full browser worker, mesh and WebGL stack would conflict with the existing engine and add unnecessary dependencies.

## Additional candidate considered

[Azgaar Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator/tree/4305a1ab74515872db28b00f2f4f9c0c09f2a98c) was inspected remotely at `4305a1ab74515872db28b00f2f4f9c0c09f2a98c` (2026-10-23, v1.154.2). Its [actual LICENSE](https://github.com/Azgaar/Fantasy-Map-Generator/blob/4305a1ab74515872db28b00f2f4f9c0c09f2a98c/LICENSE) is MIT with an extra permissive generated-map paragraph; GitHub's NOASSERTION metadata alone would have been misleading. Its biome habitability, river/port access and spaced settlement scoring informed the review, but no source code or assets were copied. The application is tightly coupled to packed graph data, D3 and browser state; its river generator's reassignment of global Math.random would be unsuitable for PANGEA. Its new TS generator code demonstrates active maintenance but is not a lightweight drop-in dependency.

## Implemented behavior and compatibility

New worlds use `generationVersion: 2`. Seeds choose 2–4 rotated continental masses and satellite islands, domain-warp their coastlines, grow ridged mountain belts and compute wind/rain-shadow moisture. A cached 180×90 world grid assigns every land cell an acyclic downstream chain ending in ocean, fills depressions on a separate drainage surface and accumulates rainfall into river discharge. Founding sites score usable low-slope terrain, mild climate and river/coast access across the whole map.

World rendering, migration routes, local climate and settlement terrain use the same version and seed. `worldRivers(seed, version)` exposes immutable normalized map segments; local maps inherit biome, coast, elevation, soil and forest conditions plus watershed metadata. Local river geometry remains a finer spring/tributary model with its established orientation and guaranteed playable starting clearing. It is not an exact zoom into a world watershed cell. Erosion, persistent lake simulation and navigable world river transport remain outside this implementation.

Saves lacking `generationVersion` migrate to version 1. The original geography and complete local generator retain fixed SHA256 regression fingerprints, so existing coastline, people, buildings, stockpiles and stored routes do not move. Unsupported versions are rejected before replacing a live world. The derived terrain cache is bounded, not saved, and independent of render order and the simulation RNG.

Six terrain regression tests cover legacy fingerprints, cache eviction/reproducibility without Math.random, continental diversity and valid founding sites across twelve seeds, every-cell basin termination/flow conservation, local/world climate agreement and exact save/resume. The complete simulation suite passes alongside these tests.
