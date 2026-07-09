import { world, EntityInventoryComponent, Player } from "@minecraft/server";
import { shortName, setGradientResolver } from "./common.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const GRADIENT_KEY = "we:gradients";
const gradientCache = new Map();

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
 * Scans the player's inventory and builds a weighted pattern string where each
 * block's weight is its total stack count. Non-block items are ignored.
 * @param {Player} player The scanning player.
 * @returns {{ok: true, pattern: string, label: string}|{ok: false, message: string}} The pattern or a failure.
 */
function scanInventory(player) {
    const inv = player.getComponent(EntityInventoryComponent.componentId);
    const container = inv ? inv.container : undefined;
    if (!container) {
        return { ok: false, message: "§cNo inventory to scan." };
    }
    const counts = new Map();
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (!item) {
            continue;
        }
        const block = item.typeId;
        counts.set(block, (counts.get(block) ?? 0) + item.amount);
    }
    if (counts.size === 0) {
        return { ok: false, message: "§cInventory is empty - add blocks to build a gradient." };
    }
    const parts = [];
    const names = [];
    for (const [id, count] of counts.entries()) {
        parts.push(count + shortName(id));
        names.push(count + "x " + shortName(id));
    }
    return { ok: true, pattern: parts.join(","), label: names.join(", ") };
}

/**
 * Builds a gradient from the player's inventory and saves it under a name. The
 * gradient is a weighted blend where each block's chance scales with its count.
 * @param {Player} player The scanning player.
 * @param {string} name The gradient name.
 * @returns {ActionResult} The result.
 */
function startGradient(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    if (key === "") {
        return { ok: false, message: "§cName the gradient, e.g. /we:gradient start mymix." };
    }
    const scan = scanInventory(player);
    if (!scan.ok) {
        return scan;
    }
    const map = loadGradients(player);
    map[key] = scan.pattern;
    storeGradients(player, map);
    return { ok: true, message: "§aGradient §f#" + key + "§a built from inventory: §b" + scan.label + "§a. Use it anywhere as §f#" + key + "§a." };
}

/**
 * Removes a saved gradient.
 * @param {Player} player The owning player.
 * @param {string} name The gradient name.
 * @returns {ActionResult} The result.
 */
function stopGradient(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    const map = loadGradients(player);
    if (!(key in map)) {
        return { ok: false, message: "§cNo gradient named §f#" + key + "§c." };
    }
    delete map[key];
    storeGradients(player, map);
    return { ok: true, message: "§aGradient §f#" + key + "§a removed." };
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
    const lines = names.map((name) => "§f#" + name + "§7: §b" + map[name]);
    return { ok: true, message: "§6Gradients:\n" + lines.join("\n") };
}

/**
 * Returns a player's saved gradients as name-to-pattern-string entries.
 * @param {Player} player The owning player.
 * @returns {{name: string, pattern: string}[]} The gradient entries.
 */
function gradientEntries(player) {
    const map = loadGradients(player);
    return Object.keys(map).map((name) => ({ name, pattern: map[name] }));
}

/**
 * Resolves a "#name" gradient token to a player's stored weighted pattern
 * string, loading from persistence into the cache on a miss.
 * @param {string} playerName The owning player's name.
 * @param {string} name The gradient name.
 * @returns {string|null} The weighted pattern string, or null.
 */
function resolveGradient(playerName, name) {
    let map = gradientCache.get(playerName);
    if (!map) {
        const player = world.getAllPlayers().find((p) => p.name === playerName);
        if (!player) {
            return null;
        }
        map = loadGradients(player);
    }
    return map[name] ?? null;
}

setGradientResolver(resolveGradient);

export { startGradient, stopGradient, listGradients, gradientEntries };
