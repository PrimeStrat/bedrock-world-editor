import { BlockTypes, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { getSelection, isBusy } from "../session.js";
import { boxVolume } from "../operations/util.js";
import { axisFromView } from "../clipboard.js";

const DIRECTIONS = {
    up: { x: 0, y: 1, z: 0 },
    down: { x: 0, y: -1, z: 0 },
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 }
};

const AIR_ID = "minecraft:air";
const BUSY_MESSAGE = "§cAn edit is still running. Wait for it to finish.";
const NO_SELECTION_MESSAGE = "§cSet both positions first (/we:pos1, /we:pos2 or the wand).";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Resolves a possibly-unprefixed block id to a full valid id, or null.
 * @param {string} id The block id text.
 * @returns {string|null} The full block id, or null when unknown.
 */
function resolveBlockId(id) {
    const trimmed = String(id).trim().toLowerCase();
    if (trimmed === "") {
        return null;
    }
    const full = trimmed.includes(":") ? trimmed : "minecraft:" + trimmed;
    return BlockTypes.get(full) ? full : null;
}

/**
 * Returns the unit vector for a named direction, or the player's dominant view
 * axis when no name is given.
 * @param {Player} player The acting player.
 * @param {string|undefined} name The direction name, or undefined.
 * @returns {Vec3|null} The unit vector, or null for an unknown name.
 */
function directionOrView(player, name) {
    if (name) {
        return DIRECTIONS[name] ?? null;
    }
    return axisFromView(player.getViewDirection());
}

/**
 * Returns the floored block location a player is standing on.
 * @param {Player} player The player.
 * @returns {Vec3} The block location.
 */
function blockUnder(player) {
    const loc = player.location;
    return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

/**
 * Returns a failure result while an edit is running for the player, or null.
 * @param {Player} player The acting player.
 * @returns {ActionResult|null} The failure, or null when free.
 */
function busyGuard(player) {
    if (isBusy(player.name)) {
        return { ok: false, message: BUSY_MESSAGE };
    }
    return null;
}

/**
 * Validates the common preconditions for a region edit: not busy, a full
 * selection, and a volume under the cap.
 * @param {Player} player The acting player.
 * @returns {{ok: true, min: Vec3, max: Vec3, volume: number}|{ok: false, message: string}} The region or a failure.
 */
function requireRegion(player) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    const volume = boxVolume(pos1, pos2);
    if (volume > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cSelection too large (" + volume + " > " + WE_CONFIG.maxBlocks + ")." };
    }
    return {
        ok: true,
        min: { x: Math.min(pos1.x, pos2.x), y: Math.min(pos1.y, pos2.y), z: Math.min(pos1.z, pos2.z) },
        max: { x: Math.max(pos1.x, pos2.x), y: Math.max(pos1.y, pos2.y), z: Math.max(pos1.z, pos2.z) },
        volume
    };
}

/**
 * Returns a block id without its namespace prefix for compact display.
 * @param {string} id The full block type id.
 * @returns {string} The id with any "namespace:" prefix removed.
 */
function shortName(id) {
    const colon = id.indexOf(":");
    return colon === -1 ? id : id.slice(colon + 1);
}

export { DIRECTIONS, AIR_ID, NO_SELECTION_MESSAGE, resolveBlockId, directionOrView, blockUnder, busyGuard, requireRegion, shortName };
