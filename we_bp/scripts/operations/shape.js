import { world, system, BlockVolume, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { chunkFloor, blockFilterFor, clampToHeight, pickPatternPermutation, cellMatchesFilter } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan, areaFullyLoaded } from "./ticking.js";
import { reserveBoxUndoSlot, snapshotRunTiles } from "./undo.js";
import { debugStart, debugProgress, debugEnd, debugSkipped } from "./debug.js";

const RUNS_PER_YIELD = 256;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Draws a shape described by horizontal X-runs. The shape's bounding box is
 * snapshotted (tiled) for undo, so a sphere costs on the order of its
 * cross-section in native calls instead of its volume.
 * @param {Player} player The player performing the edit.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Iterable<Run>} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {FillPattern} pattern The fill pattern.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string} label A short label for history and the completion message.
 * @param {string|string[]|null} matchId Only fill cells of this block id (replace), or null for any.
 * @returns {void}
 */
function runShapeEdit(player, dimension, runs, bboxMin, bboxMax, pattern, includeAir, label, matchId) {
    const box = clampToHeight(dimension, bboxMin, bboxMax);
    const useBusy = !areaFullyLoaded(dimension, box.min, box.max);
    if (useBusy) {
        setBusy(player.name, true);
    }
    system.runJob(shapeEditJob(dimension, Array.from(runs), box.min, box.max, pattern, includeAir, matchId ?? null, player.name, label, useBusy));
}

/**
 * Generator that draws shape runs in ticking-area batches: each batch spans as
 * many chunks as the ticking budget allows (capped by config), gets ticked
 * until loaded, then every run intersecting the batch is clipped to it and
 * filled. Single-block patterns place each run with one fillBlocks call;
 * weighted patterns fill run cells one by one with a random pick per cell.
 * Accumulates the changed count into a one-element result array.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Run[]} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {FillPattern} pattern The fill pattern.
 * @param {string|string[]|null} matchId Only fill cells of this block id, or null for any.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {number[]} outChanged A one-element array receiving the changed count.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The chunked run fill generator.
 */
function* fillRunsChunked(dimension, runs, bboxMin, bboxMax, pattern, matchId, includeAir, outChanged, playerName) {
    const blockFilter = blockFilterFor(matchId, includeAir);
    const single = pattern.entries.length === 1 && !matchId;
    const filtered = Boolean(matchId) || !includeAir;
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
                if (run.z < areaMin.z || run.z > areaMax.z || run.y < areaMin.y || run.y > areaMax.y) {
                    continue;
                }
                const startX = Math.max(run.x, areaMin.x);
                const endX = Math.min(run.x + run.length - 1, areaMax.x);
                if (startX > endX) {
                    continue;
                }
                if (single) {
                    const changed = dimension.fillBlocks(new BlockVolume({ x: startX, y: run.y, z: run.z }, { x: endX, y: run.y, z: run.z }), pattern.entries[0].permutation, { blockFilter });
                    blocks += changed.getCapacity();
                    sinceYield += 1;
                } else {
                    for (let x = startX; x <= endX; x++) {
                        const loc = { x, y: run.y, z: run.z };
                        let allowed = true;
                        if (filtered) {
                            const block = dimension.getBlock(loc);
                            allowed = Boolean(block) && cellMatchesFilter(block.typeId, matchId, includeAir);
                        }
                        if (allowed) {
                            dimension.setBlockPermutation(loc, pickPatternPermutation(pattern));
                            blocks += 1;
                        }
                        sinceYield += 1;
                        if (sinceYield >= RUNS_PER_YIELD) {
                            sinceYield = 0;
                            yield;
                        }
                    }
                }
                if (sinceYield >= RUNS_PER_YIELD) {
                    sinceYield = 0;
                    debugProgress(playerName, blocks);
                    yield;
                }
            }
        }
    }
    outChanged[0] = blocks;
    debugProgress(playerName, blocks);
}

/**
 * Job backing runShapeEdit: snapshots the bounding box, draws the runs in
 * ticked batches, and records an undoable edit that redoes by replaying them.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Run[]} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {FillPattern} pattern The fill pattern.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string|string[]|null} matchId Only fill cells of this block id, or null for any.
 * @param {string} playerName The editing player's name.
 * @param {string} label A short label for the completion message.
 * @param {boolean} useBusy Whether this job holds the busy flag.
 * @returns {Generator} The shape edit job generator.
 */
function* shapeEditJob(dimension, runs, bboxMin, bboxMax, pattern, includeAir, matchId, playerName, label, useBusy) {
    debugStart(playerName, label);
    const slot = reserveBoxUndoSlot(playerName);
    const tiles = [];
    yield* snapshotRunTiles(dimension, runs, bboxMin, bboxMax, playerName, slot, tiles);
    const outChanged = [0];
    yield* fillRunsChunked(dimension, runs, bboxMin, bboxMax, pattern, matchId, includeAir, outChanged, playerName);
    releaseTickArea(playerName);
    pushUndo(playerName, {
        kind: "shape",
        dimensionId: dimension.id,
        tiles,
        runs,
        min: { x: bboxMin.x, y: bboxMin.y, z: bboxMin.z },
        max: { x: bboxMax.x, y: bboxMax.y, z: bboxMax.z },
        fill: { pattern, includeAir, matchId },
        label,
        blocks: outChanged[0],
        tick: system.currentTick
    });
    debugEnd(playerName);
    const acting = world.getAllPlayers().find((p) => p.name === playerName);
    if (acting) {
        let message = "§a" + label + "§a: §f" + outChanged[0] + "§a block(s) changed.";
        const skipped = debugSkipped(playerName);
        if (skipped > 0) {
            message += " §c" + skipped + " batch(es) skipped - run /we:debug.";
        }
        acting.sendMessage(message);
    }
    if (useBusy) {
        setBusy(playerName, false);
    }
}

/**
 * Re-applies a shape edit (redo) by replaying its runs in ticked batches.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object} record The shape edit record.
 * @param {string} playerName The redoing player's name.
 * @returns {Generator} The shape redo job generator.
 */
function* refillShapeJob(dimension, record, playerName) {
    debugStart(playerName, "Redo " + record.label);
    const outChanged = [0];
    yield* fillRunsChunked(dimension, record.runs, record.min, record.max, record.fill.pattern, record.fill.matchId, record.fill.includeAir, outChanged, playerName);
    releaseTickArea(playerName);
    debugEnd(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aRedo: §f" + record.blocks + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

export { runShapeEdit, refillShapeJob };
