import { system, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { getSelection } from "../session.js";
import { runBoxEdit } from "../operations/box.js";
import { copySelection, pasteClipboard, rotateClipboard, flipClipboard, clearClipboardForPlayer, stackSelection } from "../clipboard.js";
import { AIR_ID, NO_SELECTION_MESSAGE, parsePattern, busyGuard, directionOrView, requireRegion } from "./common.js";

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Copies the selection to the clipboard.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function copyRegion(player) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    system.run(() => {
        const result = copySelection(player, pos1, pos2);
        player.sendMessage(result.ok ? "§a" + result.message : "§c" + result.message);
    });
    return { ok: true, message: "§aCopying..." };
}

/**
 * Copies the selection to the clipboard, then fills it with air.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function cutRegion(player) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const { pos1, pos2 } = getSelection(player.name);
    system.run(() => {
        const result = copySelection(player, pos1, pos2);
        if (!result.ok) {
            player.sendMessage("§c" + result.message);
            return;
        }
        runBoxEdit(player, player.dimension, region.min, region.max, parsePattern(AIR_ID), null, true, "Cut");
    });
    return { ok: true, message: "§aCut started..." };
}

/**
 * Pastes the clipboard at the player.
 * @param {Player} player The acting player.
 * @param {boolean} skipAir When true, air cells do not overwrite blocks.
 * @returns {ActionResult} The result.
 */
function pasteRegionAction(player, skipAir) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    system.run(() => {
        const result = pasteClipboard(player, Boolean(skipAir));
        player.sendMessage(result.ok ? "§a" + result.message : "§c" + result.message);
    });
    return { ok: true, message: "§aPasting..." };
}

/**
 * Stacks the selection along a direction.
 * @param {Player} player The acting player.
 * @param {number} count The number of copies.
 * @param {string|undefined} directionName The direction name, or undefined for view.
 * @returns {ActionResult} The result.
 */
function stackRegion(player, count, directionName) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const reps = Math.max(1, Math.floor(count));
    if (region.volume * reps > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cStack too large." };
    }
    const dir = directionOrView(player, directionName);
    if (!dir) {
        return { ok: false, message: "§cUnknown direction." };
    }
    const { pos1, pos2 } = getSelection(player.name);
    system.run(() => {
        const result = stackSelection(player, pos1, pos2, reps, dir);
        player.sendMessage(result.ok ? "§a" + result.message : "§c" + result.message);
    });
    return { ok: true, message: "§aStacking..." };
}

/**
 * Rotates the clipboard by degrees.
 * @param {Player} player The acting player.
 * @param {number} degrees The rotation in degrees.
 * @returns {ActionResult} The result.
 */
function rotateAction(player, degrees) {
    const result = rotateClipboard(player, degrees);
    return { ok: result.ok, message: (result.ok ? "§a" : "§c") + result.message };
}

/**
 * Flips the clipboard along an axis.
 * @param {Player} player The acting player.
 * @param {string} axis Either "x" or "z".
 * @returns {ActionResult} The result.
 */
function flipAction(player, axis) {
    const result = flipClipboard(player, axis);
    return { ok: result.ok, message: (result.ok ? "§a" : "§c") + result.message };
}

/**
 * Clears the clipboard.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function clearClipboardAction(player) {
    const result = clearClipboardForPlayer(player);
    return { ok: result.ok, message: (result.ok ? "§a" : "§c") + result.message };
}

export { copyRegion, cutRegion, pasteRegionAction, stackRegion, rotateAction, flipAction, clearClipboardAction };
