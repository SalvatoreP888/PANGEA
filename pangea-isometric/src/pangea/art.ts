/** Sprite selection follows built structures and actual discoveries. Pure art
 * metadata: this module never changes capacity, inventory, or simulation state.
 * Source coordinates, hashes and license are in the generated manifest.
 */
import sourceManifest from './art-manifest.json';

export interface BuildingArt {
  id: string;
  src: string;
  /** Projected width in renderer world units. */
  width: number;
  era: number;
  size: {width: number; height: number};
  /** Normalized contact point on the front edge of the ground footprint. */
  anchor: {x: number; y: number};
  /** Normalized attachment for the settlement's small original pennant. */
  accent: {x: number; y: number};
  source: {
    sheet: string; row: number; column: number; sha256: string;
    crop: {left: number; top: number; width: number; height: number};
    trim: {left: number; top: number; width: number; height: number};
  };
  sha256: string;
}
interface ArtManifest {
  sprites: Record<string, BuildingArt>;
  variants: Record<string, {tech: string; id: string}[]>;
  procedural: string[];
}
const manifest = sourceManifest as ArtManifest;

/** Hearths and crops keep their stateful procedural rendering. Unknown save
 * types fall back in the renderer; they must never silently look like a home.
 */
export function buildingArt(type: string, knowledge: readonly string[] = []): BuildingArt | undefined {
  const variants = manifest.variants[type];
  if (variants) {
    for (let i = variants.length - 1; i >= 0; i--) {
      if (knowledge.includes(variants[i].tech)) return manifest.sprites[variants[i].id];
    }
  }
  return manifest.sprites[type];
}

export const BUILDING_ART_SOURCES: readonly string[] = Object.freeze(
  [...new Set(Object.values(manifest.sprites).map(art => art.src))],
);
export type BuildingArtImages = Map<string, HTMLImageElement>;

/** Pass IsoCity's cached loadImage. No runtime chroma keying, trimming or atlas
 * scans; a failed optional sprite leaves the renderer's existing fallback.
 */
export async function loadBuildingArt(
  loader: (src: string) => Promise<HTMLImageElement>,
): Promise<BuildingArtImages> {
  const loaded = await Promise.allSettled(BUILDING_ART_SOURCES.map(src => loader(src)));
  const images: BuildingArtImages = new Map();
  loaded.forEach((result, i) => {
    if (result.status === 'fulfilled') images.set(BUILDING_ART_SOURCES[i], result.value);
  });
  return images;
}

/** Destination rectangle when (x,y) is the base contact, independent of roof
 * height. Exposed so renderer selection bounds can match the visible building.
 */
export function buildingArtRect(art: BuildingArt, x: number, y: number, scale = 1) {
  const width = art.width * scale, height = width * art.size.height / art.size.width;
  return {x: x - width * art.anchor.x, y: y - height * art.anchor.y, width, height};
}
