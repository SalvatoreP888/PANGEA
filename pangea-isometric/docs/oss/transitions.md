# Camera continuity: OSS review and integration

Researched and implemented 2026-10-23. Both candidates were cloned locally and their actual source and license files inspected before selection.

| Project | Exact inspected revision | License and source | Outcome |
| --- | --- | --- | --- |
| [d3/d3-interpolate](https://github.com/d3/d3-interpolate) | `2eeffc0d02f2947552cf0a0b73bdf26fe90e1c28` | [ISC license](https://github.com/d3/d3-interpolate/blob/2eeffc0d02f2947552cf0a0b73bdf26fe90e1c28/LICENSE); [`src/zoom.js`](https://github.com/d3/d3-interpolate/blob/2eeffc0d02f2947552cf0a0b73bdf26fe90e1c28/src/zoom.js), `test/zoom-test.js` | Selected. The 71-line, dependency-free zoom function is adapted in `src/pangea/camera.mjs`, with its full copyright and permission notice retained in `LICENSES/d3-interpolate-ISC.txt`. |
| [tweenjs/tween.js](https://github.com/tweenjs/tween.js) | `84a27a74febbda783eebb7ee3e7d7c7abfd25009` | [MIT license](https://github.com/tweenjs/tween.js/blob/84a27a74febbda783eebb7ee3e7d7c7abfd25009/LICENSE); `src/Tween.ts`, `src/Easing.ts`, `src/Group.ts`, `docs/user_guide.md` | Evaluated only. Its scheduler and state add little for a single camera managed by PANGEA's existing RAF. No Tween.js source ships. |

Research clones reside outside the application at `/workspace/work/oss-research/transitions/d3-interpolate` and `/workspace/work/oss-research/transitions/tween.js`. The shipped camera module adds no npm dependencies. The selected ISC license permits commercial use, modification and redistribution, provided its copyright and permission notices remain with copies.

## What was adapted

D3 interpolates `[centerX, centerY, visibleWorldWidth]`. PANGEA converts camera zoom with `visibleWorldWidth = viewport.width / zoom`. The upstream special case for nearly coincident centers is preserved. PANGEA uses `-Math.asinh(b)` in place of the algebraically equivalent `Math.log(Math.sqrt(b*b+1)-b)` to avoid subtraction cancellation, normalizes the signed upstream zoom-in duration, and returns exact endpoint copies.

PANGEA's new code adds projection/inverse projection, cursor-anchored zoom, registration between world-town and local-city coordinates, remembered cameras per world/town, interruption, reduced-motion completion, and a multi-pointer input adapter. It does not modify simulation state or create visual residents/buildings.

Credit: **Mike Bostock / d3-interpolate — ISC**. Add this line and a link to the retained license to the application's combined Credits/third-party notice. The source module names the exact upstream revision and adaptations. These application-specific changes do not require an upstream contribution. No claim is made that Tween.js was incorporated.

## Renderer integration API

`camera.mjs` has a matching `camera.d.mts`; `input.ts` is fully typed. All geometry uses viewport CSS pixels, independent of canvas device pixel ratio.

```ts
import { CameraTransition, zoomAt } from './camera.mjs';
import { attachCameraInput } from './input';

const transition = new CameraTransition();
const frame = transition.begin({
  fromKey: 'world', toKey: `settlement:${town.id}`,
  sourceCamera: oldCamera, targetCamera: focusedCityCamera,
  sourceAnchor: selectedWorldTownPoint, targetAnchor: localCityHallPoint,
  viewport: { width, height }, entryZoom: oldCamera.zoom * .14,
  now: performance.now(), duration: 720,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
```

The target fallback camera is used on first visit. A later visit restores its remembered camera. World uses `world`, each town uses `settlement:<id>`. `begin` saves the source camera; returned and recalled cameras are copies. Call `clear()` when replacing the simulation so cameras from another seed do not leak into the new world.

The selected world anchor is `worldPoint(town)`. For a settlement, use the complete hall's tile center, else actual building centroid, else the existing local founder/grid center. Both are real coordinates in their own scene; `cameraAtAnchor` registers them to the exact same screen pixel at the start. World and settlement remain distinct coordinate scales. Terrain work exposes shared biome/coast context; exact river orientation is not claimed to match yet.

Capture the old canvas once before rebuilding the new semantic view. Each draw samples `transition.sample(performance.now(), reduceMotion)`, assigns its camera while the renderer is handling this transition, and draws the target scene. An old scene snapshot can be overlaid with:

```ts
ctx.save();
ctx.translate(frame.anchor.x, frame.anchor.y);
ctx.scale(frame.sourceScale, frame.sourceScale);
ctx.globalAlpha = frame.sourceOpacity;
ctx.drawImage(oldSnapshot, -frame.sourceAnchor.x, -frame.sourceAnchor.y, width, height);
ctx.restore();
```

The snapshot's selected anchor follows the live target's selected anchor as zoom advances. Its fade ends by 48% of the 720ms transition. Assign the final returned camera once when `active` becomes false and release the snapshot. Do not reassign a completed sample forever, because later manual pan/zoom must remain authoritative. Clear stale hit targets at the semantic switch and suppress entity selection until the current view has been drawn.

`cancel(now)` samples the displayed camera before stopping and returns that final sample, or null if no animation is active. It releases the snapshot immediately. Call this before pointer/wheel input. `finish()` ends active motion at the exact destination, suitable for recenter, canvas resize or a newly enabled reduced-motion preference. A new `begin()` replaces any prior motion; there are no timers or delayed callbacks that can switch back later.

## Pointer and pinch integration

```ts
const detach = attachCameraInput(canvas, {
  interact: () => renderer.cancelTransition(),
  pan: (dx,dy) => renderer.pan(dx,dy),
  zoomAt: (factor,x,y) => renderer.zoomBy(factor,x,y),
  hover: (x,y) => { renderer.hovered=renderer.hit(x,y); return !!renderer.hovered; },
  select: (x,y,{double}) => {
    // Existing authoritative hit selection; a double town tap enters that town.
  },
});
// Effect cleanup: detach();
```

`zoomBy` applies the existing view-specific zoom limits before calling `zoomAt(camera, absoluteNextZoom, {x,y}, viewport)`. The adapter normalizes wheel pixel/line/page units, tracks pointer IDs, pans pinch centroids, preserves the point between fingers while changing their distance, suppresses clicks after gestures, recognizes close double taps, releases capture and listeners on teardown, and handles pointer cancellation. The existing canvas `touch-action:none` remains required. Keyboard and visible zoom/recenter controls remain separate accessible navigation paths.

## Validation

`node --test --test-isolation=none tests/pangea/camera.test.mjs` passes 11 tests covering:

- Phone/desktop projection roundtrips and zoom-anchor invariance.
- Exact registration across distinct world/city coordinate systems.
- Upstream D3 midpoint compatibility, exact endpoints and 404 samples through reciprocal, identical and nearly coincident paths.
- Separate world/town memories, copies, animation completion, interruption and rapid return navigation.
- Reduced motion at launch and mid-transition, zero duration and seed reset.
- The actual compiled TypeScript adapter: two-finger moving-centroid invariance, no phantom click, double tap, cancellation, wheel units and listener/capture cleanup.

Targeted ESLint passes for the new camera/input files.

Production browser integration was verified on port 3002 with Chromium: nine checks passed with no JavaScript errors. They cover exact town/hall seam registration, restored world framing, independent town cameras, wheel interruption without a delayed snap, map double-click into the correct town, reduced motion changed during travel, resize cleanup, proportional phone-scale interruption, and actual CDP touch pinch at DPR2 preserving its moving centroid without phantom selection. The reusable touch check also lives in `tests/pangea/evolution-browser.py`.
