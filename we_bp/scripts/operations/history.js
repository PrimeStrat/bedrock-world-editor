import { world, system, Dimension, Player } from "@minecraft/server";
import { setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { tickAreaFor, releaseTickArea } from "./ticking.js";
import { refillBoxJob } from "./box.js";
import { refillShapeJob } from "./shape.js";

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
        system.runJob(placeTilesJob(dimension, record.tiles, player.name, record.blocks));
        return;
    }
    system.runJob(restoreJob(dimension, record.changes, "before", player.name, "Undo"));
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
        system.runJob(refillBoxJob(dimension, record, player.name));
        return;
    }
    if (record.kind === "shape") {
        system.runJob(refillShapeJob(dimension, record, player.name));
        return;
    }
    system.runJob(restoreJob(dimension, record.changes, "after", player.name, "Redo"));
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
    for (const tile of tiles) {
        const structure = world.structureManager.get(tile.id);
        if (!structure) {
            continue;
        }
        const min = { x: tile.x, y: tile.y, z: tile.z };
        const max = { x: tile.x + structure.size.x - 1, y: tile.y, z: tile.z + structure.size.z - 1 };
        const ok = yield* tickAreaFor(dimension, min, max, playerName);
        if (!ok) {
            continue;
        }
        world.structureManager.place(tile.id, dimension, min, { includeEntities: false });
        yield;
    }
    releaseTickArea(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aUndo: §f" + blocks + "§a block(s) restored.");
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
