import { world, system, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { AIR_ID, chunkFloor, pickPatternPermutation } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";
import { runTrackedJob, chainJobs } from "./jobs.js";
import { mirrorBoxFor } from "../actions/symmetry.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Places one block on top of the topmost non-air block of every column in the
 * selection, recording a per-block undoable edit.
 * @param {Player} player The player overlaying.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {FillPattern} pattern The fill pattern to place from.
 * @returns {void}
 */
function runOverlay(player, dimension, min, max, pattern) {
    setBusy(player.name, true);
    const mirror = mirrorBoxFor(player.name, dimension.id, min, max);
    if (mirror) {
        runTrackedJob(player.name, chainJobs(
            overlayJob(dimension, min, max, pattern, player.name),
            overlayJob(dimension, mirror.min, mirror.max, pattern, player.name)
        ));
        return;
    }
    runTrackedJob(player.name, overlayJob(dimension, min, max, pattern, player.name));
}

/**
 * Generator backing runOverlay: per ticked batch, scans each column downward
 * for the first non-air block and sets the block above it.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {FillPattern} pattern The fill pattern to place from.
 * @param {string} playerName The editing player's name.
 * @returns {Generator} The overlay job generator.
 */
function* overlayJob(dimension, min, max, pattern, playerName) {
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label: "Overlay §b" + pattern.label, blocks: 0, tick: system.currentTick };
    pushUndo(playerName, record);
    let processed = 0;
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
                    for (let y = areaMax.y; y >= areaMin.y; y--) {
                        const block = dimension.getBlock({ x, y, z });
                        processed += 1;
                        if (processed % WE_CONFIG.blocksPerYield === 0) {
                            yield;
                        }
                        if (!block || block.typeId === AIR_ID) {
                            continue;
                        }
                        const above = dimension.getBlock({ x, y: y + 1, z });
                        if (above && above.typeId === AIR_ID) {
                            const before = above.permutation;
                            const placed = pickPatternPermutation(pattern);
                            dimension.setBlockPermutation({ x, y: y + 1, z }, placed);
                            changes.push({ location: { x, y: y + 1, z }, before, after: placed });
                        }
                        break;
                    }
                }
            }
        }
    }
    releaseTickArea(playerName);
    record.blocks = changes.length;
    if (changes.length === 0) {
        discardUndo(playerName, record);
    }
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aOverlay: §f" + changes.length + "§a block(s) placed.");
    }
    setBusy(playerName, false);
}

export { runOverlay };
