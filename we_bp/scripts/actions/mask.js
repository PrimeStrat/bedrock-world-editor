import { world, BlockTypes, Player } from "@minecraft/server";
import { resolveBlockId, shortName } from "./common.js";
// BlockTypes.getAll() is a native call, so preset id sets are built lazily on
// first mask use (never at module-eval / early execution).
import { loadPlayerData, savePlayerData } from "../persist.js";

const MASK_KEY = "we:mask";
const maskCache = new Map();

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {{kind: string, value: string, label: string}} MaskDef
 */

/**
 * Axiom-style preset masks: each names a category and a rule that decides,
 * for a real Bedrock block id, whether it belongs. The rule is run once over
 * the live block registry (BlockTypes.getAll) to build an explicit id set, so
 * matching is a direct membership test against every block the game actually
 * has rather than a live substring guess. Fixed exact-id sets cover categories
 * that suffix rules would over-match.
 */
const STONE_IDS = new Set(["stone", "cobblestone", "mossy_cobblestone", "granite", "polished_granite", "diorite", "polished_diorite", "andesite", "polished_andesite", "deepslate", "cobbled_deepslate", "polished_deepslate", "tuff", "calcite", "dripstone_block", "blackstone", "polished_blackstone", "gilded_blackstone", "basalt", "smooth_basalt", "polished_basalt", "end_stone", "netherrack"]);
const DIRT_IDS = new Set(["dirt", "grass_block", "coarse_dirt", "rooted_dirt", "podzol", "mycelium", "mud", "muddy_mangrove_roots", "farmland", "dirt_with_roots"]);
const SAND_IDS = new Set(["sand", "red_sand", "gravel", "soul_sand", "soul_soil", "suspicious_sand", "suspicious_gravel"]);
const LIQUID_IDS = new Set(["water", "flowing_water", "lava", "flowing_lava"]);

const PRESETS = {
    all_wool: { label: "all wool", rule: (id) => id === "white_wool" || id.endsWith("_wool") },
    all_foliage: { label: "all foliage", rule: (id) => id.endsWith("_leaves") || id.endsWith("_sapling") || id.endsWith("_flower") || id.endsWith("_mushroom") || /^(oak_leaves|grass|tall_grass|fern|large_fern|dead_bush|vine|weeping_vines|twisting_vines|lily_pad|kelp|seagrass|bamboo|sugar_cane|azalea|flowering_azalea|moss_block|moss_carpet|sea_pickle|hanging_roots|spore_blossom|pink_petals|nether_sprouts|crimson_roots|warped_roots|red_mushroom|brown_mushroom|cactus|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony)$/.test(id) },
    all_leaves: { label: "all leaves", rule: (id) => id.endsWith("_leaves") },
    all_logs: { label: "all logs", rule: (id) => id.endsWith("_log") || id.endsWith("_wood") || id.endsWith("_stem") || id.endsWith("_hyphae") || id.startsWith("stripped_") },
    all_planks: { label: "all planks", rule: (id) => id.endsWith("_planks") },
    all_stone: { label: "all stone", rule: (id) => STONE_IDS.has(id) },
    all_dirt: { label: "all dirt", rule: (id) => DIRT_IDS.has(id) },
    all_ore: { label: "all ore", rule: (id) => id.endsWith("_ore") || id === "ancient_debris" },
    all_glass: { label: "all glass", rule: (id) => id === "glass" || id === "glass_pane" || id.endsWith("_stained_glass") || id.endsWith("_stained_glass_pane") || id === "tinted_glass" },
    all_concrete: { label: "all concrete", rule: (id) => id.endsWith("_concrete") || id.endsWith("_concrete_powder") },
    all_terracotta: { label: "all terracotta", rule: (id) => id === "hardened_clay" || id === "terracotta" || id.endsWith("_terracotta") || id.endsWith("_glazed_terracotta") },
    all_liquid: { label: "all liquid", rule: (id) => LIQUID_IDS.has(id) },
    all_sand: { label: "all sand", rule: (id) => SAND_IDS.has(id) },
    non_air: { label: "non-air (any solid)", rule: (id) => id !== "air" }
};

/** @type {Map<string, Set<string>>} */
const presetIds = new Map();

/**
 * Builds and caches the explicit full-id set for a preset by running its rule
 * over the live block registry once. Grabbing the ids from BlockTypes means the
 * mask lists exactly the blocks this world has, not a hardcoded guess.
 * @param {string} preset The preset name.
 * @returns {Set<string>} The full block ids in the category.
 */
function presetIdSet(preset) {
    let set = presetIds.get(preset);
    if (!set) {
        const rule = PRESETS[preset].rule;
        set = new Set();
        for (const type of BlockTypes.getAll()) {
            if (rule(shortName(type.id))) {
                set.add(type.id);
            }
        }
        presetIds.set(preset, set);
    }
    return set;
}

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
    return PRESETS[def.value] ? presetIdSet(def.value).has(typeId) : true;
}

export { maskPresetNames, setBlockMask, setPresetMask, clearMask, maskStatus, maskAllows, maskActive };
