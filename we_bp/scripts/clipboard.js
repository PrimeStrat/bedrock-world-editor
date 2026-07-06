import { world, StructureManager, StructureSaveMode, StructureRotation, StructureMirror, Dimension, Player } from "@minecraft/server";
import { pasteRegion } from "./operations/paste.js";

const TILE = 64;
const MAX_HEIGHT = 384;

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{structureId: string, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number}} ClipTile
 * @typedef {{tiles: ClipTile[], size: Vec3, offset: Vec3, rotation: string, flipX: boolean, flipZ: boolean}} Clipboard
 */

/** @type {Map<string, Clipboard>} */
const clipboards = new Map();

/**
 * Maps a quarter-turn count to a StructureRotation value.
 * @param {number} quarters The number of 90-degree clockwise turns (0-3).
 * @returns {string} The matching StructureRotation.
 */
function rotationFor(quarters) {
    if (quarters === 1) {
        return StructureRotation.Rotate90;
    }
    if (quarters === 2) {
        return StructureRotation.Rotate180;
    }
    if (quarters === 3) {
        return StructureRotation.Rotate270;
    }
    return StructureRotation.None;
}

/**
 * Returns the quarter-turn count for a stored StructureRotation value.
 * @param {string} rotation The StructureRotation value.
 * @returns {number} The number of 90-degree clockwise turns (0-3).
 */
function quartersFor(rotation) {
    if (rotation === StructureRotation.Rotate90) {
        return 1;
    }
    if (rotation === StructureRotation.Rotate180) {
        return 2;
    }
    if (rotation === StructureRotation.Rotate270) {
        return 3;
    }
    return 0;
}

/**
 * Copies the box between two corners into a per-player clipboard, tiling the
 * footprint into structures of up to 64x64 with height fitted to the selection.
 * The clipboard offset is stored relative to the player's position (Java-style).
 * @param {Player} player The copying player.
 * @param {Vec3} pos1 The first selection corner.
 * @param {Vec3} pos2 The second selection corner.
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function copySelection(player, pos1, pos2) {
    const minX = Math.min(pos1.x, pos2.x);
    const maxX = Math.max(pos1.x, pos2.x);
    const minY = Math.min(pos1.y, pos2.y);
    const maxY = Math.max(pos1.y, pos2.y);
    const minZ = Math.min(pos1.z, pos2.z);
    const maxZ = Math.max(pos1.z, pos2.z);
    const sizeY = maxY - minY + 1;
    if (sizeY > MAX_HEIGHT) {
        return { ok: false, message: "Selection too tall (" + sizeY + " > " + MAX_HEIGHT + ")." };
    }

    clearClipboard(player.name);
    const tiles = [];
    let index = 0;
    for (let tx = minX; tx <= maxX; tx += TILE) {
        for (let tz = minZ; tz <= maxZ; tz += TILE) {
            const tileMaxX = Math.min(tx + TILE - 1, maxX);
            const tileMaxZ = Math.min(tz + TILE - 1, maxZ);
            const structureId = "we:clip_" + player.name.toLowerCase() + "_" + index;
            world.structureManager.delete(structureId);
            world.structureManager.createFromWorld(
                structureId,
                player.dimension,
                { x: tx, y: minY, z: tz },
                { x: tileMaxX, y: maxY, z: tileMaxZ },
                { saveMode: StructureSaveMode.World, includeEntities: false }
            );
            tiles.push({
                structureId,
                ox: tx - minX,
                oy: 0,
                oz: tz - minZ,
                sx: tileMaxX - tx + 1,
                sy: sizeY,
                sz: tileMaxZ - tz + 1
            });
            index += 1;
        }
    }

    const base = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    clipboards.set(player.name, {
        tiles,
        size: { x: maxX - minX + 1, y: sizeY, z: maxZ - minZ + 1 },
        offset: { x: minX - base.x, y: minY - base.y, z: minZ - base.z },
        rotation: StructureRotation.None,
        flipX: false,
        flipZ: false
    });
    return { ok: true, message: "Copied " + tiles.length + " tile(s)." };
}

/**
 * Rotates the whole-numbered block positions of a box counter-clockwise
 * (matching Bedrock's StructureRotation) about the origin block, returning the
 * rotated box's new min corner in the X/Z plane. The box spans the block
 * positions [bx, bx+w-1] x [bz, bz+d-1].
 * @param {number} bx The box min X.
 * @param {number} bz The box min Z.
 * @param {number} w The box X size.
 * @param {number} d The box Z size.
 * @param {number} quarters The number of 90-degree turns (0-3).
 * @returns {{x: number, z: number}} The rotated min corner.
 */
