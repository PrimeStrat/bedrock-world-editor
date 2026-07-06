import { Dimension } from "@minecraft/server";

const AIR_ID = "minecraft:air";
const TILE = 64;
const TILE_HEIGHT = 384;
const CHUNK = 16;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Floors a coordinate to the start of its 16-block chunk boundary.
 * @param {number} v A world coordinate.
 * @returns {number} The chunk-aligned floor of v.
 */
function chunkFloor(v) {
    return Math.floor(v / CHUNK) * CHUNK;
}

/**
 * Returns the inclusive block count spanned by two corners.
 * @param {Vec3} a The first corner.
 * @param {Vec3} b The second corner.
 * @returns {number} The number of blocks in the box.
 */
function boxVolume(a, b) {
    const dx = Math.abs(a.x - b.x) + 1;
    const dy = Math.abs(a.y - b.y) + 1;
    const dz = Math.abs(a.z - b.z) + 1;
    return dx * dy * dz;
}

/**
 * Builds a fillBlocks block filter from one or more match ids and an air-skip
 * setting.
 * @param {string|string[]|null} matchId Only include these block ids, or null for any.
 * @param {boolean} includeAir When false, air is excluded.
 * @returns {object} The block filter.
 */
function blockFilterFor(matchId, includeAir) {
    if (matchId) {
        return { includeTypes: Array.isArray(matchId) ? matchId : [matchId] };
    }
    if (!includeAir) {
        return { excludeTypes: [AIR_ID] };
    }
    return {};
}

/**
 * Clamps a box's vertical bounds to a dimension's build height so volumes
 * never reach outside the world.
 * @param {Dimension} dimension The dimension.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {{min: Vec3, max: Vec3}} The clamped corners.
 */
function clampToHeight(dimension, min, max) {
    const range = dimension.heightRange;
    return {
        min: { x: min.x, y: Math.max(min.y, range.min), z: min.z },
        max: { x: max.x, y: Math.min(max.y, range.max - 1), z: max.z }
    };
}

/**
 * Picks a permutation from a fill pattern, weighted-random for mixes.
 * @param {FillPattern} pattern The fill pattern.
 * @returns {object} The chosen permutation.
 */
function pickPatternPermutation(pattern) {
    if (pattern.entries.length === 1) {
        return pattern.entries[0].permutation;
    }
    let roll = Math.random() * pattern.total;
    for (const entry of pattern.entries) {
        roll -= entry.weight;
        if (roll < 0) {
            return entry.permutation;
        }
    }
    return pattern.entries[pattern.entries.length - 1].permutation;
}

/**
 * Returns whether a cell's block type passes a match/air filter.
 * @param {string} typeId The cell's block type id.
 * @param {string|string[]|null} matchId Only these ids match, or null for any.
 * @param {boolean} includeAir When false, air never matches.
 * @returns {boolean} True when the cell may be filled.
 */
function cellMatchesFilter(typeId, matchId, includeAir) {
    if (matchId) {
        return Array.isArray(matchId) ? matchId.includes(typeId) : typeId === matchId;
    }
    if (!includeAir) {
        return typeId !== AIR_ID;
    }
    return true;
}

export { AIR_ID, TILE, TILE_HEIGHT, CHUNK, chunkFloor, boxVolume, blockFilterFor, clampToHeight, pickPatternPermutation, cellMatchesFilter };
