import { world, system, BlockVolume, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { CHUNK, chunkFloor, boxVolume, blockFilterFor, clampToHeight, pickPatternPermutation, cellMatchesFilter } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan, areaFullyLoaded } from "./ticking.js";
import { reserveBoxUndoSlot, snapshotBoxTiles } from "./undo.js";
import { runTrackedJob } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";
import { debugStart, debugProgress, debugEnd, debugSkipped } from "./debug.js";

const CELLS_PER_YIELD = 256;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Fills an axis-aligned box with a fill pattern. The prior region is
 * snapshotted into a grid of undo structures (each within the 64x384x64 size
 * limit) rather than read cell-by-cell, so a box edit stays cheap at any size.
 * @param {Player} player The player performing the edit.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {FillPattern} pattern The fill pattern.
 * @param {string|null} matchId Only fill cells of this block id (replace), or null for any.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string} label A short label for history and the completion message.
 * @returns {void}
 */
function runBoxEdit(player, dimension, min, max, pattern, matchId, includeAir, label) {
    const box = clampToHeight(dimension, min, max);
    const useBusy = !areaFullyLoaded(dimension, box.min, box.max);
    if (useBusy) {
        setBusy(player.name, true);
    }
    runTrackedJob(player.name, boxEditJob(dimension, box.min, box.max, pattern, matchId, includeAir, player.name, label, useBusy));
}

/**
 * Generator that fills a box in ticking-area batches: each batch spans as many
 * chunks as the ticking budget allows (capped by config), gets ticked until
 * loaded, then filled. Single-block patterns fill in chunk-column slabs (each
 * within the native fillBlocks cap); weighted patterns fill cell-by-cell with
 * a random pick per cell. Accumulates the changed count into a one-element
 * result array.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {FillPattern} pattern The fill pattern.
 * @param {string|null} matchId Only fill cells of this block id, or null for any.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {number[]} outChanged A one-element array receiving the changed count.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The chunked fill generator.
 */
function* fillBoxChunked(dimension, min, max, pattern, matchId, includeAir, outChanged, playerName) {
    const excludeId = pattern.entries.length === 1 ? pattern.entries[0].permutation.type.id : null;
    const blockFilter = blockFilterFor(matchId, includeAir, excludeId);
    const single = pattern.entries.length === 1 && !matchId;
    const filtered = Boolean(matchId) || !includeAir;
    const sweep = fallingBlockSweeper(dimension, min, max);
    let changed = 0;
    const span = pickAreaSpan();
    for (let ax = chunkFloor(min.x); ax <= max.x; ax += span) {
        for (let az = chunkFloor(min.z); az <= max.z; az += span) {
            const areaMin = { x: Math.max(ax, min.x), y: min.y, z: Math.max(az, min.z) };
            const areaMax = { x: Math.min(ax + span - 1, max.x), y: max.y, z: Math.min(az + span - 1, max.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            if (!ok) {
                continue;
            }
            if (single) {
                for (let x = areaMin.x; x <= areaMax.x; x = chunkFloor(x) + CHUNK) {
                    for (let z = areaMin.z; z <= areaMax.z; z = chunkFloor(z) + CHUNK) {
                        for (let y = areaMin.y; y <= areaMax.y; y += WE_CONFIG.fillSlab) {
                            const subMin = { x, y, z };
                            const subMax = {
                                x: Math.min(chunkFloor(x) + CHUNK - 1, areaMax.x),
                                y: Math.min(y + WE_CONFIG.fillSlab - 1, areaMax.y),
                                z: Math.min(chunkFloor(z) + CHUNK - 1, areaMax.z)
                            };
                            const result = dimension.fillBlocks(new BlockVolume(subMin, subMax), pattern.entries[0].permutation, { blockFilter });
                            changed += result.getCapacity();
                            debugProgress(playerName, changed);
                            sweep(false);
                            yield;
                        }
                    }
                }
            } else {
                let sinceYield = 0;
                for (let x = areaMin.x; x <= areaMax.x; x++) {
                    for (let z = areaMin.z; z <= areaMax.z; z++) {
                        for (let y = areaMin.y; y <= areaMax.y; y++) {
                            const loc = { x, y, z };
                            const block = dimension.getBlock(loc);
                            let allowed = Boolean(block);
                            if (allowed && filtered) {
                                allowed = cellMatchesFilter(block.typeId, matchId, includeAir);
                            }
                            if (allowed) {
                                const placed = pickPatternPermutation(pattern);
                                if (block.typeId !== placed.type.id) {
                                    dimension.setBlockPermutation(loc, placed);
                                    changed += 1;
                                }
                            }
                            sinceYield += 1;
                            if (sinceYield >= CELLS_PER_YIELD) {
                                sinceYield = 0;
                                debugProgress(playerName, changed);
                                sweep(false);
                                yield;
                            }
                        }
                    }
                }
            }
            sweep(false);
        }
    }
    sweep(true);
    outChanged[0] = changed;
}

/**
 * Job backing runBoxEdit: tiles the snapshot, fills in ticked batches, and
 * records the undo edit.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {FillPattern} pattern The fill pattern.
 * @param {string|null} matchId Only fill cells of this block id, or null for any.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string} playerName The editing player's name.
 * @param {string} label A short label for the completion message.
 * @param {boolean} useBusy Whether this job holds the busy flag.
 * @returns {Generator} The box edit job generator.
 */
function* boxEditJob(dimension, min, max, pattern, matchId, includeAir, playerName, label, useBusy) {
    debugStart(playerName, label);
    const slot = reserveBoxUndoSlot(playerName);
    const tiles = [];
    yield* snapshotBoxTiles(dimension, min, max, playerName, slot, tiles);
    const total = boxVolume(min, max);
    const record = {
        kind: "box",
        dimensionId: dimension.id,
        tiles,
        min: { x: min.x, y: min.y, z: min.z },
        max: { x: max.x, y: max.y, z: max.z },
        fill: { pattern, matchId, includeAir },
        label,
        blocks: total,
        tick: system.currentTick
    };
    pushUndo(playerName, record);
    const outChanged = [0];
    yield* fillBoxChunked(dimension, min, max, pattern, matchId, includeAir, outChanged, playerName);
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
 * Job that re-applies a box edit's fill (redo) in ticked batches across ticks.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object} record The box edit record.
 * @param {string} playerName The redoing player's name.
 * @returns {Generator} The box redo job generator.
 */
function* refillBoxJob(dimension, record, playerName) {
    debugStart(playerName, "Redo " + record.label);
    const outChanged = [0];
    yield* fillBoxChunked(dimension, record.min, record.max, record.fill.pattern, record.fill.matchId, record.fill.includeAir, outChanged, playerName);
    releaseTickArea(playerName);
    debugEnd(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aRedo: §f" + boxVolume(record.min, record.max) + "§a block(s) redone.");
    }
    setBusy(playerName, false);
}

export { runBoxEdit, refillBoxJob };
