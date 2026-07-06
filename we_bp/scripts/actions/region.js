import { system, BlockPermutation, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runBoxEdit } from "../operations/box.js";
import { runShapeEdit } from "../operations/shape.js";
import { runCount } from "../operations/count.js";
import { runOverlay } from "../operations/overlay.js";
import { moveSelection } from "../operations/move.js";
import { hollowCubeRuns, wallsRuns } from "../shapes/cube.js";
import { AIR_ID, resolveBlockId, directionOrView, requireRegion, shortName } from "./common.js";

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Fills the selection with a block.
 * @param {Player} player The acting player.
 * @param {string} blockId The block id to fill with.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {string} label The history label.
 * @returns {ActionResult} The result.
 */
function setBlocks(player, blockId, includeAir, label) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    runBoxEdit(player, player.dimension, region.min, region.max, BlockPermutation.resolve(full), null, Boolean(includeAir), label + " " + shortName(full));
    return { ok: true, message: "§a" + label + " started..." };
}

/**
 * Replaces one block type with another inside the selection.
 * @param {Player} player The acting player.
 * @param {string} fromId The block id to replace.
 * @param {string} toId The block id to place.
 * @returns {ActionResult} The result.
 */
function replaceBlocks(player, fromId, toId) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const from = resolveBlockId(fromId);
    const to = resolveBlockId(toId);
    if (!from || !to) {
        return { ok: false, message: "§cUnknown block: " + (from ? toId : fromId) };
    }
    runBoxEdit(player, player.dimension, region.min, region.max, BlockPermutation.resolve(to), from, true, "Replace " + shortName(from) + " -> " + shortName(to));
    return { ok: true, message: "§aReplace started..." };
}

/**
 * Draws a run-based shell over the selection box.
 * @param {Player} player The acting player.
 * @param {string} blockId The block id to build with.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {string} kind Either "faces" (all six) or "walls" (sides only).
 * @returns {ActionResult} The result.
 */
function buildSelectionShell(player, blockId, includeAir, kind) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    const perm = BlockPermutation.resolve(full);
    const runs = kind === "walls" ? wallsRuns(region.min, region.max) : hollowCubeRuns(region.min, region.max);
    const label = (kind === "walls" ? "Walls " : "Faces ") + shortName(full);
    runShapeEdit(player, player.dimension, runs, region.min, region.max, perm, Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + " started..." };
}

/**
 * Replaces the interior of the selection with air, leaving a one-block shell.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function hollowSelection(player) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const min = { x: region.min.x + 1, y: region.min.y + 1, z: region.min.z + 1 };
    const max = { x: region.max.x - 1, y: region.max.y - 1, z: region.max.z - 1 };
    if (min.x > max.x || min.y > max.y || min.z > max.z) {
        return { ok: false, message: "§cSelection too thin to hollow." };
    }
    runBoxEdit(player, player.dimension, min, max, BlockPermutation.resolve(AIR_ID), null, true, "Hollow");
    return { ok: true, message: "§aHollow started..." };
}

/**
 * Places a block on top of every column's highest non-air block in the selection.
 * @param {Player} player The acting player.
 * @param {string} blockId The block id to overlay.
 * @returns {ActionResult} The result.
 */
function overlaySelection(player, blockId) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    runOverlay(player, player.dimension, region.min, region.max, BlockPermutation.resolve(full));
    return { ok: true, message: "§aOverlay started..." };
}

/**
 * Counts blocks of a type inside the selection.
 * @param {Player} player The acting player.
 * @param {string} blockId The block id to count.
 * @returns {ActionResult} The result.
 */
function countBlocks(player, blockId) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    runCount(player, player.dimension, region.min, region.max, full);
    return { ok: true, message: "§aCounting..." };
}

/**
 * Moves the selection contents along a direction.
 * @param {Player} player The acting player.
 * @param {number} amount The number of blocks to move.
 * @param {string|undefined} directionName The direction name, or undefined for view.
 * @returns {ActionResult} The result.
 */
function moveRegion(player, amount, directionName) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    if (region.volume * 2 > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cMove too large." };
    }
    const dir = directionOrView(player, directionName);
    if (!dir) {
        return { ok: false, message: "§cUnknown direction." };
    }
    const n = Math.max(1, Math.floor(amount));
    const offset = { x: dir.x * n, y: dir.y * n, z: dir.z * n };
    system.run(() => {
        const result = moveSelection(player, region.min, region.max, offset);
        player.sendMessage(result.ok ? "§a" + result.message : "§c" + result.message);
    });
    return { ok: true, message: "§aMove started..." };
}

export { setBlocks, replaceBlocks, buildSelectionShell, hollowSelection, overlaySelection, countBlocks, moveRegion };
