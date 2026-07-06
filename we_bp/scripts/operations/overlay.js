import { world, system, BlockPermutation, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { AIR_ID, chunkFloor } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Places one block on top of the topmost non-air block of every column in the
 * selection, recording a per-block undoable edit.
 * @param {Player} player The player overlaying.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {BlockPermutation} permutation The permutation to place.
 * @returns {void}
 */
function runOverlay(player, dimension, min, max, permutation) {
    setBusy(player.name, true);
    system.runJob(overlayJob(dimension, min, max, permutation, player.name));
}

/**
 * Generator backing runOverlay: per ticked batch, scans each column downward
 * for the first non-air block and sets the block above it.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {BlockPermutation} permutation The permutation to place.
 * @param {string} playerName The editing player's name.
 * @returns {Generator} The overlay job generator.
 */
function* overlayJob(dimension, min, max, permutation, playerName) {
    const changes = [];
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
                            dimension.setBlockPermutation({ x, y: y + 1, z }, permutation);
                            changes.push({ location: { x, y: y + 1, z }, before, after: permutation });
                        }
                        break;
                    }
                }
            }
        }
    }
    releaseTickArea(playerName);
    if (changes.length > 0) {
        pushUndo(playerName, { dimensionId: dimension.id, changes, label: "Overlay", blocks: changes.length, tick: system.currentTick });
    }
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aOverlay: §f" + changes.length + "§a block(s) placed.");
    }
    setBusy(playerName, false);
}

export { runOverlay };
