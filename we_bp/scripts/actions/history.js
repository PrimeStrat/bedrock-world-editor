import { Player } from "@minecraft/server";
import { clearHistory, popUndo, popRedo } from "../session.js";
import { applyUndo, applyRedo } from "../operations/history.js";
import { busyGuard } from "./common.js";

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Undoes the player's most recent edit.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function undoEdit(player) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const record = popUndo(player.name);
    if (!record) {
        return { ok: false, message: "§cNothing to undo." };
    }
    applyUndo(player, record);
    return { ok: true, message: "§aUndoing..." };
}

/**
 * Redoes the player's most recently undone edit.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function redoEdit(player) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const record = popRedo(player.name);
    if (!record) {
        return { ok: false, message: "§cNothing to redo." };
    }
    applyRedo(player, record);
    return { ok: true, message: "§aRedoing..." };
}

/**
 * Discards the player's undo and redo history.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function clearEditHistory(player) {
    const count = clearHistory(player.name);
    return { ok: true, message: "§aHistory cleared (§f" + count + "§a record(s))." };
}

export { undoEdit, redoEdit, clearEditHistory };
