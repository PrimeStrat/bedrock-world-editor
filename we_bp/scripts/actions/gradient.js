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
 * Arms gradient capture under a name, with a projection type and interpolation:
 * the next stop scans the inventory into this gradient. Planar runs the
 * gradient along the pos1->pos2 axis; spherical radiates from pos1 out to the
 * pos2 radius. Interpolation shapes where band boundaries land (nearest hard,
 * linear even, bezier eased through the middle).
 * @param {Player} player The acting player.
 * @param {string} name The gradient name.
 * @param {string} type One of "planar", "spherical".
 * @param {string} interp One of "nearest", "linear", "bezier".
 * @returns {ActionResult} The result.
 */
function startGradient(player, name, type, interp) {
    const key = String(name ?? "").trim().toLowerCase();
    if (key === "") {
        return { ok: false, message: "§cName the gradient, e.g. /we:gradient start mymix." };
    }
    pendingCaptures.set(player.name, { key, type: type ?? "planar", interp: interp ?? "linear" });
    return { ok: true, message: "§aBuilding gradient §f#" + key + "§a (" + (type ?? "planar") + ", " + (interp ?? "linear") + "). Add blocks to your inventory in low-to-high order (count widens a band), then /we:gradient stop." };
}

/**
 * Locks in the armed gradient by scanning the inventory into ordered bands and
 * saving it with its projection type and interpolation. Requires a prior start.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function stopGradient(player) {
    const pending = pendingCaptures.get(player.name);
    if (!pending) {
        return { ok: false, message: "§cNothing to lock in. Use /we:gradient start <name> first." };
    }
    const scan = scanInventory(player);
    if (!scan.ok) {
        return scan;
    }
    pendingCaptures.delete(player.name);
    const map = loadGradients(player);
    map[pending.key] = { bands: scan.bands, type: pending.type, interp: pending.interp };
    storeGradients(player, map);
    return { ok: true, message: "§aPalette §f#" + pending.key + "§a locked in: §b" + scan.label + "§a (" + pending.type + ", " + pending.interp + "). Use §f#" + pending.key + "§a as the block in any e-command or /we:ebrush - it always places as ordered layers." };
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
    const lines = names.map((name) => {
        const cfg = normalizeConfig(map[name]);
        return "§f#" + name + "§7 (" + cfg.type + "/" + cfg.interp + "): §b" + bandsLabel(cfg.bands);
    });
    return { ok: true, message: "§6Gradients:\n" + lines.join("\n") };
}

/**
 * Normalizes a stored gradient value into a {bands, type, interp} config,
 * accepting the legacy bare-bands array (planar/linear defaults) or null.
 * @param {*} value The stored gradient value.
 * @returns {{bands: {id: string, weight: number}[], type: string, interp: string}|null} The config, or null.
 */
function normalizeConfig(value) {
    if (Array.isArray(value)) {
        return { bands: value, type: "planar", interp: "linear" };
    }
    if (value && Array.isArray(value.bands)) {
        return { bands: value.bands, type: value.type ?? "planar", interp: value.interp ?? "linear" };
    }
    return null;
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
 * Returns a player's saved gradients as name-and-config entries.
 * @param {Player} player The owning player.
 * @returns {{name: string, bands: {id: string, weight: number}[], type: string, interp: string, label: string}[]} The gradient entries.
 */
function gradientEntries(player) {
    const map = loadGradients(player);
    const out = [];
    for (const name of Object.keys(map)) {
        const cfg = normalizeConfig(map[name]);
        if (cfg) {
            out.push({ name, bands: cfg.bands, type: cfg.type, interp: cfg.interp, label: bandsLabel(cfg.bands) });
        }
    }
    return out;
}

/**
 * Returns a player's gradient config by name, loading from persistence on a
 * cache miss.
 * @param {string} playerName The owning player's name.
 * @param {string} name The gradient name.
 * @returns {{bands: {id: string, weight: number}[], type: string, interp: string}|null} The config, or null.
 */
function gradientConfig(playerName, name) {
    let map = gradientCache.get(playerName);
    if (!map) {
        const player = world.getAllPlayers().find((p) => p.name === playerName);
        if (!player) {
            return null;
        }
        map = loadGradients(player);
    }
    return normalizeConfig(map[String(name).trim().toLowerCase()]);
}

/**
 * Returns a player's gradient bands by name, or null.
 * @param {string} playerName The owning player's name.
 * @param {string} name The gradient name.
 * @returns {{id: string, weight: number}[]|null} The bands, or null.
 */
function gradientBands(playerName, name) {
    const cfg = gradientConfig(playerName, name);
    return cfg ? cfg.bands : null;
}

setGradientResolver(gradientConfig);

export { startGradient, stopGradient, deleteGradient, listGradients, gradientEntries, gradientBands, gradientConfig };
