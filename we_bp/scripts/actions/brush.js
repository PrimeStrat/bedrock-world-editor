import { EquipmentSlot, GameMode, ItemTypes, Player, PlayerPermissionLevel, ItemStack } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { parsePattern, patternErrorMessage, shortName } from "./common.js";
import { sphereRuns } from "../shapes/sphere.js";
import { cylinderRuns } from "../shapes/cylinder.js";
import { runBrushFill } from "../operations/brushfill.js";

const TOOL_SUFFIXES = ["_sword", "_pickaxe", "_axe", "_shovel", "_hoe"];

const brushes = new Map();

/**
 * @typedef {{shape: string, blockText: string, radius: number, height: number, hollow: boolean, includeAir: boolean}} BrushDef
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Returns the type id of the player's main-hand item, or null when empty.
 * @param {Player} player The player.
 * @returns {string|null} The held item type id.
 */
function heldItemId(player) {
    const equippable = player.getComponent("minecraft:equippable");
    const item = equippable ? equippable.getEquipment(EquipmentSlot.Mainhand) : undefined;
    return item ? item.typeId : null;
}

/**
 * Returns whether an item id is a tool (sword, pickaxe, axe, shovel, or hoe).
 * @param {string} itemId The item type id.
 * @returns {boolean} True for tools.
 */
function isToolItem(itemId) {
    return TOOL_SUFFIXES.some((suffix) => itemId.endsWith(suffix));
}

/**
 * Resolves the item a brush should bind to: an explicit item id when given,
 * otherwise the held item.
 * @param {Player} player The acting player.
 * @param {string} itemText An item id, or empty to use the held item.
 * @returns {string|null} The full item type id, or null when invalid.
 */
function brushItemId(player, itemText) {
    const trimmed = String(itemText ?? "").trim().toLowerCase();
    if (trimmed === "") {
        return heldItemId(player);
    }
    const full = trimmed.includes(":") ? trimmed : "minecraft:" + trimmed;
    return ItemTypes.get(full) ? full : null;
}

/**
 * Binds a shape brush to a tool item.
 * @param {Player} player The acting player.
 * @param {string} shape The brush shape ("sphere" or "cylinder").
 * @param {string} blockText The block id or weighted pattern to build with.
 * @param {number} radius The brush radius.
 * @param {number} height The cylinder height (ignored for spheres).
 * @param {boolean} hollow When true, only the shell is built.
 * @param {boolean} includeAir When true, air cells are filled too.
 * @param {string} itemText A tool item id, or empty to use the held item.
 * @returns {ActionResult} The result.
 */
function bindBrush(player, shape, blockText, radius, height, hollow, includeAir, itemText) {
    const itemId = brushItemId(player, itemText);
    if (!itemId) {
        return { ok: false, message: "§cHold a tool or enter a valid tool item id." };
    }
    if (itemId === WE_CONFIG.wandItemId) {
        return { ok: false, message: "§cThe selection wand cannot be a brush." };
    }
    if (!isToolItem(itemId)) {
        return { ok: false, message: "§cBrushes only bind to tools (sword, pickaxe, axe, shovel, hoe)." };
    }
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const r = Math.min(Math.max(1, Math.floor(radius)), WE_CONFIG.brushMaxRadius);
    let byItem = brushes.get(player.name);
    if (!byItem) {
        byItem = new Map();
        brushes.set(player.name, byItem);
    }
    byItem.set(itemId, { shape, blockText, radius: r, height: Math.floor(height), hollow: Boolean(hollow), includeAir: Boolean(includeAir) });
    const label = (shape === "cylinder" ? "Cylinder" : "Sphere") + " brush (radius " + r + ", §b" + pattern.label + "§a)";
    return { ok: true, message: "§a" + label + " bound to §f" + shortName(itemId) + "§a. Use the tool on a block." };
}

/**
 * Removes the brush bound to the player's held item.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function unbindBrush(player) {
    const itemId = heldItemId(player);
    if (!itemId) {
        return { ok: false, message: "§cHold the brush tool first." };
    }
    const byItem = brushes.get(player.name);
    if (!byItem || !byItem.delete(itemId)) {
        return { ok: false, message: "§cNo brush is bound to §f" + shortName(itemId) + "§c." };
    }
    return { ok: true, message: "§aBrush removed from §f" + shortName(itemId) + "§a." };
}

/**
 * Applies the brush bound to a used item at the block the player is looking
 * at. Brush strokes bypass the busy guard (that gate is for large edits), so
 * the tool can be used continuously. Does nothing when the item has no brush
 * or the player is not in creative mode.
 * @param {Player} player The player who used the item.
 * @param {ItemStack} itemStack The used item.
 * @returns {void}
 */
function applyBrush(player, itemStack) {
    const byItem = brushes.get(player.name);
    const brush = byItem ? byItem.get(itemStack.typeId) : undefined;
    if (!brush || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange });
    if (!hit) {
        player.onScreenDisplay.setActionBar("§cNo block in sight.");
        return;
    }
    const target = hit.block.location;
    const pattern = parsePattern(brush.blockText);
    if (!pattern) {
        return;
    }
    const runs = brush.shape === "cylinder"
        ? cylinderRuns(target, brush.radius, brush.height, brush.hollow)
        : sphereRuns(target, brush.radius, brush.hollow);
    runBrushFill(player, player.dimension, runs, pattern, brush.includeAir, "Brush §b" + pattern.label);
}

export { bindBrush, unbindBrush, applyBrush };
