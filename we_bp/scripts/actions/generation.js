import { Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runShapeEdit } from "../operations/shape.js";
import { runGenerate } from "../operations/generate.js";
import { sphereVolume, sphereRuns } from "../shapes/sphere.js";
import { cylinderVolume, cylinderRuns } from "../shapes/cylinder.js";
import { pyramidVolume, pyramidRuns } from "../shapes/pyramid.js";
import { compileExpression } from "../expression.js";
import { parsePattern, patternErrorMessage, busyGuard, blockUnder, requireRegion } from "./common.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {{entries: {permutation: object, weight: number}[], total: number, label: string}} FillPattern
 */

/**
 * Validates a shape's pattern text and volume against the caps.
 * @param {string} blockText The block id or pattern text.
 * @param {number} volume The shape volume in blocks.
 * @returns {{ok: true, pattern: FillPattern}|{ok: false, message: string}} The pattern or a failure.
 */
function shapePattern(blockText, volume) {
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    if (volume > WE_CONFIG.maxBlocks) {
        return { ok: false, message: "§cShape too large." };
    }
    if (pattern.entries.length > 1 && volume > WE_CONFIG.maxPatternBlocks) {
        return { ok: false, message: "§cWeighted patterns cap at " + WE_CONFIG.maxPatternBlocks + " blocks." };
    }
    return { ok: true, pattern };
}

/**
 * Builds a sphere at a center point.
 * @param {Player} player The acting player.
 * @param {number} radius The sphere radius.
 * @param {string} blockText The block id or pattern to build with.
 * @param {boolean} hollow When true, only the shell is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {Vec3|null} center The center, or null for the player's position.
 * @returns {ActionResult} The result.
 */
function buildSphere(player, radius, blockText, hollow, includeAir, center) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const r = Math.max(1, Math.floor(radius));
    const checked = shapePattern(blockText, sphereVolume(r));
    if (!checked.ok) {
        return checked;
    }
    const c = center ?? blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y - r, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + r, z: c.z + r };
    const label = (hollow ? "Hollow Sphere " : "Sphere ") + "§b" + checked.pattern.label;
    runShapeEdit(player, player.dimension, sphereRuns(c, r, Boolean(hollow)), bboxMin, bboxMax, checked.pattern, Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + "§a started..." };
}

/**
 * Builds a vertical cylinder based at a point.
 * @param {Player} player The acting player.
 * @param {number} radius The cylinder radius.
 * @param {number} height The cylinder height.
 * @param {string} blockText The block id or pattern to build with.
 * @param {boolean} hollow When true, only the wall is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {Vec3|null} base The base center, or null for the player's position.
 * @returns {ActionResult} The result.
 */
function buildCylinder(player, radius, height, blockText, hollow, includeAir, base) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const r = Math.max(1, Math.floor(radius));
    const h = Math.max(1, Math.floor(height));
    const checked = shapePattern(blockText, cylinderVolume(r, h));
    if (!checked.ok) {
        return checked;
    }
    const c = base ?? blockUnder(player);
    const bboxMin = { x: c.x - r, y: c.y, z: c.z - r };
    const bboxMax = { x: c.x + r, y: c.y + h - 1, z: c.z + r };
    const label = (hollow ? "Hollow Cylinder " : "Cylinder ") + "§b" + checked.pattern.label;
    runShapeEdit(player, player.dimension, cylinderRuns(c, r, h, Boolean(hollow)), bboxMin, bboxMax, checked.pattern, Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + "§a started..." };
}

/**
 * Builds a square pyramid based at the player's position.
 * @param {Player} player The acting player.
 * @param {number} size The pyramid height.
 * @param {string} blockText The block id or pattern to build with.
 * @param {boolean} hollow When true, only the shell is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @returns {ActionResult} The result.
 */
function buildPyramid(player, size, blockText, hollow, includeAir) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const s = Math.max(1, Math.floor(size));
    const checked = shapePattern(blockText, pyramidVolume(s));
    if (!checked.ok) {
        return checked;
    }
    const c = blockUnder(player);
    const half = s - 1;
    const bboxMin = { x: c.x - half, y: c.y, z: c.z - half };
    const bboxMax = { x: c.x + half, y: c.y + s - 1, z: c.z + half };
    const label = (hollow ? "Hollow Pyramid " : "Pyramid ") + "§b" + checked.pattern.label;
    runShapeEdit(player, player.dimension, pyramidRuns(c, s, Boolean(hollow)), bboxMin, bboxMax, checked.pattern, Boolean(includeAir), label, null);
    return { ok: true, message: "§a" + label + "§a started..." };
}

/**
 * Fills selection cells where a math expression of the normalized x, y, z
 * coordinates (each axis mapped to -1..1) is nonzero.
 * @param {Player} player The acting player.
 * @param {string} expressionText The math expression.
 * @param {string} blockText The block id or pattern, or empty for stone.
 * @returns {ActionResult} The result.
 */
function generateShape(player, expressionText, blockText) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const compiled = compileExpression(expressionText);
    if (!compiled.ok) {
        return { ok: false, message: "§cBad expression: " + compiled.message };
    }
    const text = String(blockText ?? "").trim();
    const pattern = parsePattern(text === "" ? "stone" : text);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    if (region.volume > WE_CONFIG.maxPatternBlocks) {
        return { ok: false, message: "§cGenerate caps at " + WE_CONFIG.maxPatternBlocks + " blocks." };
    }
    const label = "Generate §b" + pattern.label;
    runGenerate(player, player.dimension, region.min, region.max, compiled.evaluate, pattern, label);
    return { ok: true, message: "§a" + label + "§a started..." };
}

export { buildSphere, buildCylinder, buildPyramid, generateShape };
