import { world, system, BlockPermutation, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo } from "../session.js";
import { AIR_ID } from "./util.js";
import { runTrackedJob } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Deterministic hash noise in [0, 1] for a horizontal cell, used by the
 * roughen and distort terrain modes so a stroke is stable across ticks.
 * @param {number} x The cell X.
 * @param {number} z The cell Z.
 * @returns {number} A value in [0, 1).
 */
function surfaceNoise(x, z) {
    let h = (x * 374761393) ^ (z * 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
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

/**
 * Applies a terrain sculpt brush around a target: raises, lowers, flattens, or
 * smooths the surface columns within a radius, shaped by a cosine falloff so
 * the center changes most and the edge tapers to zero. Reads the current
 * surface each call, so repeated applications stack seamlessly. Runs
 * immediately since the target sits in loaded chunks.
 * @param {Player} player The acting player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} center The brush center block location.
 * @param {number} radius The brush radius.
 * @param {number} strength The peak blocks added or removed at the center.
 * @param {string} mode The mode ("raise", "lower", "flatten", or "smooth").
 * @returns {void}
 */
function runTerrainBrush(player, dimension, center, radius, strength, mode) {
    runTrackedJob(player.name, terrainBrushJob(dimension, center, radius, strength, mode, player.name));
}

/**
 * Generator backing runTerrainBrush: reads each column's surface, computes a
 * falloff-weighted target height, then adds or removes blocks to match.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} center The brush center.
 * @param {number} radius The brush radius.
 * @param {number} strength The peak change at the center.
 * @param {string} mode The mode.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The terrain brush job generator.
 */
function* terrainBrushJob(dimension, center, radius, strength, mode, playerName) {
    const air = BlockPermutation.resolve(AIR_ID);
    const reach = Math.ceil(radius);
    const lift = Math.ceil(strength);
    const sweep = fallingBlockSweeper(dimension, { x: center.x - reach, y: center.y - reach - lift, z: center.z - reach }, { x: center.x + reach, y: center.y + reach + lift, z: center.z + reach });
    const range = dimension.heightRange;
    const heights = new Map();
    const scanTop = center.y + reach + lift + 1;
    const scanBottom = center.y - reach - lift - 1;
    for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
            const x = center.x + dx;
            const z = center.z + dz;
            let surface = range.min - 1;
            for (let y = Math.min(scanTop, range.max - 1); y >= Math.max(scanBottom, range.min); y--) {
                const block = dimension.isChunkLoaded({ x, y, z }) ? dimension.getBlock({ x, y, z }) : undefined;
                if (block && !block.isAir) {
                    surface = y;
                    break;
                }
            }
            heights.set(x + "," + z, surface);
        }
    }
    let average = 0;
    if (mode === "flatten" || mode === "smooth") {
        let sum = 0;
        for (const h of heights.values()) {
            sum += h;
        }
        average = sum / heights.size;
    }
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label: "Terrain " + mode, blocks: 0, tick: system.currentTick };
    pushUndo(playerName, record);
    const r2 = (radius + 0.5) * (radius + 0.5);
    let processed = 0;
    for (let dx = -reach; dx <= reach; dx++) {
        for (let dz = -reach; dz <= reach; dz++) {
            const d2 = dx * dx + dz * dz;
            if (d2 > r2) {
                continue;
            }
            const x = center.x + dx;
            const z = center.z + dz;
            const key = x + "," + z;
            const surface = heights.get(key);
            const falloff = 0.5 + 0.5 * Math.cos(Math.PI * Math.sqrt(d2) / (radius + 0.5));
            let target = surface;
            if (mode === "raise" || mode === "extrude") {
                target = surface + Math.round(strength * falloff);
            } else if (mode === "lower") {
                target = surface - Math.round(strength * falloff);
            } else if (mode === "flatten") {
                target = Math.round(surface + (average - surface) * falloff);
            } else if (mode === "roughen") {
                const jitter = (surfaceNoise(x, z) * 2 - 1) * strength;
                target = surface + Math.round(jitter * falloff);
            } else if (mode === "distort") {
                const sx = x + Math.round((surfaceNoise(x + 13, z) * 2 - 1) * strength * falloff);
                const sz = z + Math.round((surfaceNoise(x, z + 47) * 2 - 1) * strength * falloff);
                const displaced = heights.get(sx + "," + sz);
                target = displaced !== undefined ? displaced : surface;
            } else {
                let sum = 0;
                let count = 0;
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oz = -1; oz <= 1; oz++) {
                        const h = heights.get((x + ox) + "," + (z + oz));
                        if (h !== undefined) {
                            sum += h;
                            count += 1;
                        }
                    }
                }
                target = Math.round(surface + (sum / count - surface) * falloff);
            }
            target = Math.max(range.min - 1, Math.min(range.max - 1, target));
            const fill = surface >= range.min ? dimension.getBlock({ x, y: surface, z })?.permutation ?? BlockPermutation.resolve("minecraft:grass_block") : BlockPermutation.resolve("minecraft:grass_block");
            if (target > surface) {
                for (let y = surface + 1; y <= target; y++) {
                    yield* setCell(dimension, { x, y, z }, fill, changes);
                    processed += 1;
                    if (processed % 256 === 0) {
                        sweep(false);
                        yield;
                    }
                }
            } else if (target < surface) {
                for (let y = surface; y > target; y--) {
                    yield* setCell(dimension, { x, y, z }, air, changes);
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
    record.blocks = changes.length;
    if (changes.length === 0) {
        discardUndo(playerName, record);
    }
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.onScreenDisplay.setActionBar("§aTerrain " + mode + ": §f" + changes.length + "§a block(s)");
    }
}

export { runTerrainBrush };
