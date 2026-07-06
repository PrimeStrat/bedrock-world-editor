import { world, system, BlockPermutation, BlockVolume, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { chunkFloor, blockFilterFor } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";
import { reserveBoxUndoSlot, snapshotBoxTiles } from "./undo.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 */

/**
 * Draws a shape described by horizontal X-runs, each placed with one fillBlocks
 * call. The shape's bounding box is snapshotted (tiled) for undo, so a sphere
 * costs on the order of its cross-section in native calls instead of its volume.
 * @param {Player} player The player performing the edit.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Iterable<Run>} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {BlockPermutation} permutation The permutation to fill with.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string} label A short label for history and the completion message.
 * @param {string|null} matchId Only fill cells of this block id (replace), or null for any.
 * @returns {void}
 */
function runShapeEdit(player, dimension, runs, bboxMin, bboxMax, permutation, includeAir, label, matchId) {
    setBusy(player.name, true);
    system.runJob(shapeEditJob(dimension, Array.from(runs), bboxMin, bboxMax, permutation, includeAir, matchId ?? null, player.name, label));
}

/**
 * Generator that draws shape runs in ticking-area batches: each batch spans as
 * many chunks as the ticking budget allows (capped by config), gets ticked
 * until loaded, then every run intersecting the batch is clipped to it and
 * filled. Accumulates the changed count into a one-element result array.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Run[]} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {BlockPermutation} permutation The permutation to fill with.
 * @param {object} blockFilter The prebuilt fillBlocks block filter.
 * @param {number[]} outChanged A one-element array receiving the changed count.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The chunked run fill generator.
 */
function* fillRunsChunked(dimension, runs, bboxMin, bboxMax, permutation, blockFilter, outChanged, playerName) {
    let blocks = 0;
    const span = pickAreaSpan();
    for (let ax = chunkFloor(bboxMin.x); ax <= bboxMax.x; ax += span) {
        for (let az = chunkFloor(bboxMin.z); az <= bboxMax.z; az += span) {
            const areaMin = { x: Math.max(ax, bboxMin.x), y: bboxMin.y, z: Math.max(az, bboxMin.z) };
            const areaMax = { x: Math.min(ax + span - 1, bboxMax.x), y: bboxMax.y, z: Math.min(az + span - 1, bboxMax.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            if (!ok) {
                continue;
            }
            let sinceYield = 0;
            for (const run of runs) {
                if (run.z < areaMin.z || run.z > areaMax.z) {
                    continue;
                }
                const startX = Math.max(run.x, areaMin.x);
                const endX = Math.min(run.x + run.length - 1, areaMax.x);
                if (startX > endX) {
                    continue;
                }
                const changed = dimension.fillBlocks(new BlockVolume({ x: startX, y: run.y, z: run.z }, { x: endX, y: run.y, z: run.z }), permutation, { blockFilter });
                blocks += changed.getCapacity();
                sinceYield += 1;
                if (sinceYield >= 256) {
                    sinceYield = 0;
                    yield;
                }
            }
        }
    }
    outChanged[0] = blocks;
}

/**
 * Job backing runShapeEdit: snapshots the bounding box, draws the runs in
 * ticked batches, and records an undoable edit that redoes by replaying them.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Run[]} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {BlockPermutation} permutation The permutation to fill with.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string|null} matchId Only fill cells of this block id, or null for any.
 * @param {string} playerName The editing player's name.
 * @param {string} label A short label for the completion message.
 * @returns {Generator} The shape edit job generator.
 */
function* shapeEditJob(dimension, runs, bboxMin, bboxMax, permutation, includeAir, matchId, playerName, label) {
    const blockFilter = blockFilterFor(matchId, includeAir);
    const slot = reserveBoxUndoSlot(playerName);
    const tiles = [];
    yield* snapshotBoxTiles(dimension, bboxMin, bboxMax, playerName, slot, tiles);
    const outChanged = [0];
    yield* fillRunsChunked(dimension, runs, bboxMin, bboxMax, permutation, blockFilter, outChanged, playerName);
    releaseTickArea(playerName);
    pushUndo(playerName, {
        kind: "shape",
        dimensionId: dimension.id,
        tiles,
        runs,
        min: { x: bboxMin.x, y: bboxMin.y, z: bboxMin.z },
        max: { x: bboxMax.x, y: bboxMax.y, z: bboxMax.z },
        fill: { permutation, includeAir, matchId },
        label,
        blocks: outChanged[0],
        tick: system.currentTick
    });
    const acting = world.getAllPlayers().find((p) => p.name === playerName);
    if (acting) {
        acting.sendMessage("§a" + label + ": §f" + outChanged[0] + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

/**
 * Re-applies a shape edit (redo) by replaying its runs in ticked batches.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object} record The shape edit record.
 * @param {string} playerName The redoing player's name.
 * @returns {Generator} The shape redo job generator.
 */
function* refillShapeJob(dimension, record, playerName) {
    const blockFilter = blockFilterFor(record.fill.matchId, record.fill.includeAir);
    const outChanged = [0];
    yield* fillRunsChunked(dimension, record.runs, record.min, record.max, record.fill.permutation, blockFilter, outChanged, playerName);
    releaseTickArea(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aRedo: §f" + record.blocks + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

export { runShapeEdit, refillShapeJob };
