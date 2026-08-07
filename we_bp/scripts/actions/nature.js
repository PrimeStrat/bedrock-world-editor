import { BlockPermutation, Player } from "@minecraft/server";
import { runSurfaceOp, setSurfaceCell } from "../operations/surface.js";
import { AIR_ID, requireRegion } from "./common.js";

const GRASS_BLOCK = "minecraft:grass_block";
const DIRT = "minecraft:dirt";
const STONE = "minecraft:stone";
const SNOW_LAYER = "minecraft:snow_layer";
const ICE = "minecraft:ice";
const WATER = "minecraft:water";

const DIRT_LIKE = new Set(["minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt", "minecraft:podzol", "minecraft:mycelium", "minecraft:stone", "minecraft:cobblestone", "minecraft:gravel", "minecraft:sand", "minecraft:sandstone", "minecraft:granite", "minecraft:diorite", "minecraft:andesite", "minecraft:deepslate"]);
const FLORA = ["minecraft:dandelion", "minecraft:poppy", "minecraft:cornflower", "minecraft:azure_bluet", "minecraft:oxeye_daisy", "minecraft:short_grass", "minecraft:short_grass", "minecraft:short_grass"];

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Turns the selection's surface columns into natural layering: the top block
 * becomes grass, the three below dirt, and the rest stone. Mirrors WorldEdit's
 * //naturalize, which makes an artificial stone build look like real ground.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function naturalize(player) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const grass = BlockPermutation.resolve(GRASS_BLOCK);
    const dirt = BlockPermutation.resolve(DIRT);
    const stone = BlockPermutation.resolve(STONE);
    const apply = (dimension, x, surfaceY, z, surfaceId, changes) => {
        if (!DIRT_LIKE.has(surfaceId)) {
            return;
        }
        setSurfaceCell(dimension, { x, y: surfaceY, z }, grass, changes);
        for (let d = 1; d <= 3; d++) {
            const y = surfaceY - d;
            if (y < region.min.y) {
                break;
            }
            const below = dimension.getBlock({ x, y, z });
            if (below && DIRT_LIKE.has(below.typeId)) {
                setSurfaceCell(dimension, { x, y, z }, dirt, changes);
            }
        }
        for (let y = surfaceY - 4; y >= region.min.y; y--) {
            const below = dimension.getBlock({ x, y, z });
            if (below && DIRT_LIKE.has(below.typeId) && below.typeId !== STONE) {
                setSurfaceCell(dimension, { x, y, z }, stone, changes);
            }
        }
    };
    runSurfaceOp(player, player.dimension, region.min, region.max, apply, "Naturalize", region.mask);
    return { ok: true, message: "§aNaturalizing surface..." };
}

/**
 * Turns exposed dirt on the surface into grass blocks (WorldEdit //green).
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function green(player) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const grass = BlockPermutation.resolve(GRASS_BLOCK);
    const apply = (dimension, x, surfaceY, z, surfaceId, changes) => {
        if (surfaceId === DIRT || surfaceId === "minecraft:coarse_dirt") {
            setSurfaceCell(dimension, { x, y: surfaceY, z }, grass, changes);
        }
    };
    runSurfaceOp(player, player.dimension, region.min, region.max, apply, "Green", region.mask);
    return { ok: true, message: "§aGreening surface..." };
}

/**
 * Lays a snow layer on top of every surface column and freezes surface water
 * to ice (WorldEdit //snow).
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function snow(player) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const snowLayer = BlockPermutation.resolve(SNOW_LAYER);
    const ice = BlockPermutation.resolve(ICE);
    const apply = (dimension, x, surfaceY, z, surfaceId, changes) => {
        if (surfaceId === WATER || surfaceId === "minecraft:flowing_water") {
            setSurfaceCell(dimension, { x, y: surfaceY, z }, ice, changes);
            return;
        }
        const above = dimension.getBlock({ x, y: surfaceY + 1, z });
        if (above && above.typeId === AIR_ID) {
            setSurfaceCell(dimension, { x, y: surfaceY + 1, z }, snowLayer, changes);
        }
    };
    runSurfaceOp(player, player.dimension, region.min, region.max, apply, "Snow", region.mask);
    return { ok: true, message: "§aLaying snow..." };
}

/**
 * Removes snow layers and turns surface ice back into water (WorldEdit //thaw).
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function thaw(player) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const air = BlockPermutation.resolve(AIR_ID);
    const water = BlockPermutation.resolve(WATER);
    const apply = (dimension, x, surfaceY, z, surfaceId, changes) => {
        if (surfaceId === ICE || surfaceId === "minecraft:packed_ice" || surfaceId === "minecraft:blue_ice") {
            setSurfaceCell(dimension, { x, y: surfaceY, z }, water, changes);
        }
        const above = dimension.getBlock({ x, y: surfaceY + 1, z });
        if (above && above.typeId === SNOW_LAYER) {
            setSurfaceCell(dimension, { x, y: surfaceY + 1, z }, air, changes);
        }
    };
    runSurfaceOp(player, player.dimension, region.min, region.max, apply, "Thaw", region.mask);
    return { ok: true, message: "§aThawing..." };
}

/**
 * Scatters flowers and grass on top of grassy surface columns (WorldEdit
 * //flora). Density controls the chance a given column gets a plant.
 * @param {Player} player The acting player.
 * @param {number} density The percent chance (1-100) per column.
 * @returns {ActionResult} The result.
 */
function flora(player, density) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    const chance = Math.min(100, Math.max(1, Math.floor(density))) / 100;
    const perms = FLORA.map((id) => BlockPermutation.resolve(id));
    const apply = (dimension, x, surfaceY, z, surfaceId, changes) => {
        if (surfaceId !== GRASS_BLOCK) {
            return;
        }
        if (Math.random() > chance) {
            return;
        }
        const above = dimension.getBlock({ x, y: surfaceY + 1, z });
        if (above && above.typeId === AIR_ID) {
            const perm = perms[Math.floor(Math.random() * perms.length)];
            setSurfaceCell(dimension, { x, y: surfaceY + 1, z }, perm, changes);
        }
    };
    runSurfaceOp(player, player.dimension, region.min, region.max, apply, "Flora", region.mask);
    return { ok: true, message: "§aScattering flora..." };
}

export { naturalize, green, snow, thaw, flora };