function rotateBoxMin(bx, bz, w, d, quarters) {
    if (quarters === 1) {
        return { x: -bz - (d - 1), z: bx };
    }
    if (quarters === 2) {
        return { x: -bx - (w - 1), z: -bz - (d - 1) };
    }
    if (quarters === 3) {
        return { x: bz, z: -bx - (w - 1) };
    }
    return { x: bx, z: bz };
}

/**
 * Computes a tile origin within the transformed clipboard bounding box: the
 * mirror flags are applied in the clipboard's local frame first, then the same
 * counter-clockwise rotation convention as Bedrock's place rotation, so the
 * tile content and tile position always agree.
 * @param {ClipTile} tile The tile being placed.
 * @param {Vec3} size The unrotated clipboard size.
 * @param {number} quarters The number of 90-degree turns (0-3).
 * @param {boolean} flipX Whether local X coordinates are mirrored.
 * @param {boolean} flipZ Whether local Z coordinates are mirrored.
 * @returns {{x: number, z: number}} The transformed tile origin in the X/Z plane.
 */
function transformedTileOrigin(tile, size, quarters, flipX, flipZ) {
    const w = size.x;
    const d = size.z;
    const ox = flipX ? w - tile.ox - tile.sx : tile.ox;
    const oz = flipZ ? d - tile.oz - tile.sz : tile.oz;
    if (quarters === 1) {
        return { x: oz, z: w - ox - tile.sx };
    }
    if (quarters === 2) {
        return { x: w - ox - tile.sx, z: d - oz - tile.sz };
    }
    if (quarters === 3) {
        return { x: d - oz - tile.sz, z: ox };
    }
    return { x: ox, z: oz };
}

/**
 * Returns the clipboard bounding box size after applying the rotation.
 * @param {Vec3} size The unrotated clipboard size.
 * @param {number} quarters The number of 90-degree turns (0-3).
 * @returns {Vec3} The rotated bounding box size.
 */
function rotatedSize(size, quarters) {
    if (quarters === 1 || quarters === 3) {
        return { x: size.z, y: size.y, z: size.x };
    }
    return { x: size.x, y: size.y, z: size.z };
}

/**
 * Transforms the selection's min-corner-relative-to-pivot vector around the
 * pivot (the copy position): mirror flags first, then rotation. Returns the
 * transformed bounding box's min corner, still relative to the pivot, so a
 * rotated or flipped paste swings around the copy point.
 * @param {Vec3} offset The selection min corner minus the copy position.
 * @param {Vec3} size The unrotated clipboard size.
 * @param {number} quarters The number of 90-degree turns (0-3).
 * @param {boolean} flipX Whether local X coordinates are mirrored.
 * @param {boolean} flipZ Whether local Z coordinates are mirrored.
 * @returns {Vec3} The transformed min corner relative to the pivot.
 */
function transformedMinFromPivot(offset, size, quarters, flipX, flipZ) {
    const bx = flipX ? -(offset.x + size.x - 1) : offset.x;
    const bz = flipZ ? -(offset.z + size.z - 1) : offset.z;
    const m = rotateBoxMin(bx, bz, size.x, size.z, quarters);
    return { x: m.x, y: offset.y, z: m.z };
}

/**
 * Maps flip flags to the StructureMirror value used at placement. Mirroring
 * across the Z axis flips X coordinates and vice versa.
 * @param {boolean} flipX Whether local X coordinates are mirrored.
 * @param {boolean} flipZ Whether local Z coordinates are mirrored.
 * @returns {string} The StructureMirror value.
 */
