const AIR_ID = "minecraft:air";
const TILE = 64;
const TILE_HEIGHT = 384;
const CHUNK = 16;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
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

export { AIR_ID, TILE, TILE_HEIGHT, CHUNK, chunkFloor, boxVolume, blockFilterFor };
