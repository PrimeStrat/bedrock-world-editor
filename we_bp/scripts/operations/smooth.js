import { world, system, BlockPermutation, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { AIR_ID } from "./util.js";
import { tickAreaFor, releaseTickArea } from "./ticking.js";
import { runTrackedJob } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";

const CELLS_PER_YIELD = 2048;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Smooths the selection's surface by blurring its column height field and
 * rebuilding each column to the blurred height. The total block count is
 * preserved in stable mode; melt biases removal and grow biases addition.
 * @param {Player} player The acting player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {number} strength The blur radius in columns.
 * @param {string} mode The mass mode ("stable", "melt", or "grow").
 * @returns {void}
 */
function runSmooth(player, dimension, min, max, strength, mode) {
    setBusy(player.name, true);
    runTrackedJob(player.name, smoothJob(dimension, min, max, strength, mode, player.name));
}

/**
 * Reads the surface height of each column: the Y of its topmost non-air block,
 * or min.y - 1 when empty. Also records the surface block permutation so
 * rebuilt columns keep their material.
 * @param {Dimension} dimension The dimension to read.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {Generator} Yields periodically; returns {heights, surfaces} maps keyed x,z.
 */
function* scanColumns(dimension, min, max) {
    const heights = new Map();
    const surfaces = new Map();
    let processed = 0;
    for (let x = min.x; x <= max.x; x++) {
        for (let z = min.z; z <= max.z; z++) {
            const key = x + "," + z;
            let surface = min.y - 1;
            for (let y = max.y; y >= min.y; y--) {
                const block = dimension.getBlock({ x, y, z });
                processed += 1;
                if (processed % CELLS_PER_YIELD === 0) {
                    yield;
                }
                if (block && block.typeId !== AIR_ID) {
                    surface = y;
                    surfaces.set(key, block.permutation);
                    break;
                }
            }
            heights.set(key, surface);
        }
    }
    return { heights, surfaces };
}

/**
 * Generator backing runSmooth: scans heights, blurs them with a box kernel of
 * the given radius, biases the total by the mode, then rebuilds columns.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {number} strength The blur radius in columns.
 * @param {string} mode The mass mode.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The smooth job generator.
 */
function* smoothJob(dimension, min, max, strength, mode, playerName) {
    const sweep = fallingBlockSweeper(dimension, min, max);
    const air = BlockPermutation.resolve(AIR_ID);
    const ok = yield* tickAreaFor(dimension, min, max, playerName);
    if (!ok) {
        releaseTickArea(playerName);
        const acting = world.getAllPlayers().find((p) => p.name === playerName);
        if (acting) {
            acting.sendMessage("§cSmooth area could not be loaded - run /we:debug.");
        }
        setBusy(playerName, false);
        return;
    }
    const { heights, surfaces } = yield* scanColumns(dimension, min, max);
    const radius = Math.max(1, Math.floor(strength));
    const blurred = new Map();
    for (let x = min.x; x <= max.x; x++) {
        for (let z = min.z; z <= max.z; z++) {
            let sum = 0;
            let count = 0;
            for (let ox = -radius; ox <= radius; ox++) {
                for (let oz = -radius; oz <= radius; oz++) {
                    const h = heights.get((x + ox) + "," + (z + oz));
                    if (h !== undefined) {
                        sum += h;
                        count += 1;
                    }
                }
            }
            let target = sum / count;
            if (mode === "melt") {
                target -= 0.5;
            } else if (mode === "grow") {
                target += 0.5;
            }
            blurred.set(x + "," + z, Math.round(Math.max(min.y - 1, Math.min(max.y, target))));
        }
    }
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label: "Smooth", blocks: 0, tick: system.currentTick };
    pushUndo(playerName, record);
    let processed = 0;
    for (let x = min.x; x <= max.x; x++) {
        for (let z = min.z; z <= max.z; z++) {
            const key = x + "," + z;
            const surface = heights.get(key);
            const target = blurred.get(key);
            const fill = surfaces.get(key) ?? BlockPermutation.resolve("minecraft:grass_block");
            if (target > surface) {
                for (let y = surface + 1; y <= target; y++) {
                    yield* writeCell(dimension, { x, y, z }, fill, changes);
                    processed += 1;
                    if (processed % 256 === 0) {
                        sweep(false);
                        yield;
                    }
                }
            } else if (target < surface) {
                for (let y = surface; y > target; y--) {
                    yield* writeCell(dimension, { x, y, z }, air, changes);
                    processed += 1;
                    if (processed % 256 === 0) {
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
        player.sendMessage("§aSmooth: §f" + changes.length + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

/**
 * Sets a cell to a permutation, recording the change when it differs.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} loc The cell location.
 * @param {BlockPermutation} permutation The permutation to set.
 * @param {object[]} changes The change accumulator.
 * @returns {Generator} A no-yield generator.
 */
function* writeCell(dimension, loc, permutation, changes) {
    const block = dimension.getBlock(loc);
    if (!block || block.typeId === permutation.type.id) {
        return;
    }
    const before = block.permutation;
    dimension.setBlockPermutation(loc, permutation);
    changes.push({ location: loc, before, after: permutation });
}

export { runSmooth };
