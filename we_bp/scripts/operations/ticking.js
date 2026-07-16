import { world, system, Dimension } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { CHUNK, chunkFloor } from "./util.js";
import { debugTickArea, debugProcessing } from "./debug.js";

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
 * Returns whether every chunk covering a box is already loaded, meaning an
 * edit there needs no ticking area.
 * @param {Dimension} dimension The dimension to check.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {boolean} True when the whole box is loaded.
 */
function areaFullyLoaded(dimension, min, max) {
    for (let x = chunkFloor(min.x); x <= max.x; x += CHUNK) {
        for (let z = chunkFloor(min.z); z <= max.z; z += CHUNK) {
            if (!dimension.isChunkLoaded({ x, y: min.y, z })) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Forces the server to load every chunk covering a box by running a
 * testforblock at each chunk's cell. testforblock touches the target block,
 * which pulls its chunk into memory even when no player or ticking area has
 * reached it yet, so a large edit's far chunks load instead of staying stale.
 * @param {Dimension} dimension The dimension to load into.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {void}
 */
function forceLoadArea(dimension, min, max) {
    const y = Math.max(dimension.heightRange.min, Math.min(min.y, dimension.heightRange.max - 1));
    for (let x = chunkFloor(min.x); x <= max.x; x += CHUNK) {
        for (let z = chunkFloor(min.z); z <= max.z; z += CHUNK) {
            if (!dimension.isChunkLoaded({ x, y, z })) {
                dimension.runCommand("testforblock " + x + " " + y + " " + z + " air");
            }
        }
    }
}

/**
 * Generator that points the player's ticking area at a box, waiting for chunk
 * budget to free up when the manager is at capacity, then waits until the
 * area's create promise resolves (all chunks loaded and ticking). Skips area
 * creation entirely when the box is already loaded. Returns false when the
 * box can never fit or the wait budgets run out.
 * @param {Dimension} dimension The dimension being edited.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The ticking generator; its return value is a boolean.
 */
function* tickAreaFor(dimension, min, max, playerName) {
    if (areaFullyLoaded(dimension, min, max)) {
        debugTickArea(playerName, true, "area already loaded");
        return true;
    }
    const manager = world.tickingAreaManager;
    const name = tickAreaName(playerName);
    if (manager.hasTickingArea(name)) {
        manager.removeTickingArea(name);
    }
    const spans = areaChunkSpans(min, max);
    if (spans.x > MAX_AREA_CHUNK_SIDE || spans.z > MAX_AREA_CHUNK_SIDE || spans.x * spans.z > manager.maxChunkCount) {
        debugTickArea(playerName, false, "area too large (" + spans.x + "x" + spans.z + " chunks, max " + manager.maxChunkCount + ")");
        return false;
    }
    const options = { dimension, from: { x: min.x, y: 0, z: min.z }, to: { x: max.x, y: 0, z: max.z } };
    const capacityDeadline = system.currentTick + WE_CONFIG.capacityWaitTicks;
    while (!manager.hasCapacity(options)) {
        if (system.currentTick >= capacityDeadline) {
            debugTickArea(playerName, false, "capacity wait timed out (" + manager.chunkCount + "/" + manager.maxChunkCount + " chunks used)");
            return false;
        }
        debugProcessing(playerName);
        yield;
    }
    let loadState = 0;
    manager.createTickingArea(name, options).then(() => {
        loadState = 1;
    }, () => {
        loadState = -1;
    });
    const startTick = system.currentTick;
    const loadDeadline = startTick + WE_CONFIG.chunkLoadTicks;
    // Wait for the ticking area to come up, then force-load and confirm every
    // chunk in the box is actually loaded. The create promise resolving does not
    // guarantee the whole span is in memory, so testforblock pulls in any that
    // are still missing and we poll until the box is fully loaded.
    while (system.currentTick < loadDeadline) {
        if (loadState !== 0) {
            forceLoadArea(dimension, min, max);
            if (areaFullyLoaded(dimension, min, max)) {
                break;
            }
        }
        debugProcessing(playerName);
        yield;
    }
    const waitedTicks = system.currentTick - startTick;
    const loaded = areaFullyLoaded(dimension, min, max);
    if (loaded) {
        debugTickArea(playerName, true, spans.x + "x" + spans.z + " chunks loaded in " + waitedTicks + " tick(s)");
        return true;
    }
    const reason = loadState === -1 ? "create rejected" : "load wait timed out";
    debugTickArea(playerName, false, reason + " after " + waitedTicks + " tick(s), area not fully loaded");
    return false;
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

export { tickAreaFor, releaseTickArea, pickAreaSpan, areaFullyLoaded };
