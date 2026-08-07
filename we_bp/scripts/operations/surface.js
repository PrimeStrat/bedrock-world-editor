import { world, system, BlockPermutation, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { AIR_ID, chunkFloor } from "./util.js";
import { tickAreaFor, releaseTickArea, pickAreaSpan } from "./ticking.js";
import { runTrackedJob } from "./jobs.js";
import { maskAllows } from "../actions/mask.js";

const NON_SURFACE = new Set([
    AIR_ID, "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava",
    "minecraft:short_grass", "minecraft:grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern",
    "minecraft:snow_layer", "minecraft:snow", "minecraft:leaves", "minecraft:leaves2"
]);

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {(dimension: Dimension, x: number, surfaceY: number, z: number, surfaceId: string, changes: object[]) => void} SurfaceApply
 */

/**
 * Runs a per-column surface operation across a box: for each column it finds
 * the highest solid, mask-passing surface block and calls apply with it. Used
 * for naturalize, green, snow, and flora, which all act on the surface layer.
 * @param {Player} player The acting player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {SurfaceApply} apply The per-column callback.
 * @param {string} label The history and completion label.
 * @param {function(number, number, number): boolean|null} mask The polygon cell mask, or null.
 * @returns {void}
 */
function runSurfaceOp(player, dimension, min, max, apply, label, mask) {
    setBusy(player.name, true);
    runTrackedJob(player.name, surfaceJob(dimension, min, max, apply, label, mask ?? null, player.name));
}

/**
 * Generator backing runSurfaceOp: scans each column top-down for its surface
 * block and applies the callback, batching to stay under the watchdog.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {SurfaceApply} apply The per-column callback.
 * @param {string} label The history and completion label.
 * @param {function(number, number, number): boolean|null} mask The polygon cell mask, or null.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The surface job generator.
 */
function* surfaceJob(dimension, min, max, apply, label, mask, playerName) {
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label, blocks: 0, tick: system.currentTick };
    pushUndo(playerName, record);
    let processed = 0;
    const span = pickAreaSpan();
    for (let ax = chunkFloor(min.x); ax <= max.x; ax += span) {
        for (let az = chunkFloor(min.z); az <= max.z; az += span) {
            const areaMin = { x: Math.max(ax, min.x), y: min.y, z: Math.max(az, min.z) };
            const areaMax = { x: Math.min(ax + span - 1, max.x), y: max.y, z: Math.min(az + span - 1, max.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            if (!ok) {
                yield;
                continue;
            }
            for (let x = areaMin.x; x <= areaMax.x; x++) {
                for (let z = areaMin.z; z <= areaMax.z; z++) {
                    if (mask && !mask(x, min.y, z)) {
                        continue;
                    }
                    for (let y = areaMax.y; y >= areaMin.y; y--) {
                        const block = dimension.getBlock({ x, y, z });
                        processed += 1;
                        if (processed % WE_CONFIG.blocksPerYield === 0) {
                            yield;
                        }
                        if (!block || NON_SURFACE.has(block.typeId)) {
                            continue;
                        }
                        if (maskAllows(playerName, block.typeId)) {
                            apply(dimension, x, y, z, block.typeId, changes);
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
        player.sendMessage("§a" + label + ": §f" + changes.length + "§a block(s).");
    }
    setBusy(playerName, false);
}

/**
 * Sets a cell to a permutation and records the change when it differs.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} loc The cell location.
 * @param {BlockPermutation} permutation The permutation to set.
 * @param {object[]} changes The change accumulator.
 * @returns {void}
 */
function setSurfaceCell(dimension, loc, permutation, changes) {
    const block = dimension.getBlock(loc);
    if (!block || block.typeId === permutation.type.id) {
        return;
    }
    changes.push({ location: { x: loc.x, y: loc.y, z: loc.z }, before: block.permutation, after: permutation });
    dimension.setBlockPermutation(loc, permutation);
}

export { runSurfaceOp, setSurfaceCell };
