import { world, system, StructureSaveMode, Dimension } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { TILE, TILE_HEIGHT, chunkFloor } from "./util.js";
import { tickAreaFor, pickAreaSpan } from "./ticking.js";
import { debugStatus } from "./debug.js";

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
 * 64x384x64 (the structure size limit). Tiles are grouped into span-sized
 * ticking-area batches (the same batching the fills use) so one area load
 * covers many tiles instead of cycling an area per tile. Pushes the created
 * tile descriptors into the provided array.
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
    const span = pickAreaSpan();
    for (let ax = chunkFloor(min.x); ax <= max.x; ax += span) {
        for (let az = chunkFloor(min.z); az <= max.z; az += span) {
            const areaMin = { x: Math.max(ax, min.x), y: min.y, z: Math.max(az, min.z) };
            const areaMax = { x: Math.min(ax + span - 1, max.x), y: max.y, z: Math.min(az + span - 1, max.z) };
            const ok = yield* tickAreaFor(dimension, areaMin, areaMax, playerName);
            for (let tx = areaMin.x; tx <= areaMax.x; tx += TILE) {
                for (let tz = areaMin.z; tz <= areaMax.z; tz += TILE) {
                    const tileMaxX = Math.min(tx + TILE - 1, areaMax.x);
                    const tileMaxZ = Math.min(tz + TILE - 1, areaMax.z);
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
                        debugStatus(playerName, "§7Undo snapshot: §f" + index + "§7 tile(s)...");
                        yield;
                    }
                }
            }
        }
    }
    boxUndoSlotTiles.get(playerName).set(slot, ids);
}

/**
 * Generator that snapshots only the tiles a shape's runs touch, batched into
 * span-sized ticking areas, minimizing native calls: untouched tiles cost
 * nothing and each touched tile is one full-height createFromWorld.
 * @param {Dimension} dimension The dimension to snapshot.
 * @param {{x: number, y: number, z: number, length: number}[]} runs The shape runs.
 * @param {Vec3} bboxMin The inclusive bounding box min corner.
 * @param {Vec3} bboxMax The inclusive bounding box max corner.
 * @param {string} playerName The editing player's name.
 * @param {number} slot The reserved undo slot.
 * @param {object[]} tiles The array to fill with tile descriptors.
 * @returns {Generator} The snapshot job generator.
 */
function* snapshotRunTiles(dimension, runs, bboxMin, bboxMax, playerName, slot, tiles) {
    const touched = new Set();
    for (const run of runs) {
        if (run.y < bboxMin.y || run.y > bboxMax.y || run.z < bboxMin.z || run.z > bboxMax.z) {
            continue;
        }
        const startX = Math.max(run.x, bboxMin.x);
        const endX = Math.min(run.x + run.length - 1, bboxMax.x);
        if (startX > endX) {
            continue;
        }
        const tz = Math.floor((run.z - bboxMin.z) / TILE);
        const txEnd = Math.floor((endX - bboxMin.x) / TILE);
        for (let tx = Math.floor((startX - bboxMin.x) / TILE); tx <= txEnd; tx++) {
            touched.add(tx + "," + tz);
        }
    }
    const span = pickAreaSpan();
    const groups = new Map();
    for (const key of touched) {
        const parts = key.split(",");
        const entry = { tx: Number(parts[0]), tz: Number(parts[1]) };
        const gkey = Math.floor((bboxMin.x + entry.tx * TILE) / span) + "," + Math.floor((bboxMin.z + entry.tz * TILE) / span);
        let group = groups.get(gkey);
        if (!group) {
            group = [];
            groups.set(gkey, group);
        }
        group.push(entry);
    }
    const ids = [];
    let index = 0;
    for (const group of groups.values()) {
        const gMin = { x: Infinity, y: bboxMin.y, z: Infinity };
        const gMax = { x: -Infinity, y: bboxMax.y, z: -Infinity };
        for (const entry of group) {
            const minX = bboxMin.x + entry.tx * TILE;
            const minZ = bboxMin.z + entry.tz * TILE;
            gMin.x = Math.min(gMin.x, minX);
            gMin.z = Math.min(gMin.z, minZ);
            gMax.x = Math.max(gMax.x, Math.min(minX + TILE - 1, bboxMax.x));
            gMax.z = Math.max(gMax.z, Math.min(minZ + TILE - 1, bboxMax.z));
        }
        const ok = yield* tickAreaFor(dimension, gMin, gMax, playerName);
        for (const entry of group) {
            const minX = bboxMin.x + entry.tx * TILE;
            const maxX = Math.min(minX + TILE - 1, bboxMax.x);
            const minZ = bboxMin.z + entry.tz * TILE;
            const maxZ = Math.min(minZ + TILE - 1, bboxMax.z);
            for (let ty = bboxMin.y; ty <= bboxMax.y; ty += TILE_HEIGHT) {
                const tileMaxY = Math.min(ty + TILE_HEIGHT - 1, bboxMax.y);
                const id = "we:undo_" + playerName.toLowerCase() + "_" + slot + "_" + index;
                index += 1;
                if (!ok) {
                    continue;
                }
                world.structureManager.delete(id);
                world.structureManager.createFromWorld(id, dimension, { x: minX, y: ty, z: minZ }, { x: maxX, y: tileMaxY, z: maxZ }, { saveMode: StructureSaveMode.World, includeEntities: false });
                tiles.push({ id, x: minX, y: ty, z: minZ });
                ids.push(id);
                debugStatus(playerName, "§7Undo snapshot: §f" + index + "/" + touched.size + "§7 tile(s)...");
                yield;
            }
        }
    }
    boxUndoSlotTiles.get(playerName).set(slot, ids);
}

/**
 * Deletes every World Editor structure saved to the world and removes this pack's
 * ticking areas, spread across ticks so a large backlog cannot hang the
 * watchdog on world load. Undo/clipboard structures are session-scoped, so any
 * that survive into a new world load are stale and safe to remove. Call once
 * on world load.
 * @returns {void}
 */
function clearWorldEditStructures() {
    system.runJob(clearStructuresJob());
}

/**
 * Generator backing clearWorldEditStructures: deletes stale structures one
 * per resume, then clears the ticking areas and slot bookkeeping.
 * @returns {Generator} The cleanup job generator.
 */
function* clearStructuresJob() {
    for (const id of world.structureManager.getWorldStructureIds()) {
        if (id.startsWith("we:")) {
            world.structureManager.delete(id);
            yield;
        }
    }
    world.tickingAreaManager.removeAllTickingAreas();
    boxUndoCounters.clear();
    boxUndoSlotTiles.clear();
}

export { reserveBoxUndoSlot, snapshotBoxTiles, snapshotRunTiles, clearWorldEditStructures };
