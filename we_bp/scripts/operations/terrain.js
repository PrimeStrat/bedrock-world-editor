import { world, system, BlockPermutation, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { AIR_ID } from "./util.js";
import { tickAreaFor, releaseTickArea } from "./ticking.js";
import { runTrackedJob } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Runs a terrain operation over the selection surface: raise or lower by an
 * amount, set to a fixed level, or flatten to the average height. Records a
 * per-block undoable edit.
 * @param {Player} player The acting player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} op The operation ("raise", "lower", "set", or "flatten").
 * @param {number} amount The shift amount or target level.
 * @returns {void}
 */
function runTerrain(player, dimension, min, max, op, amount) {
    setBusy(player.name, true);
    runTrackedJob(player.name, terrainJob(dimension, min, max, op, amount, player.name));
}

/**
 * Scans the surface height of every column: the Y of the topmost non-air
 * block, or min.y - 1 when the column is empty.
 * @param {Dimension} dimension The dimension to read.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {Generator} Yields periodically; returns a height map keyed x,z.
 */
function* scanHeights(dimension, min, max) {
    const heights = new Map();
    let processed = 0;
    for (let x = min.x; x <= max.x; x++) {
        for (let z = min.z; z <= max.z; z++) {
            let surface = min.y - 1;
            for (let y = max.y; y >= min.y; y--) {
                const block = dimension.getBlock({ x, y, z });
                processed += 1;
                if (processed % WE_CONFIG.blocksPerYield === 0) {
                    yield;
                }
                if (block && block.typeId !== AIR_ID) {
                    surface = y;
                    break;
                }
            }
            heights.set(x + "," + z, surface);
        }
    }
    return heights;
}

/**
 * Generator backing runTerrain: scans surface heights, computes each column's
 * target height, then adds or removes blocks to match, cloning the surface
 * block for added cells.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} op The operation.
 * @param {number} amount The shift amount or target level.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The terrain job generator.
 */
function* terrainJob(dimension, min, max, op, amount, playerName) {
    const air = BlockPermutation.resolve(AIR_ID);
    const sweep = fallingBlockSweeper(dimension, min, max);
    const ok = yield* tickAreaFor(dimension, min, max, playerName);
    if (!ok) {
        releaseTickArea(playerName);
        const acting = world.getAllPlayers().find((p) => p.name === playerName);
        if (acting) {
            acting.sendMessage("§cTerrain area could not be loaded - run /we:debug.");
        }
        setBusy(playerName, false);
        return;
    }
    const heights = yield* scanHeights(dimension, min, max);
    let average = 0;
    if (op === "flatten") {
        let sum = 0;
        for (const h of heights.values()) {
            sum += h;
        }
        average = Math.round(sum / heights.size);
    }
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label: "Terrain " + op, blocks: 0, tick: system.currentTick };
    pushUndo(playerName, record);
    let processed = 0;
    for (let x = min.x; x <= max.x; x++) {
        for (let z = min.z; z <= max.z; z++) {
            const key = x + "," + z;
            const surface = heights.get(key);
            let target;
            if (op === "raise") {
                target = surface + amount;
            } else if (op === "lower") {
                target = surface - amount;
            } else if (op === "flatten") {
                target = average;
            } else {
                target = amount;
            }
            target = Math.max(min.y - 1, Math.min(max.y, target));
            const surfacePerm = surface >= min.y ? dimension.getBlock({ x, y: surface, z })?.permutation : null;
            const fillPerm = surfacePerm ?? BlockPermutation.resolve("minecraft:grass_block");
            if (target > surface) {
                for (let y = surface + 1; y <= target; y++) {
                    yield* setCell(dimension, { x, y, z }, fillPerm, changes);
                    processed += 1;
                    if (processed % WE_CONFIG.blocksPerYield === 0) {
                        sweep(false);
                        yield;
                    }
                }
            } else if (target < surface) {
                for (let y = surface; y > target; y--) {
                    yield* setCell(dimension, { x, y, z }, air, changes);
                    processed += 1;
                    if (processed % WE_CONFIG.blocksPerYield === 0) {
                        sweep(false);
                        yield;
                    }
                }
            }
        }
    }
    sweep(true);
    releaseTickArea(playerName);
    record.blocks = changes.length;
    if (changes.length === 0) {
        discardUndo(playerName, record);
    }
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§aTerrain " + op + ": §f" + changes.length + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

/**
 * Sets a single cell to a permutation and records the change when it differs.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} loc The cell location.
 * @param {BlockPermutation} permutation The permutation to set.
 * @param {object[]} changes The change accumulator.
 * @returns {Generator} A no-yield generator for compositional use.
 */
function* setCell(dimension, loc, permutation, changes) {
    const block = dimension.getBlock(loc);
    if (!block || block.typeId === permutation.type.id) {
        return;
    }
    const before = block.permutation;
    dimension.setBlockPermutation(loc, permutation);
    changes.push({ location: loc, before, after: permutation });
}

export { runTerrain };
