import { BlockPermutation, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runShapeEdit } from "../operations/shape.js";
import { sphereVolume, sphereRuns } from "../shapes/sphere.js";
import { AIR_ID, resolveBlockId, busyGuard, blockUnder, shortName } from "./common.js";

const LIQUID_IDS = ["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"];

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Replaces a block type with air within a radius of the player.
 * @param {Player} player The acting player.
 * @param {string} blockId The block id to remove.
 * @param {number} radius The removal radius.
 * @returns {ActionResult} The result.
 */
function removeNear(player, blockId, radius) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    if (full === AIR_ID) {
        return { ok: false, message: "§cCannot remove air." };
    }
    const r = Math.max(1, Math.floor(radius));
    if (sphereVolume(r) > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cRadius too large." };
    }
    const c = blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    runShapeEdit(player, player.dimension, sphereRuns(c, r, false), bboxMin, bboxMax, BlockPermutation.resolve(AIR_ID), true, "RemoveNear " + shortName(full), full);
    return { ok: true, message: "§aRemoving nearby " + shortName(full) + "..." };
}

/**
 * Removes all liquids within a radius of the player.
 * @param {Player} player The acting player.
 * @param {number} radius The drain radius.
 * @returns {ActionResult} The result.
 */
function drainNear(player, radius) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const r = Math.max(1, Math.floor(radius));
    if (sphereVolume(r) > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cRadius too large." };
    }
    const c = blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    runShapeEdit(player, player.dimension, sphereRuns(c, r, false), bboxMin, bboxMax, BlockPermutation.resolve(AIR_ID), true, "Drain", LIQUID_IDS);
    return { ok: true, message: "§aDraining..." };
}

/**
 * Replaces one block type with another within a radius of the player.
 * @param {Player} player The acting player.
 * @param {number} radius The replacement radius.
 * @param {string} fromId The block id to replace.
 * @param {string} toId The block id to place.
 * @returns {ActionResult} The result.
 */
function replaceNear(player, radius, fromId, toId) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const from = resolveBlockId(fromId);
    const to = resolveBlockId(toId);
    if (!from || !to) {
        return { ok: false, message: "§cUnknown block: " + (from ? toId : fromId) };
    }
    const r = Math.max(1, Math.floor(radius));
    if (sphereVolume(r) > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cRadius too large." };
    }
    const c = blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    runShapeEdit(player, player.dimension, sphereRuns(c, r, false), bboxMin, bboxMax, BlockPermutation.resolve(to), true, "ReplaceNear " + shortName(from) + " -> " + shortName(to), from);
    return { ok: true, message: "§aReplacing nearby " + shortName(from) + "..." };
}

export { removeNear, drainNear, replaceNear };
