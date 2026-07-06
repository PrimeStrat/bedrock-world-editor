import { world, system, Dimension, Player } from "@minecraft/server";
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
 * Reverses a recorded edit (undo). Box edits restore their snapshot structure
 * tiles; per-block edits restore each stored permutation.
 * @param {Player} player The player undoing.
 * @param {object} record The edit record to reverse.
 * @returns {void}
 */
function applyUndo(player, record) {
    const dimension = world.getDimension(record.dimensionId);
    setBusy(player.name, true);
    if (record.kind === "box" || record.kind === "shape") {
        runTrackedJob(player.name, placeTilesJob(dimension, record.tiles, player.name, record.blocks));
        return;
    }
    runTrackedJob(player.name, restoreJob(dimension, record.changes, "before", player.name, "Undo"));
}

/**
 * Re-applies a recorded edit (redo). Box edits re-run their fill; per-block
 * edits restore each stored after-permutation.
 * @param {Player} player The player redoing.
 * @param {object} record The edit record to re-apply.
 * @returns {void}
 */
function applyRedo(player, record) {
    const dimension = world.getDimension(record.dimensionId);
    setBusy(player.name, true);
    if (record.kind === "box") {
        runTrackedJob(player.name, refillBoxJob(dimension, record, player.name));
        return;
    }
    if (record.kind === "shape") {
        runTrackedJob(player.name, refillShapeJob(dimension, record, player.name));
        return;
    }
    runTrackedJob(player.name, restoreJob(dimension, record.changes, "after", player.name, "Redo"));
}

/**
 * Generator that restores a box edit by placing its snapshot tiles back,
 * ticking each tile's chunks before placement, then messaging the player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {{id: string, x: number, y: number, z: number}[]} tiles The snapshot tiles.
 * @param {string} playerName The acting player's name.
 * @param {number} blocks The block count for the completion message.
 * @returns {Generator} The tile placement job generator.
 */
function* placeTilesJob(dimension, tiles, playerName, blocks) {
    debugStart(playerName, "Undo (" + tiles.length + " tiles)");
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
    releaseTickArea(playerName);
    debugEnd(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        let message = "§aUndo: §f" + blocks + "§a block(s) restored.";
        const skipped = debugSkipped(playerName);
        if (skipped > 0) {
            message += " §c" + skipped + " tile(s) skipped - run /we:debug.";
        }
        player.sendMessage(message);
    }
    setBusy(playerName, false);
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
 * ticking the affected region first when it fits in one area.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object[]} changes The changes to restore.
 * @param {string} which Either "before" (undo) or "after" (redo).
 * @param {string} playerName The acting player's name.
 * @param {string} label A short label for the completion message.
 * @returns {Generator} The restore job generator.
 */
function* restoreJob(dimension, changes, which, playerName, label) {
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
    releaseTickArea(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§a" + label + ": §f" + changes.length + "§a block(s) restored.");
    }
    setBusy(playerName, false);
}

export { applyUndo, applyRedo };
