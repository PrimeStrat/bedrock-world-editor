import { world, system, Dimension } from "@minecraft/server";

const SWEEP_INTERVAL_TICKS = 5;

let activeEdits = 0;
let savedTileDrops = true;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Marks an edit job as running, disabling the tile drops gamerule while any
 * edit is active.
 * @returns {void}
 */
function beginEditProtection() {
    if (activeEdits === 0) {
        savedTileDrops = world.gameRules.doTileDrops;
        world.gameRules.doTileDrops = false;
    }
    activeEdits += 1;
}

/**
 * Marks an edit job as finished, restoring the tile drops gamerule once no
 * edits remain.
 * @returns {void}
 */
function endEditProtection() {
    activeEdits = Math.max(0, activeEdits - 1);
    if (activeEdits === 0) {
        world.gameRules.doTileDrops = savedTileDrops;
    }
}

/**
 * Removes every falling block entity inside a box.
 * @param {Dimension} dimension The dimension to sweep.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {void}
 */
function killFallingBlocks(dimension, min, max) {
    for (const entity of dimension.getEntities({ type: "minecraft:falling_block" })) {
        const loc = entity.location;
        if (loc.x >= min.x && loc.x <= max.x + 1 && loc.y >= min.y && loc.y <= max.y + 1 && loc.z >= min.z && loc.z <= max.z + 1) {
            entity.remove();
        }
    }
}

/**
 * Creates a periodic falling-block sweeper for an edit box. The returned
 * function removes falling blocks inside the box, extended down to the world
 * floor since they only fall, at most once per interval unless forced.
 * @param {Dimension} dimension The dimension to sweep.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {function(boolean): void} The sweep function; pass true to force.
 */
function fallingBlockSweeper(dimension, min, max) {
    const floor = { x: min.x, y: dimension.heightRange.min, z: min.z };
    let lastTick = -SWEEP_INTERVAL_TICKS;
    return (force) => {
        const now = system.currentTick;
        if (!force && now - lastTick < SWEEP_INTERVAL_TICKS) {
            return;
        }
        lastTick = now;
        killFallingBlocks(dimension, floor, max);
    };
}

export { beginEditProtection, endEditProtection, killFallingBlocks, fallingBlockSweeper };
