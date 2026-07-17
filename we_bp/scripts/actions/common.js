import { BlockPermutation, BlockTypes, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { getSelection, getPolygon, isBusy } from "../session.js";
import { boxVolume } from "../operations/util.js";
import { blockForFraction, gradientFraction } from "./gradmap.js";
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
 * Registers a resolver that returns a player's gradient palette config
 * (ordered bands, projection type, interpolation) for a "#name" token, or
 * null when unknown. Set once by the gradient module at load.
 * @param {function(string, string): {bands: {id: string, weight: number}[], type: string, interp: string}|null} resolver The (playerName, name) resolver.
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
 * Builds a layered fill pattern from a gradient palette: the pattern carries a
 * per-cell pick that maps each block's position to an ordered band, so the
 * palette always places as layers, never as a random mix. With a selection the
 * bands run along pos1 to pos2 (planar) or radiate from pos1 (spherical);
 * without one they repeat as horizontal layers, one block per weight unit.
 * @param {string} name The gradient palette name (without the #).
 * @returns {FillPattern|null} The layered pattern, or null when unknown.
 */
function gradientPattern(name) {
    if (!gradientResolver || !patternPlayerName) {
        return null;
    }
    const cfg = gradientResolver(patternPlayerName, name);
    if (!cfg) {
        return null;
    }
    const perms = new Map();
    const entries = [];
    let total = 0;
    for (const band of cfg.bands) {
        const permutation = BlockPermutation.resolve(band.id);
        perms.set(band.id, permutation);
        entries.push({ permutation, weight: band.weight });
        total += band.weight;
    }
    const sel = getSelection(patternPlayerName);
    const hasAxis = Boolean(sel.pos1 && sel.pos2);
    const from = hasAxis ? { x: sel.pos1.x, y: sel.pos1.y, z: sel.pos1.z } : null;
    const to = hasAxis ? { x: sel.pos2.x, y: sel.pos2.y, z: sel.pos2.z } : null;
    const span = Math.max(1, total);
    const pick = (x, y, z) => {
        const t = hasAxis
            ? gradientFraction({ x, y, z }, from, to, cfg.type)
            : (((y % span) + span) % span) / span;
        return perms.get(blockForFraction(cfg.bands, t, cfg.interp));
    };
    return { entries, total, label: "#" + name, pick };
}

/**
 * Parses a fill pattern: one block id, a weighted comma list like
 * "50stone,50cobblestone" ("50%stone" also works), or a "#name" gradient
 * palette (always layered, see gradientPattern). Entries without a weight
 * count as weight 1.
 * @param {string} text The pattern text.
 * @returns {FillPattern|null} The pattern, or null when any entry is invalid.
 */
function parsePattern(text) {
    const trimmed = String(text).trim();
    if (trimmed.startsWith("#")) {
        return gradientPattern(trimmed.slice(1).toLowerCase());
    }
    const parts = trimmed.split(",");
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
    const trimmed = String(text).trim();
    if (trimmed.startsWith("#")) {
        return trimmed;
    }
    for (const part of trimmed.split(",")) {
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
    const entry = patternInvalidEntry(text);
    if (entry.startsWith("#")) {
        return "§cNo gradient palette named §b" + entry + "§c. Make one with /we:gradient.";
    }
    return "§cUnknown block in pattern: §b" + entry + "§c.";
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
 * Returns whether an XZ point is inside a polygon, using the even-odd rule.
 * @param {number} x The test X (block center).
 * @param {number} z The test Z (block center).
 * @param {Vec3[]} poly The polygon vertices.
 * @returns {boolean} True when inside.
 */
function pointInPolygon(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x + 0.5;
        const zi = poly[i].z + 0.5;
        const xj = poly[j].x + 0.5;
        const zj = poly[j].z + 0.5;
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Builds a mask function that returns true only for cells inside the given
 * polygon (tested on the XZ plane at block centers).
 * @param {Vec3[]} polygon The polygon vertices.
 * @returns {function(number, number, number): boolean} The cell mask.
 */
function polygonMask(polygon) {
    return (x, y, z) => pointInPolygon(x + 0.5, z + 0.5, polygon);
}

/**
 * Validates the common preconditions for a region edit: not busy, a full
 * selection, and a volume under the cap. Includes the polygon mask when the
 * selection is a polygon so fills confine to its interior.
 * @param {Player} player The acting player.
 * @returns {{ok: true, min: Vec3, max: Vec3, volume: number, mask: function|null}|{ok: false, message: string}} The region or a failure.
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
    const polygon = getPolygon(player.name);
    return {
        ok: true,
        min: { x: Math.min(pos1.x, pos2.x), y: Math.min(pos1.y, pos2.y), z: Math.min(pos1.z, pos2.z) },
        max: { x: Math.max(pos1.x, pos2.x), y: Math.max(pos1.y, pos2.y), z: Math.max(pos1.z, pos2.z) },
        volume,
        mask: polygon && polygon.length >= 3 ? polygonMask(polygon) : null
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
