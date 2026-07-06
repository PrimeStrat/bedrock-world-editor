import { world, system, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo, setBusy } from "../session.js";
import { chunkFloor, boxVolume, clampToHeight, pickPatternPermutation } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan, areaFullyLoaded } from "./ticking.js";
import { runTrackedJob } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";
import { debugStart, debugProgress, debugEnd, debugSkipped } from "./debug.js";

const GEN_CELLS_PER_YIELD = 256;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 * @typedef {function(number, number, number): number} Evaluator
 */

/**
 * Fills every selection cell where a compiled expression of the normalized
 * coordinates (each axis mapped to -1..1) is nonzero, recording a per-block
 * undoable edit.
 * @param {Player} player The player generating.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {Evaluator} evaluate The compiled expression.
 * @param {FillPattern} pattern The fill pattern.
 * @param {string} label The history label.
 * @returns {void}
 */
function runGenerate(player, dimension, min, max, evaluate, pattern, label) {
    const box = clampToHeight(dimension, min, max);
    const useBusy = !areaFullyLoaded(dimension, box.min, box.max);
    if (useBusy) {
        setBusy(player.name, true);
    }
    runTrackedJob(player.name, generateJob(dimension, box.min, box.max, evaluate, pattern, player.name, label, useBusy));
}

/**
 * Generator backing runGenerate: evaluates the expression per cell in ticked
 * batches and sets matching cells from the pattern.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {Evaluator} evaluate The compiled expression.
 * @param {FillPattern} pattern The fill pattern.
 * @param {string} playerName The generating player's name.
 * @param {string} label The history label.
 * @param {boolean} useBusy Whether this job holds the busy flag.
 * @returns {Generator} The generate job generator.
 */
function* generateJob(dimension, min, max, evaluate, pattern, playerName, label, useBusy) {
    debugStart(playerName, label);
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    const hx = (max.x - min.x) / 2 || 1;
    const hy = (max.y - min.y) / 2 || 1;
    const hz = (max.z - min.z) / 2 || 1;
    const total = boxVolume(min, max);
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label, blocks: total, tick: system.currentTick };
    pushUndo(playerName, record);
    const sweep = fallingBlockSweeper(dimension, min, max);
    let sinceYield = 0;
    const span = pickAreaSpan();
    for (let ax = chunkFloor(min.x); ax <= max.x; ax += span) {
        for (let az = chunkFloor(min.z); az <= max.z; az += span) {
            const areaMin = { x: Math.max(ax, min.x), y: min.y, z: Math.max(az, min.z) };
            const areaMax = { x: Math.min(ax + span - 1, max.x), y: max.y, z: Math.min(az + span - 1, max.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            if (!ok) {
                continue;
            }
            for (let x = areaMin.x; x <= areaMax.x; x++) {
                for (let z = areaMin.z; z <= areaMax.z; z++) {
                    for (let y = areaMin.y; y <= areaMax.y; y++) {
                        sinceYield += 1;
                        if (sinceYield >= GEN_CELLS_PER_YIELD) {
                            sinceYield = 0;
                            debugProgress(playerName, changes.length);
                            sweep(false);
                            yield;
                        }
                        const value = evaluate((x - cx) / hx, (y - cy) / hy, (z - cz) / hz);
                        if (!value) {
                            continue;
                        }
                        const loc = { x, y, z };
                        const block = dimension.getBlock(loc);
                        if (!block) {
                            continue;
                        }
                        const before = block.permutation;
                        const placed = pickPatternPermutation(pattern);
                        if (block.typeId === placed.type.id) {
                            continue;
                        }
                        dimension.setBlockPermutation(loc, placed);
                        changes.push({ location: loc, before, after: placed });
                    }
                }
            }
            sweep(false);
        }
    }
    sweep(true);
    releaseTickArea(playerName);
    if (changes.length === 0) {
        discardUndo(playerName, record);
    }
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

export { runGenerate };
