import { world, Dimension, Player } from "@minecraft/server";
import { setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";
import { refillBoxJob } from "./box.js";
import { refillShapeJob } from "./shape.js";
import { runTrackedJob } from "./jobs.js";
import { debugStart, debugProgress, debugEnd, debugSkipped } from "./debug.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Reverses a recorded edit (undo) as a single-record batch.
 * @param {Player} player The player undoing.
 * @param {object} record The edit record to reverse.
 * @returns {void}
 */
function applyUndo(player, record) {
    applyHistoryBatch(player, [record], "undo", "Undo");
}

/**
 * Re-applies a recorded edit (redo) as a single-record batch.
 * @param {Player} player The player redoing.
 * @param {object} record The edit record to re-apply.
 * @returns {void}
 */
function applyRedo(player, record) {
    applyHistoryBatch(player, [record], "redo", "Redo");
}

/**
 * Runs a sequence of history records in one tracked job with one summary
 * message. Records must be ordered for the direction: newest first for undo,
 * replay order for redo.
 * @param {Player} player The acting player.
 * @param {object[]} records The records to apply.
 * @param {string} direction Either "undo" or "redo".
 * @param {string} label A short label for the completion message.
 * @returns {void}
 */
function applyHistoryBatch(player, records, direction, label) {
    setBusy(player.name, true);
    runTrackedJob(player.name, historyJob(records, direction, player.name, label));
}

/**
 * Generator backing applyHistoryBatch: applies each record in order, then
 * reports the combined result once.
 * @param {object[]} records The records to apply.
 * @param {string} direction Either "undo" or "redo".
 * @param {string} playerName The acting player's name.
 * @param {string} label A short label for the completion message.
 * @returns {Generator} The batch job generator.
 */
function* historyJob(records, direction, playerName, label) {
    debugStart(playerName, label);
    let blocks = 0;
    for (const record of records) {
        if (direction === "undo") {
            yield* undoRecordJob(record, playerName);
        } else {
            yield* redoRecordJob(record, playerName);
        }
        blocks += record.blocks;
    }
    releaseTickArea(playerName);
    debugEnd(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        let message = "§a" + label + ": §f" + blocks + "§a block(s) " + (direction === "undo" ? "undone." : "redone.");
        const skipped = debugSkipped(playerName);
        if (skipped > 0) {
            message += " §c" + skipped + " batch(es) skipped - run /we:debug.";
        }
        player.sendMessage(message);
    }
    setBusy(playerName, false);
}

/**
 * Generator that reverses one record: groups recurse newest member first,
 * box and shape edits restore their snapshot tiles, and per-block edits
 * restore their before permutations.
 * @param {object} record The record to reverse.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The undo generator.
 */
function* undoRecordJob(record, playerName) {
    if (record.kind === "group") {
        for (let i = record.records.length - 1; i >= 0; i--) {
            yield* undoRecordJob(record.records[i], playerName);
        }
        return;
    }
    const dimension = world.getDimension(record.dimensionId);
    if (record.kind === "box" || record.kind === "shape") {
        yield* placeTilesCore(dimension, record.tiles, playerName);
        return;
    }
    yield* restoreCore(dimension, record.changes, "before", playerName);
}

/**
 * Generator that re-applies one record: groups recurse in replay order, box
 * and shape edits re-run their fills, and per-block edits restore their
 * after permutations.
 * @param {object} record The record to re-apply.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The redo generator.
 */
function* redoRecordJob(record, playerName) {
    if (record.kind === "group") {
        for (const member of record.records) {
            yield* redoRecordJob(member, playerName);
        }
        return;
    }
    const dimension = world.getDimension(record.dimensionId);
    if (record.kind === "box") {
        yield* refillBoxJob(dimension, record, playerName);
        return;
    }
    if (record.kind === "shape") {
        yield* refillShapeJob(dimension, record, playerName);
        return;
    }
    yield* restoreCore(dimension, record.changes, "after", playerName);
}

/**
 * Generator that places snapshot tiles back, grouped into span-sized ticking
 * areas.
 * @param {Dimension} dimension The dimension to edit.
 * @param {{id: string, x: number, y: number, z: number}[]} tiles The snapshot tiles.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The tile placement generator.
 */
function* placeTilesCore(dimension, tiles, playerName) {
    const span = pickAreaSpan();
    const groups = new Map();
    for (const tile of tiles) {
        const structure = world.structureManager.get(tile.id);
        if (!structure) {
            continue;
        }
        const key = Math.floor(tile.x / span) + "," + Math.floor(tile.z / span);
        let group = groups.get(key);
        if (!group) {
            group = [];
            groups.set(key, group);
        }
        group.push({ tile, structure });
    }
    let placed = 0;
    for (const group of groups.values()) {
        const gMin = { x: Infinity, y: Infinity, z: Infinity };
        const gMax = { x: -Infinity, y: -Infinity, z: -Infinity };
        for (const member of group) {
            gMin.x = Math.min(gMin.x, member.tile.x);
            gMin.y = Math.min(gMin.y, member.tile.y);
            gMin.z = Math.min(gMin.z, member.tile.z);
            gMax.x = Math.max(gMax.x, member.tile.x + member.structure.size.x - 1);
            gMax.y = Math.max(gMax.y, member.tile.y + member.structure.size.y - 1);
            gMax.z = Math.max(gMax.z, member.tile.z + member.structure.size.z - 1);
        }
        const ok = yield* tickAreaFor(dimension, gMin, gMax, playerName);
        if (!ok) {
            continue;
        }
        for (const member of group) {
            world.structureManager.place(member.tile.id, dimension, { x: member.tile.x, y: member.tile.y, z: member.tile.z }, { includeEntities: false });
            placed += 1;
            debugProgress(playerName, placed);
            yield;
        }
    }
}

/**
 * Returns the bounding box of a list of block changes.
 * @param {object[]} changes The changes to measure.
 * @returns {{min: Vec3, max: Vec3}} The inclusive bounding box.
 */
function changesBounds(changes) {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const change of changes) {
        min.x = Math.min(min.x, change.location.x);
        min.y = Math.min(min.y, change.location.y);
        min.z = Math.min(min.z, change.location.z);
        max.x = Math.max(max.x, change.location.x);
        max.y = Math.max(max.y, change.location.y);
        max.z = Math.max(max.z, change.location.z);
    }
    return { min, max };
}

/**
 * Generator that restores stored permutations (before or after) in batches,
 * ticking the affected region first.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object[]} changes The changes to restore.
 * @param {string} which Either "before" (undo) or "after" (redo).
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The restore generator.
 */
function* restoreCore(dimension, changes, which, playerName) {
    if (changes.length > 0) {
        const bounds = changesBounds(changes);
        yield* tickAreaFor(dimension, bounds.min, bounds.max, playerName);
    }
    let processed = 0;
    for (const change of changes) {
        dimension.setBlockPermutation(change.location, change[which]);
        processed += 1;
        if (processed % WE_CONFIG.blocksPerYield === 0) {
            yield;
        }
    }
}

export { applyUndo, applyRedo, applyHistoryBatch };
