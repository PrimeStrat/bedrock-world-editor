import { BlockPermutation, BlockTypes, Player } from "@minecraft/server";
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

const AIR_ID = "minecraft:air"; // We avoid AIR like the plague due to it sucking up performance
const BUSY_MESSAGE = "§cAn edit is still running. Wait for it to finish.";
const NO_SELECTION_MESSAGE = "§cSet both positions first (/we:pos1, /we:pos2 or the wand).";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {{permutation: BlockPermutation, weight: number}} PatternEntry
 * @typedef {{entries: PatternEntry[], total: number, label: string}} FillPattern
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

let gradientResolver = null;
let patternPlayerName = "";

/**
 * Registers a resolver that expands a "#name" gradient token for a player to a
 * weighted pattern string. Set once by the gradient module at load.
 * @param {function(string, string): string|null} resolver The (playerName, name) resolver.
 * @returns {void}
 */
function setGradientResolver(resolver) {
    gradientResolver = resolver;
}

/**
 * Sets the player whose gradients "#name" tokens resolve against. Set at each
 * command or tool entry before patterns are parsed.
 * @param {string} playerName The acting player's name.
 * @returns {void}
 */
function setPatternPlayer(playerName) {
    patternPlayerName = playerName;
}

/**
 * Expands a leading "#name" gradient token to the acting player's stored
 * weighted pattern string, or returns the text unchanged.
 * @param {string} text The pattern text.
 * @returns {string} The expanded text.
 */
function expandGradient(text) {
    const trimmed = String(text).trim();
    if (trimmed.startsWith("#") && gradientResolver && patternPlayerName) {
        return gradientResolver(patternPlayerName, trimmed.slice(1).toLowerCase()) ?? trimmed;
    }
    return trimmed;
}

/**
 * Parses a fill pattern: one block id, a weighted comma list like
 * "50stone,50cobblestone" ("50%stone" also works), or a "#name" gradient
 * token. Entries without a weight count as weight 1.
 * @param {string} text The pattern text.
 * @returns {FillPattern|null} The pattern, or null when any entry is invalid.
 */
function parsePattern(text) {
    const parts = expandGradient(text).split(",");
    const entries = [];
    const names = [];
    let total = 0;
    for (const part of parts) {
        const match = part.trim().match(/^(?:(\d+)\s*%?\s*)?([a-z_][a-z0-9_:]*)$/i);
        if (!match) {
            return null;
        }
        const full = resolveBlockId(match[2]);
        if (!full) {
            return null;
        }
        const weight = match[1] ? Math.max(1, parseInt(match[1], 10)) : 1;
        entries.push({ permutation: BlockPermutation.resolve(full), weight });
        names.push(shortName(full));
        total += weight;
    }
    if (entries.length === 0) {
        return null;
    }
    return { entries, total, label: names.join(",") };
}

/**
 * Returns the first invalid entry in a pattern text.
 * @param {string} text The pattern text.
 * @returns {string} The failing entry, or the whole text.
 */
function patternInvalidEntry(text) {
    for (const part of expandGradient(text).split(",")) {
        const match = part.trim().match(/^(?:(\d+)\s*%?\s*)?([a-z_][a-z0-9_:]*)$/i);
        if (!match || !resolveBlockId(match[2])) {
            return part.trim();
        }
    }
    return String(text);
}

/**
 * Builds the error message for an invalid pattern, naming the failing entry.
 * @param {string} text The pattern text.
 * @returns {string} The error message.
 */
function patternErrorMessage(text) {
    return "§cUnknown block in pattern: §b" + patternInvalidEntry(text) + "§c.";
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
    const view = player.getViewDirection();
    if (Math.abs(view.y) >= Math.abs(view.x) && Math.abs(view.y) >= Math.abs(view.z)) {
        return { x: 0, y: view.y >= 0 ? 1 : -1, z: 0 };
    }
    return axisFromView(view);
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

export { DIRECTIONS, AIR_ID, NO_SELECTION_MESSAGE, resolveBlockId, parsePattern, patternErrorMessage, setGradientResolver, setPatternPlayer, directionOrView, blockUnder, busyGuard, requireRegion, shortName };
