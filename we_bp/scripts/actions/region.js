import { system, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runBoxEdit } from "../operations/box.js";
import { runShapeEdit } from "../operations/shape.js";
import { runCount } from "../operations/count.js";
import { runOverlay } from "../operations/overlay.js";
import { moveSelection } from "../operations/move.js";
import { hollowCubeRuns, wallsRuns } from "../shapes/cube.js";
import { AIR_ID, resolveBlockId, parsePattern, patternErrorMessage, directionOrView, requireRegion, shortName } from "./common.js";

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Returns a failure when a weighted pattern targets more cells than the
 * per-cell fill cap allows, or null.
 * @param {FillPattern} pattern The parsed fill pattern.
 * @param {number} volume The number of cells the edit covers.
 * @returns {ActionResult|null} The failure, or null when allowed.
 */
function patternCapGuard(pattern, volume) {
    if (pattern.entries.length > 1 && volume > WE_CONFIG.maxPatternBlocks) {
        return { ok: false, message: "§cWeighted patterns cap at " + WE_CONFIG.maxPatternBlocks + " blocks." };
    }
    return null;
}

/**
 * Fills the selection with a block or weighted pattern.
 * @param {Player} player The acting player.
 * @param {string} blockText The block id or pattern to fill with.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {string} label The history label.
 * @returns {ActionResult} The result.
 */
function setBlocks(player, blockText, includeAir, label) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const capped = patternCapGuard(pattern, region.volume);
    if (capped) {
        return capped;
    }
    runBoxEdit(player, player.dimension, region.min, region.max, pattern, null, Boolean(includeAir), label + " §b" + pattern.label, region.mask);
    return { ok: true, message: "§a" + label + " started..." };
}

/**
 * Replaces one block type with another block or weighted pattern inside the
 * selection.
 * @param {Player} player The acting player.
 * @param {string} fromId The block id to replace.
 * @param {string} toText The block id or pattern to place.
 * @returns {ActionResult} The result.
 */
function replaceBlocks(player, fromId, toText) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const from = resolveBlockId(fromId);
    if (!from) {
        return { ok: false, message: "§cUnknown block: " + fromId };
    }
    const pattern = parsePattern(toText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(toText) };
    }
    const capped = patternCapGuard(pattern, region.volume);
    if (capped) {
        return capped;
    }
    runBoxEdit(player, player.dimension, region.min, region.max, pattern, from, true, "Replace §b" + shortName(from) + "§7 -> §b" + pattern.label, region.mask);
    return { ok: true, message: "§aReplace started..." };
}

/**
 * Draws a run-based shell over the selection box.
 * @param {Player} player The acting player.
 * @param {string} blockText The block id or pattern to build with.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {string} kind Either "faces" (all six) or "walls" (sides only).
 * @returns {ActionResult} The result.
 */
function buildSelectionShell(player, blockText, includeAir, kind) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const runs = kind === "walls" ? wallsRuns(region.min, region.max) : hollowCubeRuns(region.min, region.max);
    const label = (kind === "walls" ? "Walls " : "Faces ") + "§b" + pattern.label;
    runShapeEdit(player, player.dimension, runs, region.min, region.max, pattern, Boolean(includeAir), label, null, false, region.mask);
    return { ok: true, message: "§a" + label + "§a started..." };
}

/**
 * Places a block or pattern at the center of the selection. Even-sized axes
 * fill both middle cells.
 * @param {Player} player The acting player.
 * @param {string} blockText The block id or pattern to place.
 * @returns {ActionResult} The result.
 */
function placeCenter(player, blockText) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const min = {
        x: Math.floor((region.min.x + region.max.x) / 2),
        y: Math.floor((region.min.y + region.max.y) / 2),
        z: Math.floor((region.min.z + region.max.z) / 2)
    };
    const max = {
        x: Math.ceil((region.min.x + region.max.x) / 2),
        y: Math.ceil((region.min.y + region.max.y) / 2),
        z: Math.ceil((region.min.z + region.max.z) / 2)
    };
    runBoxEdit(player, player.dimension, min, max, pattern, null, true, "Center §b" + pattern.label);
    return { ok: true, message: "§aCenter placed at §f" + min.x + " " + min.y + " " + min.z + "§a." };
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
    if (region.mask) {
        return { ok: false, message: "§cHollow needs a box selection, not a polygon." };
    }
    const min = { x: region.min.x + 1, y: region.min.y + 1, z: region.min.z + 1 };
    const max = { x: region.max.x - 1, y: region.max.y - 1, z: region.max.z - 1 };
    if (min.x > max.x || min.y > max.y || min.z > max.z) {
        return { ok: false, message: "§cSelection too thin to hollow." };
    }
    runBoxEdit(player, player.dimension, min, max, parsePattern(AIR_ID), null, true, "Hollow");
    return { ok: true, message: "§aHollow started..." };
}

/**
 * Places a block or weighted pattern on top of every column's highest non-air
 * block in the selection.
 * @param {Player} player The acting player.
 * @param {string} blockText The block id or pattern to overlay.
 * @returns {ActionResult} The result.
 */
function overlaySelection(player, blockText) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    runOverlay(player, player.dimension, region.min, region.max, pattern, region.mask);
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

export { setBlocks, replaceBlocks, buildSelectionShell, placeCenter, hollowSelection, overlaySelection, countBlocks, moveRegion };
