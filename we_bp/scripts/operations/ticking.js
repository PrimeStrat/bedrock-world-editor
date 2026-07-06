import { world, Dimension } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { CHUNK } from "./util.js";

const MAX_AREA_CHUNK_SIDE = 255;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Returns the ticking area identifier used for a player's running edit.
 * @param {string} playerName The player's name.
 * @returns {string} The ticking area identifier.
 */
function tickAreaName(playerName) {
    return "we_tick_" + playerName.toLowerCase();
}

/**
 * Returns the chunk spans a box covers on each horizontal axis.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {{x: number, z: number}} The chunk counts per axis.
 */
function areaChunkSpans(min, max) {
    return {
        x: Math.floor(max.x / CHUNK) - Math.floor(min.x / CHUNK) + 1,
        z: Math.floor(max.z / CHUNK) - Math.floor(min.z / CHUNK) + 1
    };
}

/**
 * Picks a batch span in blocks sized to the ticking chunk budget still free,
 * capped at the configured span, so concurrent edits share the manager's
 * chunk limit instead of starving each other.
 * @returns {number} The batch span in blocks (a multiple of 16).
 */
function pickAreaSpan() {
    const manager = world.tickingAreaManager;
    const available = manager.maxChunkCount - manager.chunkCount;
    const fit = Math.floor(Math.sqrt(Math.max(available, 1)));
    return Math.max(1, Math.min(WE_CONFIG.tickAreaChunkSpan, fit)) * CHUNK;
}

/**
 * Generator that points the player's ticking area at a box, waiting for chunk
 * budget to free up when the manager is at capacity, then waits one tick for
 * the area to take effect and until the box's chunks are loaded. Returns false
 * when the box can never fit or the wait budgets run out.
 * @param {Dimension} dimension The dimension being edited.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The ticking generator; its return value is a boolean.
 */
function* tickAreaFor(dimension, min, max, playerName) {
    const manager = world.tickingAreaManager;
    const name = tickAreaName(playerName);
    if (manager.hasTickingArea(name)) {
        manager.removeTickingArea(name);
    }
    const spans = areaChunkSpans(min, max);
    if (spans.x > MAX_AREA_CHUNK_SIDE || spans.z > MAX_AREA_CHUNK_SIDE || spans.x * spans.z > manager.maxChunkCount) {
        return false;
    }
    const options = { dimension, from: { x: min.x, y: 0, z: min.z }, to: { x: max.x, y: 0, z: max.z } };
    let waited = 0;
    while (!manager.hasCapacity(options)) {
        if (waited >= WE_CONFIG.capacityWaitTicks) {
            return false;
        }
        waited += 1;
        yield;
    }
    manager.createTickingArea(name, options);
    yield;
    for (let attempt = 0; attempt < WE_CONFIG.chunkLoadAttempts; attempt++) {
        if (dimension.isChunkLoaded(min) && dimension.isChunkLoaded(max)) {
            return true;
        }
        yield;
    }
    return dimension.isChunkLoaded(min) && dimension.isChunkLoaded(max);
}

/**
 * Removes the player's edit ticking area if one is active.
 * @param {string} playerName The acting player's name.
 * @returns {void}
 */
function releaseTickArea(playerName) {
    const manager = world.tickingAreaManager;
    const name = tickAreaName(playerName);
    if (manager.hasTickingArea(name)) {
        manager.removeTickingArea(name);
    }
}

export { tickAreaFor, releaseTickArea, pickAreaSpan };