function mirrorFor(flipX, flipZ) {
    if (flipX && flipZ) {
        return StructureMirror.XZ;
    }
    if (flipX) {
        return StructureMirror.Z;
    }
    if (flipZ) {
        return StructureMirror.X;
    }
    return StructureMirror.None;
}

/**
 * Pastes the player's clipboard at their position plus the stored offset,
 * applying the clipboard rotation and recording an undoable edit.
 * @param {Player} player The pasting player.
 * @param {boolean} skipAir When true, air cells in the clipboard do not
 *   overwrite existing blocks at the destination.
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function pasteClipboard(player, skipAir) {
    const clip = clipboards.get(player.name);
    if (!clip || clip.tiles.length === 0) {
        return { ok: false, message: "Clipboard is empty. Use /we:copy first." };
    }
    const quarters = quartersFor(clip.rotation);
    const rotSize = rotatedSize(clip.size, quarters);
    const base = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
    const rotMin = transformedMinFromPivot(clip.offset, clip.size, quarters, clip.flipX, clip.flipZ);
    const targetMin = { x: base.x + rotMin.x, y: base.y + rotMin.y, z: base.z + rotMin.z };
    const targetMax = { x: targetMin.x + rotSize.x - 1, y: targetMin.y + rotSize.y - 1, z: targetMin.z + rotSize.z - 1 };
    const rotation = clip.rotation;
    const mirror = mirrorFor(clip.flipX, clip.flipZ);
    const dimension = player.dimension;

    const placeFn = () => {
        for (const tile of clip.tiles) {
            const o = transformedTileOrigin(tile, clip.size, quarters, clip.flipX, clip.flipZ);
            const location = { x: targetMin.x + o.x, y: targetMin.y + tile.oy, z: targetMin.z + o.z };
            world.structureManager.place(tile.structureId, dimension, location, { rotation, mirror, includeEntities: false });
        }
    };

    pasteRegion(player, dimension, targetMin, targetMax, placeFn, "Paste", Boolean(skipAir));
    return { ok: true, message: "Pasting clipboard" + (skipAir ? " (skip air)" : "") + "..." };
}

/**
 * Returns the dominant horizontal unit axis from a view direction.
 * @param {Vec3} view The player's view direction.
 * @returns {Vec3} A unit vector along the dominant horizontal axis.
 */
function axisFromView(view) {
    if (Math.abs(view.x) >= Math.abs(view.z)) {
        return { x: view.x >= 0 ? 1 : -1, y: 0, z: 0 };
    }
    return { x: 0, y: 0, z: view.z >= 0 ? 1 : -1 };
}

