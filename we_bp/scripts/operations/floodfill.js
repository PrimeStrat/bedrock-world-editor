import { world, system, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo, setBusy } from "../session.js";
import { AIR_ID, pickPatternPermutation } from "./util.js";
import { runTrackedJob } from "./jobs.js";
import { fallingBlockSweeper } from "./protect.js";
import { maskAllows } from "../actions/mask.js";

const FLOOD_CELLS_PER_YIELD = 512;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 * @typedef {{horizontal: boolean, up: boolean, down: boolean, corners: boolean}} FloodOptions
 */

/**
 * Returns the neighbor offsets a flood may spread along, given the spread
 * options. Horizontal enables the four side directions; up and down enable the
 * vertical ones; corners (with horizontal) adds the four diagonal sides.
 * @param {FloodOptions} options The spread options.
 * @returns {Vec3[]} The neighbor offsets.
 */
function floodOffsets(options) {
    const offs = [];
    if (options.horizontal) {
        offs.push({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 });
        if (options.corners) {
            offs.push({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 }, { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 });
        }
    }
    if (options.up) {
        offs.push({ x: 0, y: 1, z: 0 });
    }
    if (options.down) {
        offs.push({ x: 0, y: -1, z: 0 });
    }
    return offs;
}

/**
 * Flood fills outward from a starting cell, replacing connected cells that
 * match the start cell's block (or air) with a fill pattern, up to a block
 * limit. Spread directions are gated by the options. Records a per-block
 * undoable edit.
 * @param {Player} player The acting player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} start The starting cell (the crosshair block).
 * @param {FillPattern} pattern The fill pattern.
 * @param {number} limit The maximum blocks to place.
 * @param {FloodOptions} options The spread options.
 * @returns {void}
 */
function runFloodFill(player, dimension, start, pattern, limit, options) {
    setBusy(player.name, true);
    runTrackedJob(player.name, floodFillJob(dimension, start, pattern, limit, options, player.name));
}

/**
 * Generator backing runFloodFill: a breadth-first flood from the start cell
 * through matching neighbors, bounded by the block limit and the world height.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} start The starting cell.
 * @param {FillPattern} pattern The fill pattern.
 * @param {number} limit The maximum blocks to place.
 * @param {FloodOptions} options The spread options.
 * @param {string} playerName The acting player's name.
 * @returns {Generator} The flood fill job generator.
 */
function* floodFillJob(dimension, start, pattern, limit, options, playerName) {
    const range = dimension.heightRange;
    const startBlock = dimension.getBlock(start);
    if (!startBlock) {
        setBusy(playerName, false);
        return;
    }
    const matchId = startBlock.typeId;
    const offsets = floodOffsets(options);
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label: "Flood §b" + pattern.label, blocks: 0, tick: system.currentTick };
    pushUndo(playerName, record);
    const sweep = fallingBlockSweeper(dimension, { x: start.x - 64, y: range.min, z: start.z - 64 }, { x: start.x + 64, y: range.max, z: start.z + 64 });
    const seen = new Set();
    const queue = [start];
    seen.add(start.x + "," + start.y + "," + start.z);
    let processed = 0;
    while (queue.length > 0 && changes.length < limit) {
        const cell = queue.shift();
        if (cell.y < range.min || cell.y > range.max - 1) {
            continue;
        }
        const block = dimension.isChunkLoaded(cell) ? dimension.getBlock(cell) : undefined;
        if (!block || block.typeId !== matchId || !maskAllows(playerName, block.typeId)) {
            continue;
        }
        const placed = pickPatternPermutation(pattern, cell);
        if (block.typeId !== placed.type.id) {
            const before = block.permutation;
            dimension.setBlockPermutation(cell, placed);
            changes.push({ location: { x: cell.x, y: cell.y, z: cell.z }, before, after: placed });
        }
        for (const off of offsets) {
            const n = { x: cell.x + off.x, y: cell.y + off.y, z: cell.z + off.z };
            const key = n.x + "," + n.y + "," + n.z;
            if (!seen.has(key)) {
                seen.add(key);
                queue.push(n);
            }
        }
        processed += 1;
        if (processed % FLOOD_CELLS_PER_YIELD === 0) {
            sweep(false);
            yield;
        }
    }
    sweep(true);
    record.blocks = changes.length;
    if (changes.length === 0) {
        discardUndo(playerName, record);
    }
    setBusy(playerName, false);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        const capped = changes.length >= limit ? " §7(limit reached)" : "";
        player.sendMessage("§aFlood fill: §f" + changes.length + "§a block(s)" + capped + ".");
    }
}

export { runFloodFill };
