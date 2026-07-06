import { world, StructureSaveMode, Dimension } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { TILE, TILE_HEIGHT } from "./util.js";
import { tickAreaFor } from "./ticking.js";

const boxUndoCounters = new Map();
const boxUndoSlotTiles = new Map();

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Reserves the next rotating undo slot for a player, deleting any snapshot
 * structures left in that slot by a prior edit so the slot can be reused. Slots
 * wrap after undoSlots, keeping the world structure list bounded per player.
 * @param {string} playerName The player's name.
 * @returns {number} The reserved slot index.
 */
function reserveBoxUndoSlot(playerName) {
    const slot = (boxUndoCounters.get(playerName) ?? 0) % WE_CONFIG.undoSlots;
    boxUndoCounters.set(playerName, slot + 1);
    let bySlot = boxUndoSlotTiles.get(playerName);
    if (!bySlot) {
        bySlot = new Map();
        boxUndoSlotTiles.set(playerName, bySlot);
    }
    const prior = bySlot.get(slot);
    if (prior) {
        for (const id of prior) {
            world.structureManager.delete(id);
        }
    }
    bySlot.set(slot, []);
    return slot;
}

/**
 * Generator that snapshots a box into a grid of structures no larger than
 * 64x384x64 (the structure size limit), ticking each tile's chunks before the
 * snapshot and yielding between tiles to stay under the watchdog. Pushes the
 * created tile descriptors into the provided array.
 * @param {Dimension} dimension The dimension to snapshot.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @param {string} playerName The editing player's name.
 * @param {number} slot The reserved undo slot.
 * @param {object[]} tiles The array to fill with tile descriptors.
 * @returns {Generator} The snapshot job generator.
 */
function* snapshotBoxTiles(dimension, min, max, playerName, slot, tiles) {
    const ids = [];
    let index = 0;
    for (let tx = min.x; tx <= max.x; tx += TILE) {
        for (let tz = min.z; tz <= max.z; tz += TILE) {
            const tileMaxX = Math.min(tx + TILE - 1, max.x);
            const tileMaxZ = Math.min(tz + TILE - 1, max.z);
            const ok = yield* tickAreaFor(dimension, { x: tx, y: min.y, z: tz }, { x: tileMaxX, y: max.y, z: tileMaxZ }, playerName);
            for (let ty = min.y; ty <= max.y; ty += TILE_HEIGHT) {
                const tileMaxY = Math.min(ty + TILE_HEIGHT - 1, max.y);
                const id = "we:undo_" + playerName.toLowerCase() + "_" + slot + "_" + index;
                index += 1;
                if (!ok) {
                    continue;
                }
                world.structureManager.delete(id);
                world.structureManager.createFromWorld(id, dimension, { x: tx, y: ty, z: tz }, { x: tileMaxX, y: tileMaxY, z: tileMaxZ }, { saveMode: StructureSaveMode.World, includeEntities: false });
                tiles.push({ id, x: tx, y: ty, z: tz });
                ids.push(id);
                yield;
            }
        }
    }
    boxUndoSlotTiles.get(playerName).set(slot, ids);
}

/**
 * Deletes every world edit structure saved to the world and removes this pack's
 * ticking areas. Undo/clipboard structures are session-scoped, so any that
 * survive into a new world load are stale and safe to remove. Call once on
 * world load.
 * @returns {number} The number of structures deleted.
 */
function clearWorldEditStructures() {
    let count = 0;
    for (const id of world.structureManager.getWorldStructureIds()) {
        if (id.startsWith("we:")) {
            world.structureManager.delete(id);
            count += 1;
        }
    }
    world.tickingAreaManager.removeAllTickingAreas();
    boxUndoCounters.clear();
    boxUndoSlotTiles.clear();
    return count;
}

export { reserveBoxUndoSlot, snapshotBoxTiles, clearWorldEditStructures };
