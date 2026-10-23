export declare const TERRAIN_VERSION: 2;
export declare const TERRAIN_W: 180;
export declare const TERRAIN_H: 90;
export interface TerrainPoint {readonly u: number; readonly v: number}
export interface RiverSegment {readonly from: TerrainPoint; readonly to: TerrainPoint; readonly flow: number; readonly basin: number}
export interface TerrainSample {
  field: number; ridge: number; elevation: number; land: boolean; coast: boolean;
  moisture: number; slope: number; coastDistance: number; river: number; riverFlow: number;
  basin: number; downstream: TerrainPoint | null;
}
export interface TerrainGrid {
  readonly seed: number; readonly width: 180; readonly height: 90;
  readonly field: Float64Array; readonly ridge: Float64Array; readonly elevation: Float64Array;
  readonly moisture: Float64Array; readonly land: Uint8Array; readonly slope: Float64Array;
  readonly coastDistance: Int16Array; readonly downstream: Int32Array; readonly basin: Int32Array;
  readonly filled: Float64Array; readonly flow: Float64Array; readonly rivers: readonly RiverSegment[];
}
/** Cached derived data. Consumers must not mutate returned typed arrays. */
export function getTerrain(seed: number): TerrainGrid;
export function terrainAt(u: number, v: number, seed: number): TerrainSample;
