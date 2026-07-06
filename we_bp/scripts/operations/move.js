import { world, BlockPermutation, BlockVolume, StructureSaveMode, Dimension, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { AIR_ID, TILE, CHUNK, chunkFloor } from "./util.js";
import { pasteRegion } from "./paste.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Generator that fills a box with air in chunk-column slabs, each within the
 * native fillBlocks cap, yielding between slabs.
 * @param {Dimension} dimension The dimension to edit.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {Generator} The air fill generator.
 */
function* fillAirJob(dimension, min, max) {
    const air = BlockPermutation.resolve(AIR_ID);
    for (let x = min.x; x <= max.x; x = chunkFloor(x) + CHUNK) {
        for (let z = min.z; z <= max.z; z = chunkFloor(z) + CHUNK) {
            for (let y = min.y; y <= max.y; y += WE_CONFIG.fillSlab) {
                const subMax = {
                    x: Math.min(chunkFloor(x) + CHUNK - 1, max.x),
                    y: Math.min(y + WE_CONFIG.fillSlab - 1, max.y),
                    z: Math.min(chunkFloor(z) + CHUNK - 1, max.z)
                };
                dimension.fillBlocks(new BlockVolume({ x, y, z }, subMax), air);
                yield;
            }
        }
    }
}

/**
 * Moves the selection contents by an offset: the region is captured into
 * structures, the source is filled with air, and the capture is placed at the
 * destination, all recorded as one undoable edit spanning both regions.
 * @param {Player} player The moving player.
 * @param {Vec3} min The inclusive selection min corner.
 * @param {Vec3} max The inclusive selection max corner.
 * @param {Vec3} offset The block offset to move by.
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function moveSelection(player, min, max, offset) {
    const dimension = player.dimension;
    const tiles = [];
    let index = 0;
    for (let tx = min.x; tx <= max.x; tx += TILE) {
        for (let tz = min.z; tz <= max.z; tz += TILE) {
            const tileMaxX = Math.min(tx + TILE - 1, max.x);
            const tileMaxZ = Math.min(tz + TILE - 1, max.z);
            const structureId = "we:move_" + player.name.toLowerCase() + "_" + index;
            world.structureManager.delete(structureId);
            world.structureManager.createFromWorld(
                structureId,
                dimension,
                { x: tx, y: min.y, z: tz },
                { x: tileMaxX, y: max.y, z: tileMaxZ },
                { saveMode: StructureSaveMode.Memory, includeEntities: false }
            );
            tiles.push({ structureId, tx, tz });
            index += 1;
        }
    }

    const destMin = { x: min.x + offset.x, y: min.y + offset.y, z: min.z + offset.z };
    const destMax = { x: max.x + offset.x, y: max.y + offset.y, z: max.z + offset.z };
    const regionMin = { x: Math.min(min.x, destMin.x), y: Math.min(min.y, destMin.y), z: Math.min(min.z, destMin.z) };
    const regionMax = { x: Math.max(max.x, destMax.x), y: Math.max(max.y, destMax.y), z: Math.max(max.z, destMax.z) };

    const placeFn = function* () {
        yield* fillAirJob(dimension, min, max);
        for (const tile of tiles) {
            const location = { x: tile.tx + offset.x, y: destMin.y, z: tile.tz + offset.z };
            world.structureManager.place(tile.structureId, dimension, location, { includeEntities: false });
            yield;
        }
        for (const tile of tiles) {
            world.structureManager.delete(tile.structureId);
        }
    };

    pasteRegion(player, dimension, regionMin, regionMax, placeFn, "Move", false);
    return { ok: true, message: "Moving selection..." };
}

export { moveSelection };
