import { BlockPermutation, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runShapeEdit } from "../operations/shape.js";
import { sphereVolume, sphereRuns } from "../shapes/sphere.js";
import { cylinderVolume, cylinderRuns } from "../shapes/cylinder.js";
import { pyramidVolume, pyramidRuns } from "../shapes/pyramid.js";
import { resolveBlockId, busyGuard, blockUnder, shortName } from "./common.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Builds a sphere at a center point.
 * @param {Player} player The acting player.
 * @param {number} radius The sphere radius.
 * @param {string} blockId The block id to build with.
 * @param {boolean} hollow When true, only the shell is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {Vec3|null} center The center, or null for the player's position.
 * @returns {ActionResult} The result.
 */
function buildSphere(player, radius, blockId, hollow, includeAir, center) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    const r = Math.max(1, Math.floor(radius));
    if (sphereVolume(r) > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cSphere too large." };
    }
    const c = center ?? blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    const label = (hollow ? "Hollow Sphere " : "Sphere ") + shortName(full);
    runShapeEdit(player, player.dimension, sphereRuns(c, r, Boolean(hollow)), bboxMin, bboxMax, BlockPermutation.resolve(full), Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + " started..." };
}

/**
 * Builds a vertical cylinder based at a point.
 * @param {Player} player The acting player.
 * @param {number} radius The cylinder radius.
 * @param {number} height The cylinder height.
 * @param {string} blockId The block id to build with.
 * @param {boolean} hollow When true, only the wall is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {Vec3|null} base The base center, or null for the player's position.
 * @returns {ActionResult} The result.
 */
function buildCylinder(player, radius, height, blockId, hollow, includeAir, base) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    const r = Math.max(1, Math.floor(radius));
    const h = Math.max(1, Math.floor(height));
    if (cylinderVolume(r, h) > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cCylinder too large." };
    }
    const c = base ?? blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + h - 1, z: c.z + r };
    const label = (hollow ? "Hollow Cylinder " : "Cylinder ") + shortName(full);
    runShapeEdit(player, player.dimension, cylinderRuns(c, r, h, Boolean(hollow)), bboxMin, bboxMax, BlockPermutation.resolve(full), Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + " started..." };
}

/**
 * Builds a square pyramid based at the player's position.
 * @param {Player} player The acting player.
 * @param {number} size The pyramid height.
 * @param {string} blockId The block id to build with.
 * @param {boolean} hollow When true, only the shell is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @returns {ActionResult} The result.
 */
function buildPyramid(player, size, blockId, hollow, includeAir) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const full = resolveBlockId(blockId);
    if (!full) {
        return { ok: false, message: "§cUnknown block: " + blockId };
    }
    const s = Math.max(1, Math.floor(size));
    if (pyramidVolume(s) > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cPyramid too large." };
    }
    const c = blockUnder(player);
    const half = s - 1;
    const bboxMin = { x: c.x - half, y: c.y, z: c.z - half };
    const bboxMax = { x: c.x + half, y: c.y + s - 1, z: c.z + half };
    const label = (hollow ? "Hollow Pyramid " : "Pyramid ") + shortName(full);
    runShapeEdit(player, player.dimension, pyramidRuns(c, s, Boolean(hollow)), bboxMin, bboxMax, BlockPermutation.resolve(full), Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + " started..." };
}

export { buildSphere, buildCylinder, buildPyramid };
