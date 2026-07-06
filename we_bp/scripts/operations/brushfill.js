import { world, system, Dimension, Player } from "@minecraft/server";
import { pushUndo, discardUndo } from "../session.js";
import { AIR_ID, pickPatternPermutation } from "./util.js";
import { runTrackedJob } from "./jobs.js";

const BRUSH_CELLS_PER_YIELD = 512;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Applies a small brush shape immediately, without the busy guard or ticking
 * areas: brush targets sit in loaded chunks (the raycast hit one) and strokes
 * are small enough to overlap safely. Each stroke records a per-block undo.
 * @param {Player} player The brushing player.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Iterable<Run>} runs The shape runs.
 * @param {FillPattern} pattern The fill pattern.
 * @param {boolean} includeAir When false, air cells are not filled.
 * @param {string} label The history label.
 * @returns {void}
 */
function runBrushFill(player, dimension, runs, pattern, includeAir, label) {
    runTrackedJob(player.name, brushFillJob(dimension, Array.from(runs), pattern, includeAir, player.name, label));
}

/**
 * Generator backing runBrushFill: sets each run cell that is loaded and
 * passes the air filter, then records the stroke and shows an action-bar
 * result.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Run[]} runs The shape runs.
 * @param {FillPattern} pattern The fill pattern.
 * @param {boolean} includeAir When false, air cells are not filled.
 * @param {string} playerName The brushing player's name.
 * @param {string} label The history label.
 * @returns {Generator} The brush fill job generator.
 */
function* brushFillJob(dimension, runs, pattern, includeAir, playerName, label) {
    const range = dimension.heightRange;
    const total = runs.reduce((sum, run) => sum + run.length, 0);
    const changes = [];
    const record = { dimensionId: dimension.id, changes, label, blocks: total, tick: system.currentTick };
    pushUndo(playerName, record);
    let processed = 0;
    for (const run of runs) {
        if (run.y < range.min || run.y > range.max - 1) {
            continue;
        }
        for (let x = run.x; x < run.x + run.length; x++) {
            const loc = { x, y: run.y, z: run.z };
            const block = dimension.isChunkLoaded(loc) ? dimension.getBlock(loc) : undefined;
            processed += 1;
            if (processed % BRUSH_CELLS_PER_YIELD === 0) {
                yield;
            }
            if (!block || (!includeAir && block.typeId === AIR_ID)) {
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
    if (changes.length === 0) {
        discardUndo(playerName, record);
    }
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.onScreenDisplay.setActionBar("§a" + label + "§a: §f" + total + "§a block(s) set");
    }
}

export { runBrushFill };
