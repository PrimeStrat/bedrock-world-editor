import { system, Player } from "@minecraft/server";
import { clearHistory, popUndo, popRedo, takeUndo, takeRedo, pushUndoRecord, pushRedoRecord } from "../session.js";
import { applyUndo, applyRedo, applyHistoryBatch } from "../operations/history.js";
import { busyGuard } from "./common.js";

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Wraps a set of history records as one group record so the batch occupies a
 * single history entry, or returns the lone record unchanged.
 * @param {object[]} chronological The member records, oldest first.
 * @param {number} blocks The combined block count.
 * @returns {object} The group record, or the single record.
 */
function groupRecord(chronological, blocks) {
    if (chronological.length === 1) {
        return chronological[0];
    }
    return {
        kind: "group",
        dimensionId: chronological[0].dimensionId,
        records: chronological,
        label: "§dBatch §7(" + chronological.length + " edits)",
        blocks,
        tick: system.currentTick
    };
}

/**
 * Undoes the player's most recent edits up to a count, logging the batch as
 * one redoable history entry.
 * @param {Player} player The acting player.
 * @param {number} count How many edits to undo.
 * @returns {ActionResult} The result.
 */
function massUndo(player, count) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const records = takeUndo(player.name, count);
    if (records.length === 0) {
        return { ok: false, message: "§cNothing to undo." };
    }
    const blocks = records.reduce((sum, record) => sum + record.blocks, 0);
    pushRedoRecord(player.name, groupRecord(records.slice().reverse(), blocks));
    applyHistoryBatch(player, records, "undo", "Undo");
    return { ok: true, message: "§aUndoing §f" + records.length + "§a edit(s)..." };
}

/**
 * Redoes the player's most recently undone edits up to a count, logging the
 * batch as one undoable history entry.
 * @param {Player} player The acting player.
 * @param {number} count How many edits to redo.
 * @returns {ActionResult} The result.
 */
function massRedo(player, count) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const records = takeRedo(player.name, count);
    if (records.length === 0) {
        return { ok: false, message: "§cNothing to redo." };
    }
    const blocks = records.reduce((sum, record) => sum + record.blocks, 0);
    pushUndoRecord(player.name, groupRecord(records.slice(), blocks));
    applyHistoryBatch(player, records, "redo", "Redo");
    return { ok: true, message: "§aRedoing §f" + records.length + "§a edit(s)..." };
}

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

export { undoEdit, redoEdit, massUndo, massRedo, clearEditHistory };
