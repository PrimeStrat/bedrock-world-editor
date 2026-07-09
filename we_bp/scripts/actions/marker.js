import { world, Dimension, Player } from "@minecraft/server";

const MARKER_PARTICLE = "we:marker";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Spawns the world-edit marker particle at a block-centered location when its
 * chunk is loaded.
 * @param {Dimension} dimension The dimension to spawn in.
 * @param {Vec3} location The block location to mark.
 * @returns {void}
 */
function spawnMarker(dimension, location) {
    const center = { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 };
    if (dimension.isChunkLoaded(center)) {
        dimension.spawnParticle(MARKER_PARTICLE, center);
    }
}

/**
 * Spawns marker particles along a list of block locations for a player's
 * dimension.
 * @param {Player} player The viewing player.
 * @param {Vec3[]} locations The block locations to mark.
 * @returns {void}
 */
function spawnMarkers(player, locations) {
    const dimension = player.dimension;
    for (const location of locations) {
        spawnMarker(dimension, location);
    }
}

export { MARKER_PARTICLE, spawnMarker, spawnMarkers };