/**
 * Stacks the selection a number of times along a direction, each copy adjacent
 * to the previous, recording the whole result as a single undoable edit.
 * @param {Player} player The stacking player.
 * @param {Vec3} pos1 The first selection corner.
 * @param {Vec3} pos2 The second selection corner.
 * @param {number} count How many additional copies to place (>= 1).
 * @param {Vec3} dir The unit direction to stack along.
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function stackSelection(player, pos1, pos2, count, dir) {
    const minX = Math.min(pos1.x, pos2.x);
    const maxX = Math.max(pos1.x, pos2.x);
    const minY = Math.min(pos1.y, pos2.y);
    const maxY = Math.max(pos1.y, pos2.y);
    const minZ = Math.min(pos1.z, pos2.z);
    const maxZ = Math.max(pos1.z, pos2.z);
    const size = { x: maxX - minX + 1, y: maxY - minY + 1, z: maxZ - minZ + 1 };
    if (size.y > MAX_HEIGHT) {
        return { ok: false, message: "Selection too tall (" + size.y + " > " + MAX_HEIGHT + ")." };
    }

    const step = { x: dir.x * size.x, y: dir.y * size.y, z: dir.z * size.z };
    const dimension = player.dimension;
    const tiles = [];
    let index = 0;
    for (let tx = minX; tx <= maxX; tx += TILE) {
        for (let tz = minZ; tz <= maxZ; tz += TILE) {
            const tileMaxX = Math.min(tx + TILE - 1, maxX);
            const tileMaxZ = Math.min(tz + TILE - 1, maxZ);
            const structureId = "we:stack_" + player.name.toLowerCase() + "_" + index;
            world.structureManager.delete(structureId);
            world.structureManager.createFromWorld(
                structureId,
                dimension,
                { x: tx, y: minY, z: tz },
                { x: tileMaxX, y: maxY, z: tileMaxZ },
                { saveMode: StructureSaveMode.Memory, includeEntities: false }
            );
            tiles.push({ structureId, tx, tz });
            index += 1;
        }
    }

    const farMin = { x: minX + step.x * count, y: minY + step.y * count, z: minZ + step.z * count };
    const regionMin = { x: Math.min(minX, farMin.x), y: Math.min(minY, farMin.y), z: Math.min(minZ, farMin.z) };
    const regionMax = { x: Math.max(maxX, farMin.x + size.x - 1), y: Math.max(maxY, farMin.y + size.y - 1), z: Math.max(maxZ, farMin.z + size.z - 1) };

    const placeFn = () => {
        for (let i = 1; i <= count; i++) {
            for (const tile of tiles) {
                const location = { x: tile.tx + step.x * i, y: minY + step.y * i, z: tile.tz + step.z * i };
                world.structureManager.place(tile.structureId, dimension, location, { includeEntities: false });
            }
        }
        for (const tile of tiles) {
            world.structureManager.delete(tile.structureId);
        }
    };

    pasteRegion(player, dimension, regionMin, regionMax, placeFn, "Stack", false);
    return { ok: true, message: "Stacking " + count + " copy(ies)..." };
}

/**
 * Sets the clipboard rotation applied on the next paste.
 * @param {Player} player The player whose clipboard is rotated.
 * @param {number} degrees The rotation in degrees (90, 180, or 270).
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function rotateClipboard(player, degrees) {
    const clip = clipboards.get(player.name);
    if (!clip || clip.tiles.length === 0) {
        return { ok: false, message: "Clipboard is empty. Use /we:copy first." };
    }
    const addQuarters = Math.round(degrees / 90) % 4;
    const total = (quartersFor(clip.rotation) + addQuarters + 4) % 4;
    clip.rotation = rotationFor(total);
    return { ok: true, message: "Clipboard rotation set to " + (total * 90) + " degrees." };
}

/**
 * Toggles a mirror axis on the clipboard, applied on the next paste. The flip
 * is in the clipboard's local frame (before any rotation).
 * @param {Player} player The player whose clipboard is flipped.
 * @param {string} axis Either "x" (mirror X coordinates) or "z".
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function flipClipboard(player, axis) {
    const clip = clipboards.get(player.name);
    if (!clip || clip.tiles.length === 0) {
        return { ok: false, message: "Clipboard is empty. Use /we:copy first." };
    }
    if (axis === "x") {
        clip.flipX = !clip.flipX;
    } else {
        clip.flipZ = !clip.flipZ;
    }
    const state = (clip.flipX ? "X" : "") + (clip.flipZ ? "Z" : "");
    return { ok: true, message: "Clipboard flip set to " + (state === "" ? "none" : state) + "." };
}

/**
 * Deletes the saved structures and clears the clipboard for a player.
 * @param {string} playerName The player's name.
 * @returns {boolean} True if a clipboard existed and was cleared.
 */
function clearClipboard(playerName) {
    const clip = clipboards.get(playerName);
    if (clip) {
        for (const tile of clip.tiles) {
            world.structureManager.delete(tile.structureId);
        }
    }
    return clipboards.delete(playerName);
}

/**
 * Clears a player's clipboard and returns a status message.
 * @param {Player} player The player whose clipboard is cleared.
 * @returns {{ok: boolean, message: string}} The result and a status message.
 */
function clearClipboardForPlayer(player) {
    const had = clearClipboard(player.name);
    return had
        ? { ok: true, message: "Clipboard cleared." }
        : { ok: false, message: "Clipboard was already empty." };
}

export { copySelection, pasteClipboard, rotateClipboard, flipClipboard, clearClipboardForPlayer, stackSelection, axisFromView };
