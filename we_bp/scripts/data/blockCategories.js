/**
 * Verbatim Bedrock block id lists, grouped by category, for masks and any other
 * feature that needs a fixed set of block types. Every id is written out in
 * full (minecraft: prefixed) rather than matched with endsWith/startsWith, so a
 * category contains exactly the blocks listed here and nothing accidental.
 *
 * Wood-family categories are expanded from WOOD_TYPES to keep the long lists
 * (logs, planks, leaves) accurate and in sync, but the expansion is a plain map
 * over a fixed list - the resulting ids are still exact, not pattern matches.
 */

const WOOD_TYPES = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak", "bamboo"];
const NETHER_STEM_TYPES = ["crimson", "warped"];
const DYE_COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];

/**
 * Prefixes each id with the minecraft namespace.
 * @param {string[]} ids The short block ids.
 * @returns {string[]} The namespaced ids.
 */
function ns(ids) {
    return ids.map((id) => "minecraft:" + id);
}

const WOOL = ns(DYE_COLORS.map((c) => c + "_wool"));

const CONCRETE = ns(DYE_COLORS.map((c) => c + "_concrete"));

const CONCRETE_POWDER = ns(DYE_COLORS.map((c) => c + "_concrete_powder"));

const STAINED_GLASS = ns(DYE_COLORS.map((c) => c + "_stained_glass"));

const STAINED_GLASS_PANE = ns(DYE_COLORS.map((c) => c + "_stained_glass_pane"));

const GLASS = ns(["glass", "glass_pane", "tinted_glass"]).concat(STAINED_GLASS, STAINED_GLASS_PANE);

const TERRACOTTA = ns(["hardened_clay", "terracotta"])
    .concat(ns(DYE_COLORS.map((c) => c + "_terracotta")))
    .concat(ns(DYE_COLORS.map((c) => c + "_glazed_terracotta")));

const LOGS = ns(WOOD_TYPES.filter((t) => t !== "bamboo").map((t) => t + "_log"))
    .concat(ns(WOOD_TYPES.filter((t) => t !== "bamboo").map((t) => "stripped_" + t + "_log")))
    .concat(ns(["oak_wood", "spruce_wood", "birch_wood", "jungle_wood", "acacia_wood", "dark_oak_wood", "mangrove_wood", "cherry_wood", "pale_oak_wood"]))
    .concat(ns(["stripped_oak_wood", "stripped_spruce_wood", "stripped_birch_wood", "stripped_jungle_wood", "stripped_acacia_wood", "stripped_dark_oak_wood", "stripped_mangrove_wood", "stripped_cherry_wood", "stripped_pale_oak_wood"]))
    .concat(ns(NETHER_STEM_TYPES.map((t) => t + "_stem")))
    .concat(ns(NETHER_STEM_TYPES.map((t) => "stripped_" + t + "_stem")))
    .concat(ns(NETHER_STEM_TYPES.map((t) => t + "_hyphae")))
    .concat(ns(NETHER_STEM_TYPES.map((t) => "stripped_" + t + "_hyphae")))
    .concat(ns(["bamboo_block", "stripped_bamboo_block"]));

const PLANKS = ns(WOOD_TYPES.map((t) => t + "_planks"))
    .concat(ns(NETHER_STEM_TYPES.map((t) => t + "_planks")));

const LEAVES = ns(["oak_leaves", "spruce_leaves", "birch_leaves", "jungle_leaves", "acacia_leaves", "dark_oak_leaves", "mangrove_leaves", "cherry_leaves", "pale_oak_leaves", "azalea_leaves", "azalea_leaves_flowered"]);

const SAPLINGS = ns(["oak_sapling", "spruce_sapling", "birch_sapling", "jungle_sapling", "acacia_sapling", "dark_oak_sapling", "mangrove_propagule", "cherry_sapling", "pale_oak_sapling"]);

