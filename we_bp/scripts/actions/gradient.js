import { world, BlockTypes, EntityInventoryComponent, Player } from "@minecraft/server";
import { shortName, setGradientResolver } from "./common.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const GRADIENT_KEY = "we:gradients";
const gradientCache = new Map();
const pendingCaptures = new Map();

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {Object<string, string>} GradientMap
 */

/**
 * Loads a player's saved gradients (name to weighted pattern string) into the
 * cache.
 * @param {Player} player The owning player.
 * @returns {GradientMap} The name-to-pattern map.
 */
function loadGradients(player) {
    let map = gradientCache.get(player.name);
    if (!map) {
        map = loadPlayerData(player, GRADIENT_KEY, {});
        gradientCache.set(player.name, map);
    }
    return map;
}

/**
 * Persists a player's gradient map and refreshes the cache.
 * @param {Player} player The owning player.
 * @param {GradientMap} map The name-to-pattern map.
 * @returns {void}
 */
function storeGradients(player, map) {
    gradientCache.set(player.name, map);
    savePlayerData(player, GRADIENT_KEY, Object.keys(map).length > 0 ? map : undefined);
}

/**
 * Scans the player's inventory into ordered gradient bands: one band per
 * distinct block in inventory-slot order, its width set by the block's total
 * count. Order defines the low-to-high transition; counts widen a block's band.
 * Only real blocks are counted; non-block items are ignored.
 * @param {Player} player The scanning player.
 * @returns {{ok: true, bands: {id: string, weight: number}[], label: string}|{ok: false, message: string}} The bands or a failure.
 */
function scanInventory(player) {
    const inv = player.getComponent(EntityInventoryComponent.componentId);
    const container = inv ? inv.container : undefined;
    if (!container) {
        return { ok: false, message: "§cNo inventory to scan." };
    }
    const order = [];
    const counts = new Map();
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (!item || !BlockTypes.get(item.typeId)) {
            continue;
        }
        if (!counts.has(item.typeId)) {
            order.push(item.typeId);
        }
        counts.set(item.typeId, (counts.get(item.typeId) ?? 0) + item.amount);
    }
    if (order.length === 0) {
        return { ok: false, message: "§cNo blocks in inventory - add blocks first." };
    }
    const bands = order.map((id) => ({ id, weight: counts.get(id) }));
    const label = bands.map((b) => b.weight + "x " + shortName(b.id)).join(" -> ");
    return { ok: true, bands, label };
}

/**
 * Arms gradient capture under a name: the next stop scans the inventory into
 * this gradient. Prompts the player to set up their blocks.
 * @param {Player} player The acting player.
 * @param {string} name The gradient name.
 * @returns {ActionResult} The result.
 */
function startGradient(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    if (key === "") {
        return { ok: false, message: "§cName the gradient, e.g. /we:gradient start mymix." };
    }
    pendingCaptures.set(player.name, key);
    return { ok: true, message: "§aBuilding gradient §f#" + key + "§a. Add blocks to your inventory in low-to-high order (count widens a band), then /we:gradient stop." };
}

/**
 * Locks in the armed gradient by scanning the inventory into a weighted blend
 * and saving it. Requires a prior start.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function stopGradient(player) {
    const key = pendingCaptures.get(player.name);
    if (!key) {
        return { ok: false, message: "§cNothing to lock in. Use /we:gradient start <name> first." };
    }
    const scan = scanInventory(player);
    if (!scan.ok) {
        return scan;
    }
    pendingCaptures.delete(player.name);
    const map = loadGradients(player);
    map[key] = scan.bands;
    storeGradients(player, map);
    return { ok: true, message: "§aGradient §f#" + key + "§a locked in: §b" + scan.label + "§a. Use it with /we:brush <name> gradient sphere #" + key + "§a." };
}

/**
 * Deletes a saved gradient.
 * @param {Player} player The owning player.
 * @param {string} name The gradient name.
 * @returns {ActionResult} The result.
 */
function deleteGradient(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    const map = loadGradients(player);
    if (!(key in map)) {
        return { ok: false, message: "§cNo gradient named §f#" + key + "§c." };
    }
    delete map[key];
    storeGradients(player, map);
    return { ok: true, message: "§aGradient §f#" + key + "§a deleted." };
}

/**
 * Lists a player's saved gradients.
 * @param {Player} player The owning player.
 * @returns {ActionResult} The result.
 */
function listGradients(player) {
    const map = loadGradients(player);
    const names = Object.keys(map);
    if (names.length === 0) {
        return { ok: true, message: "§7No gradients. Add blocks to your inventory then /we:gradient start <name>." };
    }
    const lines = names.map((name) => "§f#" + name + "§7: §b" + bandsLabel(map[name]));
    return { ok: true, message: "§6Gradients:\n" + lines.join("\n") };
}

/**
 * Formats gradient bands as a low-to-high block list for display.
 * @param {{id: string, weight: number}[]} bands The gradient bands.
 * @returns {string} The label.
 */
function bandsLabel(bands) {
    return Array.isArray(bands) ? bands.map((b) => shortName(b.id)).join(" -> ") : "?";
}

/**
 * Returns a player's saved gradients as name-and-band entries, skipping any
 * stored in an old non-band format.
 * @param {Player} player The owning player.
 * @returns {{name: string, bands: {id: string, weight: number}[], label: string}[]} The gradient entries.
 */
function gradientEntries(player) {
    const map = loadGradients(player);
    return Object.keys(map).filter((name) => Array.isArray(map[name])).map((name) => ({ name, bands: map[name], label: bandsLabel(map[name]) }));
}

/**
 * Returns a player's gradient bands by name, loading from persistence on a
 * cache miss.
 * @param {string} playerName The owning player's name.
 * @param {string} name The gradient name.
 * @returns {{id: string, weight: number}[]|null} The bands, or null.
 */
function gradientBands(playerName, name) {
    let map = gradientCache.get(playerName);
    if (!map) {
        const player = world.getAllPlayers().find((p) => p.name === playerName);
        if (!player) {
            return null;
        }
        map = loadGradients(player);
    }
    const value = map[String(name).trim().toLowerCase()];
    return Array.isArray(value) ? value : null;
}

/**
 * Resolves a "#name" gradient token to a weighted pattern string built from
 * its bands, for flat fills where spatial ordering does not apply.
 * @param {string} playerName The owning player's name.
 * @param {string} name The gradient name.
 * @returns {string|null} The weighted pattern string, or null.
 */
function resolveGradient(playerName, name) {
    const bands = gradientBands(playerName, name);
    if (!bands) {
        return null;
    }
    return bands.map((b) => b.weight + shortName(b.id)).join(",");
}

setGradientResolver(resolveGradient);

export { startGradient, stopGradient, deleteGradient, listGradients, gradientEntries, gradientBands };
