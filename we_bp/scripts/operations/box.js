import { world, system, BlockPermutation, BlockVolume, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { CHUNK, chunkFloor, blockFilterFor } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";
import { reserveBoxUndoSlot, snapshotBoxTiles } from "./undo.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Fills an axis-aligned box with native fillBlocks calls. The prior region is
 * snapshotted into a grid of undo structures (each within the 64x384x64 size
 * limit) rather than read cell-by-cell, so a box edit stays cheap at any size.
 * @param {Player} player The player performing the edit.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {BlockPermutation} permutation The permutation to fill with.
 * @param {string|null} matchId Only fill cells of this block id (replace), or null for any.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string} label A short label for history and the completion message.
 * @returns {void}
 */
function runBoxEdit(player, dimension, min, max, permutation, matchId, includeAir, label) {
    setBusy(player.name, true);
    system.runJob(boxEditJob(dimension, min, max, permutation, matchId, includeAir, player.name, label));
}

/**
 * Generator that fills a box in ticking-area batches: each batch spans as many
 * chunks as the ticking budget allows (capped by config), gets ticked until
 * loaded, is filled in chunk-column slabs (each within the native fillBlocks
 * cap), then the area moves on to the next batch. Accumulates the changed
 * count into a one-element result array.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {BlockPermutation} permutation The permutation to fill with.
 * @param {object} blockFilter The prebuilt fillBlocks block filter.
 * @param {number[]} outChanged A one-element array receiving the changed count.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The chunked fill generator.
 */
function* fillBoxChunked(dimension, min, max, permutation, blockFilter, outChanged, playerName) {
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
            for (let x = areaMin.x; x <= areaMax.x; x = chunkFloor(x) + CHUNK) {
                for (let z = areaMin.z; z <= areaMax.z; z = chunkFloor(z) + CHUNK) {
                    for (let y = areaMin.y; y <= areaMax.y; y += WE_CONFIG.fillSlab) {
                        const subMin = { x, y, z };
                        const subMax = {
                            x: Math.min(chunkFloor(x) + CHUNK - 1, areaMax.x),
                            y: Math.min(y + WE_CONFIG.fillSlab - 1, areaMax.y),
                            z: Math.min(chunkFloor(z) + CHUNK - 1, areaMax.z)
                        };
                        const result = dimension.fillBlocks(new BlockVolume(subMin, subMax), permutation, { blockFilter });
                        changed += result.getCapacity();
                        yield;
                    }
                }
            }
        }
    }
    outChanged[0] = changed;
}

/**
 * Job backing runBoxEdit: tiles the snapshot, fills in ticked batches, and
 * records the undo edit.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {BlockPermutation} permutation The permutation to fill with.
 * @param {string|null} matchId Only fill cells of this block id, or null for any.
 * @param {boolean} includeAir When false, cells currently air are not filled.
 * @param {string} playerName The editing player's name.
 * @param {string} label A short label for the completion message.
 * @returns {Generator} The box edit job generator.
 */
function* boxEditJob(dimension, min, max, permutation, matchId, includeAir, playerName, label) {
    const blockFilter = blockFilterFor(matchId, includeAir);
    const slot = reserveBoxUndoSlot(playerName);
    const tiles = [];
    yield* snapshotBoxTiles(dimension, min, max, playerName, slot, tiles);
    const outChanged = [0];
    yield* fillBoxChunked(dimension, min, max, permutation, blockFilter, outChanged, playerName);
    releaseTickArea(playerName);
    pushUndo(playerName, {
        kind: "box",
        dimensionId: dimension.id,
        tiles,
        min: { x: min.x, y: min.y, z: min.z },
        max: { x: max.x, y: max.y, z: max.z },
        fill: { permutation, matchId, includeAir },
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
 * Job that re-applies a box edit's fill (redo) in ticked batches across ticks.
 * @param {Dimension} dimension The dimension to edit.
 * @param {object} record The box edit record.
 * @param {string} playerName The redoing player's name.
 * @returns {Generator} The box redo job generator.
 */
function* refillBoxJob(dimension, record, playerName) {
    const blockFilter = blockFilterFor(record.fill.matchId, record.fill.includeAir);
    const outChanged = [0];
    yield* fillBoxChunked(dimension, record.min, record.max, record.fill.permutation, blockFilter, outChanged, playerName);
    releaseTickArea(playerName);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aRedo: §f" + outChanged[0] + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

export { runBoxEdit, refillBoxJob };
