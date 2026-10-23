# Building artwork and research provenance

PANGEA uses 30 small, prepared WebP sprites selected from the detailed era sheets
already included with its IsoCity foundation. There are 25 building identities and
five civic/storage variants tied to actual discoveries. Hearths and crop fields
retain their procedural, stateful rendering. Housing always follows the actual
built type: timber hut, courtyard cottage, terrace, tenement, apartment.

The source is [IsoCity by amilich](https://github.com/amilich/isometric-city),
foundation revision `b774dd7913103e9dd9ec51b2151893c22683886e`. Its repository
`LICENSE` and upstream README declare MIT; no separate artwork restriction was
found in the inspected tree. That is the project's published license declaration,
not an independently documented origin for every source image. The original MIT
notice is retained in `public/pangea/buildings/IsoCity-MIT.txt`.

Source images are `public/assets/ages/{medeival,classics,enlightenment,industrial,modern}.webp`.
The upstream spelling `medeival` is preserved. Run:

```sh
node scripts/prepare-pangea-era-art.mjs
```

The script uses the existing Sharp development dependency. It extracts overlapping
windows because some source bases cross mathematical row boundaries, isolates the
main connected structure, removes the red matte, trims empty margins, adds
transparent padding, finds the front floor
contact, and writes the sprite assets and manifests. No new runtime dependency or
runtime pixel scan is required. The manifests at `src/pangea/art-manifest.json`
and `public/pangea/buildings/manifest.json` record source SHA256, source row/column,
exact crop/trim rectangles, prepared SHA256, scale and normalized base contact.

The art helper `buildingArt(type, knowledge)` selects only known discoveries for
civic variants; it does not infer actual housing from a settlement's maximum
technology or change building capacities. `loadBuildingArt(loadImage)` loads the
prepared files once. `buildingArtRect(art,x,y)` returns a correctly anchored draw
rectangle. `art.accent` is an attachment point for a small original pennant in the
settlement identity color.

Recommended player credit: “Building sprites adapted from IsoCity by amilich
(MIT); selected and normalized for PANGEA.”

## Repositories cloned for research; no code or art incorporated

- [KayKit Medieval Hexagon Pack 1.0](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0),
  revision `84fa4e91af6a88989be7c99e0891cede11f2ca38`. The author's two
  `LICENSE.txt` files expressly license the art CC0. Its 221 glTF models include
  mills, blacksmiths, houses, markets and wells. A possible future consistent
  orthographic render source; no KayKit model, texture, promotional image or code
  is included in this change.
- [MaxRects Packer](https://github.com/soimy/maxrects-packer), revision
  `86046856faaca67532c1841e2e8ce8c2017ffdbd`. MIT, Copyright (c) 2017 Shen Yiming.
  Its zero-dependency TypeScript packs rectangles; it does not trim or render
  sprites. Irregular packed atlases could use it later. The current cropped
  sprites do not require it; no package or copied code was added.

Both clones remain in `/workspace/work/oss-research/art/` outside the application.
The full research report there includes inspected code paths and license evidence.

## Additional artwork downloaded from its author; research only

All three original Kenney zips contain an artwork `License.txt` expressly
declaring CC0 and commercial use. None of these assets is included in this change.

| Pack | Published version | Downloaded archive SHA256 |
| --- | --- | --- |
| [City Kit Industrial](https://kenney.nl/assets/city-kit-industrial) | 2.0 | `5b381164e5760f3830a2dbee43b972deee38b2a695d091b56e238ab2910c96d2` |
| [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) | 2.0 | `1a7530c09f4d2fa2cdee259876f089334f8b1f27fa86a0c4f54ef86cdd8676ef` |
| [Isometric Buildings](https://kenney.nl/assets/isometric-tiles-buildings) | 2014 original | `0894214e3b604f3eef53b9fa633340ba4617e24053a6178fa81dab6bac3d6d5e` |

Kenney's model packs are a clear-license option for a future common rendering
pipeline. Combining their low-poly previews directly with the current detailed
miniatures would weaken visual consistency. The Blender tool repository
`craigrmccown/iso-render-pipeline` was also examined, but no license was declared;
its code was not copied. GPL, share-alike, noncommercial and no-derivatives asset
sources were not selected.

No upstream messages, issues or pull requests were sent. Contribution here means
proper author credit, retained licenses, recorded sources and transparent changes.
