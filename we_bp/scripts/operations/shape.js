import { world, system, BlockVolume, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { chunkFloor, blockFilterFor, clampToHeight, pickPatternPermutation, cellMatchesFilter } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan, areaFullyLoaded } from "./ticking.js";
import { reserveBoxUndoSlot, snapshotRunTiles } from "./undo.js";
import { runTrackedJob, chainJobs } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";
import { mirrorBoxFor, mirrorRunsFor } from "../actions/symmetry.js";
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
 * @param {boolean} nativeMatch When true, matching uses the native fillBlocks
 *   filter (fast; safe for ids with no family overlap, like liquids).
 * @returns {void}
 */
function runShapeEdit(player, dimension, runs, bboxMin, bboxMax, pattern, includeAir, label, matchId, nativeMatch, mask) {
    const box = clampToHeight(dimension, bboxMin, bboxMax);
    const runsArray = mask ? maskRuns(Array.from(runs), mask) : Array.from(runs);
    const mirrorBox = mirrorBoxFor(player.name, dimension.id, box.min, box.max);
    const mirrorRuns = mirrorBox ? mirrorRunsFor(player.name, dimension.id, runsArray) : null;
    const useBusy = !areaFullyLoaded(dimension, box.min, box.max)
        || Boolean(mirrorRuns && !areaFullyLoaded(dimension, mirrorBox.min, mirrorBox.max));
    if (useBusy) {
        setBusy(player.name, true);
    }
    if (mirrorRuns) {
        runTrackedJob(player.name, chainJobs(
            shapeEditJob(dimension, runsArray, box.min, box.max, pattern, includeAir, matchId ?? null, Boolean(nativeMatch), player.name, label, false),
            shapeEditJob(dimension, mirrorRuns, mirrorBox.min, mirrorBox.max, pattern, includeAir, matchId ?? null, Boolean(nativeMatch), player.name, label + " §7(mirrored)", useBusy)
        ));
        return;
    }
    runTrackedJob(player.name, shapeEditJob(dimension, runsArray, box.min, box.max, pattern, includeAir, matchId ?? null, Boolean(nativeMatch), player.name, label, useBusy));
}

/**
 * Clips shape runs to only the cells a mask allows, splitting a run into
 * shorter runs where masked-out cells interrupt it.
 * @param {Run[]} runs The shape runs.
 * @param {function(number, number, number): boolean} mask The cell mask.
 * @returns {Run[]} The masked runs.
 */
function maskRuns(runs, mask) {
    const out = [];
    for (const run of runs) {
        let start = null;
        for (let x = run.x; x < run.x + run.length; x++) {
            if (mask(x, run.y, run.z)) {
                if (start === null) {
                    start = x;
                }
            } else if (start !== null) {
                out.push({ x: start, y: run.y, z: run.z, length: x - start });
                start = null;
            }
        }
        if (start !== null) {
            out.push({ x: start, y: run.y, z: run.z, length: run.x + run.length - start });
        }
    }
    return out;
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
 * @param {boolean} nativeMatch When true, matching uses the native filter.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {number[]} outChanged A one-element array receiving the changed count.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The chunked run fill generator.
 */
function* fillRunsChunked(dimension, runs, bboxMin, bboxMax, pattern, matchId, nativeMatch, includeAir, outChanged, playerName) {
    const excludeId = pattern.entries.length === 1 ? pattern.entries[0].permutation.type.id : null;
    const blockFilter = blockFilterFor(matchId, includeAir, excludeId);
    const single = pattern.entries.length === 1 && (!matchId || nativeMatch);
    const filtered = Boolean(matchId) || !includeAir;
    const sweep = fallingBlockSweeper(dimension, bboxMin, bboxMax);
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
                        const block = dimension.getBlock(loc);
                        let allowed = Boolean(block);
                        if (allowed && filtered) {
                            allowed = cellMatchesFilter(block.typeId, matchId, includeAir);
                        }
                        if (allowed) {
                            const placed = pickPatternPermutation(pattern);
                            if (block.typeId !== placed.type.id) {
                                dimension.setBlockPermutation(loc, placed);
                                blocks += 1;
                            }
                        }
                        sinceYield += 1;
                        if (sinceYield >= RUNS_PER_YIELD) {
                            sinceYield = 0;
                            sweep(false);
                            yield;
                        }
                    }
                }
                if (sinceYield >= RUNS_PER_YIELD) {
                    sinceYield = 0;
                    debugProgress(playerName, blocks);
                    sweep(false);
                    yield;
                }
            }
            sweep(false);
        }
    }
    sweep(true);
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
function* shapeEditJob(dimension, runs, bboxMin, bboxMax, pattern, includeAir, matchId, nativeMatch, playerName, label, useBusy) {
    debugStart(playerName, label);
    const slot = reserveBoxUndoSlot(playerName);
    const tiles = [];
    yield* snapshotRunTiles(dimension, runs, bboxMin, bboxMax, playerName, slot, tiles);
    const total = runs.reduce((sum, run) => sum + run.length, 0);
    const record = {
        kind: "shape",
        dimensionId: dimension.id,
        tiles,
        runs,
        min: { x: bboxMin.x, y: bboxMin.y, z: bboxMin.z },
        max: { x: bboxMax.x, y: bboxMax.y, z: bboxMax.z },
        fill: { pattern, includeAir, matchId, nativeMatch },
        label,
        blocks: total,
        tick: system.currentTick
    };
    pushUndo(playerName, record);
    const outChanged = [0];
    yield* fillRunsChunked(dimension, runs, bboxMin, bboxMax, pattern, matchId, nativeMatch, includeAir, outChanged, playerName);
    releaseTickArea(playerName);
    debugEnd(playerName);
    const acting = world.getAllPlayers().find((p) => p.name === playerName);
    if (acting) {
        let message = "§a" + label + "§a: §f" + total + "§a block(s) set.";
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
 * Generator that re-applies a shape edit (redo) by replaying its runs in
 * ticked batches. The caller owns busy handling and completion messages.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object} record The shape edit record.
 * @param {string} playerName The redoing player's name.
 * @returns {Generator} The shape refill generator.
 */
function* refillShapeJob(dimension, record, playerName) {
    const outChanged = [0];
    yield* fillRunsChunked(dimension, record.runs, record.min, record.max, record.fill.pattern, record.fill.matchId, Boolean(record.fill.nativeMatch), record.fill.includeAir, outChanged, playerName);
}

export { runShapeEdit, refillShapeJob };
