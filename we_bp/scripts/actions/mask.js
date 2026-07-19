import { world, Player } from "@minecraft/server";
import { resolveBlockId, shortName } from "./common.js";
import { WOOL, CONCRETE, CONCRETE_POWDER, GLASS, TERRACOTTA, LOGS, PLANKS, LEAVES, FOLIAGE, STONE, DIRT, SAND, ORE, LIQUID } from "../data/blockCategories.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const MASK_KEY = "we:mask";
const AIR_ID = "minecraft:air";
const maskCache = new Map();

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {{kind: string, value: string, label: string}} MaskDef
 */

/**
 * Axiom-style preset masks: each names a category backed by a verbatim block
 * id set from the block-categories data file, so matching is a direct
 * membership test with no substring rules. non_air is the one exception, an
 * "any block but air" predicate rather than a list.
 */
const PRESETS = {
    all_wool: { label: "all wool", ids: new Set(WOOL) },
    all_foliage: { label: "all foliage", ids: new Set(FOLIAGE) },
    all_leaves: { label: "all leaves", ids: new Set(LEAVES) },
    all_logs: { label: "all logs", ids: new Set(LOGS) },
    all_planks: { label: "all planks", ids: new Set(PLANKS) },
    all_stone: { label: "all stone", ids: new Set(STONE) },
    all_dirt: { label: "all dirt", ids: new Set(DIRT) },
    all_ore: { label: "all ore", ids: new Set(ORE) },
    all_glass: { label: "all glass", ids: new Set(GLASS) },
    all_concrete: { label: "all concrete", ids: new Set(CONCRETE.concat(CONCRETE_POWDER)) },
    all_terracotta: { label: "all terracotta", ids: new Set(TERRACOTTA) },
    all_liquid: { label: "all liquid", ids: new Set(LIQUID) },
    all_sand: { label: "all sand", ids: new Set(SAND) },
    non_air: { label: "non-air (any solid)", ids: null }
};

/**
 * Returns the preset mask names, for the command enum and menus.
 * @returns {string[]} The preset names.
 */
function maskPresetNames() {
    return Object.keys(PRESETS);
}

/**
 * Loads a player's stored mask definition into the cache.
 * @param {Player} player The owning player.
 * @returns {MaskDef|null} The mask definition, or null when none is set.
 */
function loadMask(player) {
    if (maskCache.has(player.name)) {
        return maskCache.get(player.name);
    }
    const def = loadPlayerData(player, MASK_KEY, null);
    maskCache.set(player.name, def);
    return def;
}

/**
 * Sets a mask to a comma list of exact block ids: edits only affect cells whose
 * current block is one of these.
 * @param {Player} player The acting player.
 * @param {string} blockText The comma-separated block ids.
 * @returns {ActionResult} The result.
 */
function setBlockMask(player, blockText) {
    const parts = String(blockText ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ids = [];
    for (const part of parts) {
        const full = resolveBlockId(part);
        if (!full) {
            return { ok: false, message: "§cUnknown block in mask: §b" + part + "§c." };
        }
        ids.push(full);
    }
    if (ids.length === 0) {
        return { ok: false, message: "§cName at least one block, e.g. /we:mask stone,dirt." };
    }
    const def = { kind: "blocks", value: ids.join(","), label: ids.map(shortName).join(", ") };
    maskCache.set(player.name, def);
    savePlayerData(player, MASK_KEY, def);
    return { ok: true, message: "§aMask set to §f" + def.label + "§a. Edits now only affect those blocks." };
}

/**
 * Sets a mask to a named Axiom-style preset category.
 * @param {Player} player The acting player.
 * @param {string} preset The preset name.
 * @returns {ActionResult} The result.
 */
function setPresetMask(player, preset) {
    const key = String(preset ?? "").trim().toLowerCase();
    if (!PRESETS[key]) {
        return { ok: false, message: "§cUnknown mask preset §f" + key + "§c." };
    }
    const def = { kind: "preset", value: key, label: PRESETS[key].label };
    maskCache.set(player.name, def);
    savePlayerData(player, MASK_KEY, def);
    return { ok: true, message: "§aMask set to §f" + def.label + "§a. Edits now only affect those blocks." };
}

/**
 * Clears the player's active mask.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function clearMask(player) {
    if (!loadMask(player)) {
        return { ok: false, message: "§cNo mask is set." };
    }
    maskCache.set(player.name, null);
    savePlayerData(player, MASK_KEY, undefined);
    return { ok: true, message: "§aMask cleared." };
}

/**
 * Describes the player's active mask.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function maskStatus(player) {
    const def = loadMask(player);
    return def
        ? { ok: true, message: "§6Mask: §f" + def.label }
        : { ok: true, message: "§7No mask set. /we:mask <blocks> or /we:emask <preset>." };
}

/**
 * Returns the player's active mask definition, loading it on a cache miss.
 * @param {string} playerName The acting player's name.
 * @returns {MaskDef|null} The mask definition, or null.
 */
function activeMask(playerName) {
    let def = maskCache.get(playerName);
    if (def === undefined) {
        const player = world.getAllPlayers().find((p) => p.name === playerName);
        def = player ? loadMask(player) : null;
    }
    return def ?? null;
}

/**
 * Returns whether a player currently has a mask set. Fill jobs use this to
 * fall back from the fast native fill to per-cell checking.
 * @param {string} playerName The acting player's name.
 * @returns {boolean} True when a mask is active.
 */
function maskActive(playerName) {
    return activeMask(playerName) !== null;
}

/**
 * Returns whether a block type id passes a player's active mask. Always true
 * when no mask is set, so masking is opt-in and universal across every edit.
 * @param {string} playerName The acting player's name.
 * @param {string} typeId The cell's current block type id.
 * @returns {boolean} True when the cell may be edited.
 */
function maskAllows(playerName, typeId) {
    const def = activeMask(playerName);
    if (!def) {
        return true;
    }
    if (def.kind === "blocks") {
        return def.value.split(",").includes(typeId);
    }
    const preset = PRESETS[def.value];
    if (!preset) {
        return true;
    }
    return preset.ids ? preset.ids.has(typeId) : typeId !== AIR_ID;
}

export { maskPresetNames, setBlockMask, setPresetMask, clearMask, maskStatus, maskAllows, maskActive };