const FLOWERS = ns([
    "dandelion", "poppy", "blue_orchid", "allium", "azure_bluet", "red_tulip", "orange_tulip",
    "white_tulip", "pink_tulip", "oxeye_daisy", "cornflower", "lily_of_the_valley", "wither_rose",
    "sunflower", "lilac", "rose_bush", "peony", "torchflower", "pitcher_plant", "pink_petals",
    "open_eyeblossom", "closed_eyeblossom", "wildflowers", "cactus_flower"
]);

const MUSHROOMS = ns(["red_mushroom", "brown_mushroom", "red_mushroom_block", "brown_mushroom_block", "mushroom_stem", "crimson_fungus", "warped_fungus"]);

const PLANTS = ns([
    "grass", "short_grass", "tall_grass", "fern", "large_fern", "dead_bush", "vine", "weeping_vines",
    "twisting_vines", "lily_pad", "kelp", "seagrass", "bamboo", "bamboo_sapling", "sugar_cane",
    "azalea", "flowering_azalea", "moss_block", "moss_carpet", "sea_pickle", "hanging_roots",
    "spore_blossom", "nether_sprouts", "crimson_roots", "warped_roots", "cactus", "big_dripleaf",
    "small_dripleaf_block", "glow_lichen", "sculk_vein", "pale_moss_block", "pale_moss_carpet",
    "pale_hanging_moss", "leaf_litter", "bush", "firefly_bush", "short_dry_grass", "tall_dry_grass"
]);

const FOLIAGE = [].concat(LEAVES, SAPLINGS, FLOWERS, MUSHROOMS, PLANTS);

const STONE = ns([
    "stone", "cobblestone", "mossy_cobblestone", "granite", "polished_granite", "diorite",
    "polished_diorite", "andesite", "polished_andesite", "deepslate", "cobbled_deepslate",
    "polished_deepslate", "tuff", "polished_tuff", "chiseled_tuff", "calcite", "dripstone_block",
    "blackstone", "polished_blackstone", "chiseled_polished_blackstone", "gilded_blackstone",
    "basalt", "smooth_basalt", "polished_basalt", "end_stone", "netherrack", "smooth_stone",
    "stone_bricks", "mossy_stone_bricks", "cracked_stone_bricks", "chiseled_stone_bricks",
    "deepslate_bricks", "cracked_deepslate_bricks", "deepslate_tiles", "cracked_deepslate_tiles",
    "polished_blackstone_bricks", "cracked_polished_blackstone_bricks"
]);

const DIRT = ns([
    "dirt", "grass_block", "coarse_dirt", "rooted_dirt", "podzol", "mycelium", "mud",
    "muddy_mangrove_roots", "farmland", "dirt_path", "pale_moss_block"
]);

const SAND = ns(["sand", "red_sand", "gravel", "soul_sand", "soul_soil", "suspicious_sand", "suspicious_gravel"]);

const ORE = ns([
    "coal_ore", "deepslate_coal_ore", "iron_ore", "deepslate_iron_ore", "copper_ore",
    "deepslate_copper_ore", "gold_ore", "deepslate_gold_ore", "redstone_ore",
    "deepslate_redstone_ore", "lit_redstone_ore", "lit_deepslate_redstone_ore", "emerald_ore",
    "deepslate_emerald_ore", "lapis_ore", "deepslate_lapis_ore", "diamond_ore",
    "deepslate_diamond_ore", "nether_gold_ore", "quartz_ore", "ancient_debris"
]);

const LIQUID = ns(["water", "flowing_water", "lava", "flowing_lava"]);

export {
    WOOD_TYPES,
    DYE_COLORS,
    WOOL,
    CONCRETE,
    CONCRETE_POWDER,
    GLASS,
    TERRACOTTA,
    LOGS,
    PLANKS,
    LEAVES,
    FOLIAGE,
    STONE,
    DIRT,
    SAND,
    ORE,
    LIQUID
};
