import { Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runShapeEdit } from "../operations/shape.js";
import { runFloodFill } from "../operations/floodfill.js";
import { sphereRuns } from "../shapes/sphere.js";
import { AIR_ID, resolveBlockId, parsePattern, patternErrorMessage, setPatternPlayer, busyGuard, blockUnder, shortName } from "./common.js";
import { ensureItem } from "./tools.js";

const LIQUID_IDS = ["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Replaces a block type with air within a radius of the player.
 * @param {Player} player The acting player.
 * @param {string} blockId The block id to remove.
 * @param {number} radius The removal radius.
 * @returns {ActionResult} The result.
 */
function removeNear(player, blockId, radius) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    if (full === AIR_ID) {
        return { ok: false, message: "§cCannot remove air." };
    }
    const r = Math.max(1, Math.floor(radius));
    if (r > WE_CONFIG.nearMaxRadius) {
        return { ok: false, message: "§cRadius too large (max " + WE_CONFIG.nearMaxRadius + ")." };
    }
    const c = blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    runShapeEdit(player, player.dimension, sphereRuns(c, r, false), bboxMin, bboxMax, parsePattern(AIR_ID), true, "RemoveNear §b" + shortName(full), full);
    return { ok: true, message: "§aRemoving nearby §b" + shortName(full) + "§a..." };
}

/**
 * Removes all liquids within a radius of the player.
 * @param {Player} player The acting player.
 * @param {number} radius The drain radius.
 * @returns {ActionResult} The result.
 */
function drainNear(player, radius) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const r = Math.max(1, Math.floor(radius));
    if (r > WE_CONFIG.nearMaxRadius) {
        return { ok: false, message: "§cRadius too large (max " + WE_CONFIG.nearMaxRadius + ")." };
    }
    const c = blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    const runs = Array.from(sphereRuns(c, r, false)).sort((a, b) => b.y - a.y);
    runShapeEdit(player, player.dimension, runs, bboxMin, bboxMax, parsePattern(AIR_ID), true, "Drain", LIQUID_IDS, true);
    return { ok: true, message: "§aDraining..." };
}

/**
 * Replaces one block type with another block or weighted pattern within a
 * radius of the player.
 * @param {Player} player The acting player.
 * @param {number} radius The replacement radius.
 * @param {string} fromId The block id to replace.
 * @param {string} toText The block id or pattern to place.
 * @returns {ActionResult} The result.
 */
function replaceNear(player, radius, fromId, toText) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const from = resolveBlockId(fromId);
    if (!from) {
        return { ok: false, message: "§cUnknown block: " + fromId };
    }
    const to = parsePattern(toText);
    if (!to) {
        return { ok: false, message: patternErrorMessage(toText) };
    }
    const r = Math.max(1, Math.floor(radius));
    if (r > WE_CONFIG.nearMaxRadius) {
        return { ok: false, message: "§cRadius too large (max " + WE_CONFIG.nearMaxRadius + ")." };
    }
    const c = blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    runShapeEdit(player, player.dimension, sphereRuns(c, r, false), bboxMin, bboxMax, to, true, "ReplaceNear §b" + shortName(from) + "§7 -> §b" + to.label, from);
    return { ok: true, message: "§aReplacing nearby §b" + shortName(from) + "§a..." };
}

/**
 * Flood fills from the block at the player's crosshair through connected cells
 * of that same block, replacing them with a block or pattern up to a limit.
 * Spread is gated by the direction options. Gives the Terrain Builder item.
 * @param {Player} player The acting player.
 * @param {string} blockText The block id or pattern to place.
 * @param {number} limit The maximum blocks to place.
 * @param {boolean} horizontal Whether to spread sideways.
 * @param {boolean} up Whether to spread upward.
 * @param {boolean} down Whether to spread downward.
 * @param {boolean} corners Whether to include diagonal side neighbors.
 * @returns {ActionResult} The result.
 */
function floodFill(player, blockText, limit, horizontal, up, down, corners) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    setPatternPlayer(player.name);
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false, includeLiquidBlocks: true });
    if (!hit) {
        return { ok: false, message: "§cLook at a block to flood from." };
    }
    ensureItem(player, "we:terrain_builder");
    const options = { horizontal: horizontal !== false, up: Boolean(up), down: down !== false, corners: Boolean(corners) };
    const cap = Math.min(Math.max(1, Math.floor(limit)), WE_CONFIG.maxPatternBlocks);
    runFloodFill(player, player.dimension, hit.block.location, pattern, cap, options);
    return { ok: true, message: "§aFlood filling from §f" + hit.block.location.x + " " + hit.block.location.y + " " + hit.block.location.z + "§a..." };
}

export { removeNear, drainNear, replaceNear, floodFill };
