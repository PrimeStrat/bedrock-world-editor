import { world, system, Dimension, Player } from "@minecraft/server";
import { pushUndo, setBusy } from "../session.js";
import { WE_CONFIG } from "../config.js";
import { AIR_ID } from "./util.js";
import { tickAreaFor, releaseTickArea } from "./ticking.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Snapshots a box, runs a placement callback that fills it, then records the
 * before/after permutations of the whole box as a single undoable edit. Used by
 * paste, where blocks are written by structure placement rather than per-block.
 * @param {Player} player The player performing the paste.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive min corner of the affected box.
 * @param {Vec3} max The inclusive max corner of the affected box.
 * @param {function():void} placeFn Places the structures into the box.
 * @param {string} label A short label for history and the completion message.
 * @param {boolean} skipAir When true, cells the paste left as air are reverted
 *   to the original block instead of overwriting it.
 * @returns {void}
 */
function pasteRegion(player, dimension, min, max, placeFn, label, skipAir) {
    setBusy(player.name, true);
    system.runJob(pasteJob(dimension, min, max, placeFn, player.name, label, skipAir));
}

/**
 * Generator backing pasteRegion: ticks the paste region, captures
 * before-permutations, places, then captures after-permutations, batching to
 * stay under the watchdog.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive min corner.
 * @param {Vec3} max The inclusive max corner.
 * @param {function():void} placeFn Places the structures into the box.
 * @param {string} playerName The pasting player's name.
 * @param {string} label A short label for the completion message.
 * @param {boolean} skipAir When true, cells left as air are reverted.
 * @returns {Generator} The paste job generator.
 */
function* pasteJob(dimension, min, max, placeFn, playerName, label, skipAir) {
    yield* tickAreaFor(dimension, min, max, playerName);
    const before = new Map();
    let processed = 0;
    for (let x = min.x; x <= max.x; x++) {
        for (let y = min.y; y <= max.y; y++) {
            for (let z = min.z; z <= max.z; z++) {
                const block = dimension.getBlock({ x, y, z });
                if (block) {
                    before.set(x + "," + y + "," + z, block.permutation);
                }
                processed += 1;
                if (processed % WE_CONFIG.blocksPerYield === 0) {
                    yield;
                }
            }
        }
    }
    placeFn();
    yield;
    const changes = [];
    for (const [key, beforePerm] of before.entries()) {
        const [x, y, z] = key.split(",").map(Number);
        const block = dimension.getBlock({ x, y, z });
        if (block && block.permutation !== beforePerm) {
            if (skipAir && block.permutation.type.id === AIR_ID) {
                dimension.setBlockPermutation({ x, y, z }, beforePerm);
            } else {
                changes.push({ location: { x, y, z }, before: beforePerm, after: block.permutation });
            }
        }
        processed += 1;
        if (processed % WE_CONFIG.blocksPerYield === 0) {
            yield;
        }
    }
    releaseTickArea(playerName);
    if (changes.length > 0) {
        pushUndo(playerName, { dimensionId: dimension.id, changes, label, blocks: changes.length, tick: system.currentTick });
    }
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.sendMessage("§a" + label + ": §f" + changes.length + "§a block(s) changed.");
    }
    setBusy(playerName, false);
}

export { pasteRegion };
