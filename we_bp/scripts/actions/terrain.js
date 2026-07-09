import { Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { runTerrain } from "../operations/terrain.js";
import { requireRegion } from "./common.js";

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Runs a terrain surface operation over the selection.
 * @param {Player} player The acting player.
 * @param {string} op The operation ("raise", "lower", "set", or "flatten").
 * @param {number} amount The shift amount or target level.
 * @returns {ActionResult} The result.
 */
function terrainEdit(player, op, amount) {
    const region = requireRegion(player);
    if (!region.ok) {
        return region;
    }
    if (region.volume > WE_CONFIG.maxPatternBlocks) {
        return { ok: false, message: "§cTerrain selection too large (max " + WE_CONFIG.maxPatternBlocks + ")." };
    }
    const value = Math.floor(amount);
    if ((op === "raise" || op === "lower") && value < 1) {
        return { ok: false, message: "§cAmount must be at least 1." };
    }
    runTerrain(player, player.dimension, region.min, region.max, op, value);
    return { ok: true, message: "§aTerrain " + op + " started..." };
}

export { terrainEdit };
