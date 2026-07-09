import { system, EquipmentSlot, GameMode, ItemTypes, Player, PlayerPermissionLevel, ItemStack } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { parsePattern, patternErrorMessage, setPatternPlayer, shortName } from "./common.js";
import { sphereRuns } from "../shapes/sphere.js";
import { cylinderRuns } from "../shapes/cylinder.js";
import { runBrushFill } from "../operations/brushfill.js";
import { runTerrainBrush } from "../operations/terrain.js";
import { gradientBands } from "./gradient.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const TOOL_SUFFIXES = ["_sword", "_pickaxe", "_axe", "_shovel", "_hoe"];
const TOOL_KEY = "we:tools";
const CONFIG_KEY = "we:brushconfigs";
const LOOP_INTERVAL_TICKS = 1;

const toolCache = new Map();
const configCache = new Map();
const loops = new Map();

/**
 * @typedef {{kind: string, shape: string, blockText: string, radius: number, height: number, hollow: boolean, includeAir: boolean, surfaceOnly: boolean}} ToolDef
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
 * Loads a player's persisted tool map into the cache, keyed by item id.
 * @param {Player} player The owning player.
 * @returns {Object<string, ToolDef>} The item-to-tool map.
 */
function loadTools(player) {
    let tools = toolCache.get(player.name);
    if (!tools) {
        tools = loadPlayerData(player, TOOL_KEY, {});
        toolCache.set(player.name, tools);
    }
    return tools;
}

/**
 * Binds a tool to an item and persists it.
 * @param {Player} player The owning player.
 * @param {string} itemId The item id to bind to.
 * @param {ToolDef} tool The tool definition.
 * @returns {void}
 */
function saveTool(player, itemId, tool) {
    const tools = loadTools(player);
    tools[itemId] = tool;
    savePlayerData(player, TOOL_KEY, tools);
}

/**
 * Returns whether an item id is a tool item (sword, pickaxe, axe, shovel, hoe).
 * @param {string} itemId The item type id.
 * @returns {boolean} True for tools.
 */
function isToolItem(itemId) {
    return TOOL_SUFFIXES.some((suffix) => itemId.endsWith(suffix));
}

/**
 * Resolves the item a tool binds to: an explicit id when given, else the held
 * item. Validates it is an allowed tool item and not the wand.
 * @param {Player} player The acting player.
 * @param {string} itemText An item id, or empty to use the held item.
 * @returns {{ok: true, itemId: string}|{ok: false, message: string}} The item id or a failure.
 */
function resolveToolItem(player, itemText) {
    const trimmed = String(itemText ?? "").trim().toLowerCase();
    let itemId;
    if (trimmed === "") {
        itemId = heldItemId(player);
    } else {
        const full = trimmed.includes(":") ? trimmed : "minecraft:" + trimmed;
        itemId = ItemTypes.get(full) ? full : null;
    }
    if (!itemId) {
        return { ok: false, message: "§cHold a tool or enter a valid tool item id." };
    }
    if (itemId === WE_CONFIG.wandItemId) {
        return { ok: false, message: "§cThe selection wand cannot be a tool." };
    }
    if (!isToolItem(itemId)) {
        return { ok: false, message: "§cTools only bind to a sword, pickaxe, axe, shovel, or hoe." };
    }
    return { ok: true, itemId };
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
    const resolved = resolveToolItem(player, itemText);
    if (!resolved.ok) {
        return resolved;
    }
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const r = Math.min(Math.max(1, Math.floor(radius)), WE_CONFIG.brushMaxRadius);
    saveTool(player, resolved.itemId, { kind: "brush", shape, blockText, radius: r, height: Math.floor(height), hollow: Boolean(hollow), includeAir: Boolean(includeAir), topOnly: false });
    const label = (shape === "cylinder" ? "Cylinder" : "Sphere") + " brush (radius " + r + ", §b" + pattern.label + "§a)";
    return { ok: true, message: "§a" + label + " bound to §f" + shortName(resolved.itemId) + "§a. Use the tool on a block." };
}

/**
 * Binds a paint or erase tool to a tool item. Paint replaces the exposed
 * surface facing the viewer within the radius with a block or pattern, unlike
 * a brush which fills a whole sphere. Erase clears the sphere.
 * @param {Player} player The acting player.
 * @param {string} kind The tool kind ("paint" or "erase").
 * @param {string} blockText The block id or pattern, ignored for erase.
 * @param {number} radius The paint radius.
 * @param {string} itemText A tool item id, or empty to use the held item.
 * @returns {ActionResult} The result.
 */
function bindPaint(player, kind, blockText, radius, itemText) {
    const resolved = resolveToolItem(player, itemText);
    if (!resolved.ok) {
        return resolved;
    }
    let text = blockText;
    if (kind === "erase") {
        text = "air";
    } else {
        const pattern = parsePattern(blockText);
        if (!pattern) {
            return { ok: false, message: patternErrorMessage(blockText) };
        }
    }
    const r = Math.min(Math.max(1, Math.floor(radius)), WE_CONFIG.brushMaxRadius);
    saveTool(player, resolved.itemId, { kind, shape: "sphere", blockText: text, radius: r, height: 1, hollow: false, includeAir: kind === "erase", topOnly: kind !== "erase" });
    return { ok: true, message: "§a" + kind + " tool (radius " + r + ") bound to §f" + shortName(resolved.itemId) + "§a." };
}

/**
 * Binds a terrain sculpt tool to a tool item. Each use raises, lowers,
 * flattens, or smooths the surface around the looked-at block with a cosine
 * falloff; repeated uses on the same spot stack, building hills seamlessly.
 * @param {Player} player The acting player.
 * @param {string} mode The mode ("raise", "lower", "flatten", or "smooth").
 * @param {number} radius The brush radius.
 * @param {number} strength The peak height change at the center.
 * @param {string} itemText A tool item id, or empty to use the held item.
 * @returns {ActionResult} The result.
 */
function bindTerrain(player, mode, radius, strength, itemText) {
    const resolved = resolveToolItem(player, itemText);
    if (!resolved.ok) {
        return resolved;
    }
    const r = Math.min(Math.max(1, Math.floor(radius)), WE_CONFIG.brushMaxRadius);
    const s = Math.max(1, Math.floor(strength));
    saveTool(player, resolved.itemId, { kind: "terrain", mode, radius: r, strength: s, blockText: "", height: 1, hollow: false, includeAir: false });
    return { ok: true, message: "§aTerrain " + mode + " tool (radius " + r + ", strength " + s + ") bound to §f" + shortName(resolved.itemId) + "§a." };
}

/**
 * Removes the tool bound to the player's held item.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function unbindBrush(player) {
    const itemId = heldItemId(player);
    if (!itemId) {
        return { ok: false, message: "§cHold the tool item first." };
    }
    const tools = loadTools(player);
    if (!(itemId in tools)) {
        return { ok: false, message: "§cNo tool bound to §f" + shortName(itemId) + "§c." };
    }
    delete tools[itemId];
    savePlayerData(player, TOOL_KEY, Object.keys(tools).length > 0 ? tools : undefined);
    return { ok: true, message: "§aTool removed from §f" + shortName(itemId) + "§a." };
}

/**
 * Applies the bound tool once at the block the player looks at. Terrain tools
 * sculpt the surface; brushes place shapes; paint acts on the exposed face;
 * erase clears. Does nothing without a bound tool or outside creative op.
 * @param {Player} player The player who used the item.
 * @param {ItemStack} itemStack The used item.
 * @returns {void}
 */
function applyToolClick(player, itemStack) {
    if (itemStack.typeId === WE_CONFIG.wandItemId) {
        return;
    }
    const tool = loadTools(player)[itemStack.typeId];
    if (!tool || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false });
    if (!hit) {
        player.onScreenDisplay.setActionBar("§cNo block in sight.");
        return;
    }
    if (tool.kind === "terrain") {
        runTerrainBrush(player, player.dimension, hit.block.location, tool.radius, tool.strength, tool.mode);
        return;
    }
    applyToolAt(player, tool, hit.block.location, player.getViewDirection());
}

/**
 * Toggles a loop that re-applies the currently held tool every few ticks. The
 * tool fires wherever the player looks; it stops on toggle, on leaving creative
 * op, or when the held item's tool is put away.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function toggleLoopBrush(player) {
    const active = loops.get(player.name);
    if (active) {
        system.clearRun(active);
        loops.delete(player.name);
        return { ok: true, message: "§7Loop brush off." };
    }
    const itemId = heldItemId(player);
    if (!itemId || !(itemId in loadTools(player))) {
        return { ok: false, message: "§cHold a bound tool first." };
    }
    const intervalId = system.runInterval(() => loopTick(player, itemId), LOOP_INTERVAL_TICKS);
    loops.set(player.name, intervalId);
    return { ok: true, message: "§aLoop brush on. Hold the tool and look; run again to stop." };
}

/**
 * Advances a loop-brush step: re-applies the tool if the player still holds it
 * in creative op, otherwise stops the loop.
 * @param {Player} player The looping player.
 * @param {string} itemId The tool item id the loop is bound to.
 * @returns {void}
 */
function loopTick(player, itemId) {
    const loopId = loops.get(player.name);
    const tool = loadTools(player)[itemId];
    if (!player.isValid || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator || heldItemId(player) !== itemId || !tool) {
        if (loopId !== undefined) {
            system.clearRun(loopId);
        }
        loops.delete(player.name);
        return;
    }
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false });
    if (!hit) {
        return;
    }
    if (tool.kind === "terrain") {
        runTerrainBrush(player, player.dimension, hit.block.location, tool.radius, tool.strength, tool.mode);
        return;
    }
    applyToolAt(player, tool, hit.block.location, player.getViewDirection());
}

/**
 * Applies a tool at a single target cell. Paint acts on the exposed face toward
 * the viewer; erase clears; brushes place their shape. Patterns may be "#name"
 * gradients.
 * @param {Player} player The acting player.
 * @param {object} tool The tool definition.
 * @param {{x: number, y: number, z: number}} target The target cell.
 * @param {{x: number, y: number, z: number}} view The player's view direction.
 * @returns {void}
 */
function applyToolAt(player, tool, target, view) {
    setPatternPlayer(player.name);
    if (tool.kind === "gradient") {
        applyGradientBrush(player, tool, target, view);
        return;
    }
    const pattern = parsePattern(tool.blockText);
    if (!pattern) {
        player.onScreenDisplay.setActionBar("§cTool block is invalid.");
        return;
    }
    const label = (tool.kind === "erase" ? "Erase" : tool.kind === "paint" ? "Paint" : "Brush") + " §b" + pattern.label;
    const runs = tool.topOnly
        ? facingSurfaceRuns(player.dimension, target, tool.radius, view)
        : (tool.shape === "cylinder" ? cylinderRuns(target, tool.radius, tool.height, tool.hollow) : sphereRuns(target, tool.radius, tool.hollow));
    runBrushFill(player, player.dimension, runs, pattern, tool.includeAir, label, { surfaceOnly: false });
}

/**
 * Returns the band block id for a spatial fraction (0 to 1) through gradient
 * bands, each band occupying a share of the range proportional to its weight.
 * @param {{id: string, weight: number}[]} bands The gradient bands.
 * @param {number} t The spatial fraction from 0 to 1.
 * @returns {string} The chosen block id.
 */
function bandAt(bands, t) {
    let total = 0;
    for (const band of bands) {
        total += band.weight;
    }
    let cut = Math.max(0, Math.min(1, t)) * total;
    for (const band of bands) {
        cut -= band.weight;
        if (cut < 0) {
            return band.id;
        }
    }
    return bands[bands.length - 1].id;
}

/**
 * Applies a gradient at the target: each cell's block is chosen by its height
 * within the brush (bottom to top) mapped through the gradient bands, forming
 * an ordered vertical transition. Brush mode fills the whole sphere; paint mode
 * only recolors the exposed surface facing the viewer. Cells are grouped by
 * block so the stroke is one fill per distinct block.
 * @param {Player} player The acting player.
 * @param {object} tool The gradient tool definition.
 * @param {{x: number, y: number, z: number}} target The target cell.
 * @param {{x: number, y: number, z: number}} view The player's view direction.
 * @returns {void}
 */
function applyGradientBrush(player, tool, target, view) {
    const bands = gradientBands(player.name, tool.gradient);
    if (!bands) {
        player.onScreenDisplay.setActionBar("§cGradient #" + tool.gradient + " is gone.");
        return;
    }
    const cells = tool.topOnly
        ? facingSurfaceRuns(player.dimension, target, tool.radius, view)
        : sphereRuns(target, tool.radius, false);
    const span = tool.radius * 2;
    const byBlock = new Map();
    for (const run of cells) {
        const t = span > 0 ? (run.y - (target.y - tool.radius)) / span : 0;
        const id = bandAt(bands, t);
        let group = byBlock.get(id);
        if (!group) {
            group = [];
            byBlock.set(id, group);
        }
        group.push({ x: run.x, y: run.y, z: run.z, length: run.length });
    }
    for (const [id, runs] of byBlock.entries()) {
        runBrushFill(player, player.dimension, runs, parsePattern(id), true, "Gradient §b#" + tool.gradient);
    }
}

/**
 * Returns the unit face normal pointing back toward the viewer along the
 * dominant axis of their view: the visible face direction of surfaces.
 * @param {{x: number, y: number, z: number}} view The player's view direction.
 * @returns {{x: number, y: number, z: number}} The face normal.
 */
function facingNormal(view) {
    const ax = Math.abs(view.x);
    const ay = Math.abs(view.y);
    const az = Math.abs(view.z);
    if (ay >= ax && ay >= az) {
        return { x: 0, y: view.y > 0 ? -1 : 1, z: 0 };
    }
    if (ax >= az) {
        return { x: view.x > 0 ? -1 : 1, y: 0, z: 0 };
    }
    return { x: 0, y: 0, z: view.z > 0 ? -1 : 1 };
}

/**
 * Builds one-block runs for every solid cell within a radius of the target
 * whose neighbor toward the viewer is air, i.e. the exposed face facing the
 * player. Paints walls, floors, or ceilings depending on view direction.
 * @param {import("@minecraft/server").Dimension} dimension The dimension to read.
 * @param {{x: number, y: number, z: number}} target The center block location.
 * @param {number} radius The paint radius.
 * @param {{x: number, y: number, z: number}} view The player's view direction.
 * @returns {{x: number, y: number, z: number, length: number}[]} The surface runs.
 */
function facingSurfaceRuns(dimension, target, radius, view) {
    const normal = facingNormal(view);
    const r2 = (radius + 0.5) * (radius + 0.5);
    const runs = [];
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx * dx + dy * dy + dz * dz > r2) {
                    continue;
                }
                const loc = { x: target.x + dx, y: target.y + dy, z: target.z + dz };
                if (!dimension.isChunkLoaded(loc)) {
                    continue;
                }
                const block = dimension.getBlock(loc);
                if (!block || block.isAir) {
                    continue;
                }
                if (isExposedToward(dimension, loc, normal)) {
                    runs.push({ x: loc.x, y: loc.y, z: loc.z, length: 1 });
                }
            }
        }
    }
    return runs;
}

/**
 * Loads a player's saved brush configs (name to tool def) into the cache.
 * @param {Player} player The owning player.
 * @returns {Object<string, object>} The name-to-config map.
 */
function loadConfigs(player) {
    let map = configCache.get(player.name);
    if (!map) {
        map = loadPlayerData(player, CONFIG_KEY, {});
        configCache.set(player.name, map);
    }
    return map;
}

/**
 * Persists a player's brush config map and refreshes the cache.
 * @param {Player} player The owning player.
 * @param {Object<string, object>} map The name-to-config map.
 * @returns {void}
 */
function storeConfigs(player, map) {
    configCache.set(player.name, map);
    savePlayerData(player, CONFIG_KEY, Object.keys(map).length > 0 ? map : undefined);
}

/**
 * Saves the tool currently bound to the player's held item as a named brush
 * config for later binding to other items.
 * @param {Player} player The owning player.
 * @param {string} name The config name.
 * @returns {ActionResult} The result.
 */
function saveConfig(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    if (key === "") {
        return { ok: false, message: "§cName the config, e.g. /we:bind save mybrush." };
    }
    const itemId = heldItemId(player);
    const tool = itemId ? loadTools(player)[itemId] : undefined;
    if (!tool) {
        return { ok: false, message: "§cHold a bound tool to save its config." };
    }
    const map = loadConfigs(player);
    map[key] = tool;
    storeConfigs(player, map);
    return { ok: true, message: "§aSaved brush config §f" + key + "§a from §f" + shortName(itemId) + "§a." };
}

/**
 * Deletes a saved brush config.
 * @param {Player} player The owning player.
 * @param {string} name The config name.
 * @returns {ActionResult} The result.
 */
function deleteConfig(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    const map = loadConfigs(player);
    if (!(key in map)) {
        return { ok: false, message: "§cNo brush config named §f" + key + "§c." };
    }
    delete map[key];
    storeConfigs(player, map);
    return { ok: true, message: "§aBrush config §f" + key + "§a deleted." };
}

/**
 * Returns a player's saved brush configs as name-and-detail entries.
 * @param {Player} player The owning player.
 * @returns {{name: string, detail: string}[]} The config entries.
 */
function configEntries(player) {
    const map = loadConfigs(player);
    return Object.keys(map).map((name) => ({ name, detail: toolDetail(map[name]) }));
}

/**
 * Binds a saved brush config to the player's held tool item.
 * @param {Player} player The acting player.
 * @param {string} name The config name.
 * @returns {ActionResult} The result.
 */
function bindConfig(player, name) {
    const resolved = resolveToolItem(player, "");
    if (!resolved.ok) {
        return resolved;
    }
    const config = loadConfigs(player)[String(name).trim().toLowerCase()];
    if (!config) {
        return { ok: false, message: "§cNo brush config named §f" + name + "§c." };
    }
    saveTool(player, resolved.itemId, { ...config });
    return { ok: true, message: "§aBound config §f" + name + "§a to §f" + shortName(resolved.itemId) + "§a." };
}

/**
 * Binds a saved gradient to the held tool item. In brush mode it fills the
 * whole sphere; in paint mode it only recolors the exposed surface facing the
 * viewer. Either way blocks form the ordered vertical transition.
 * @param {Player} player The acting player.
 * @param {string} gradientName The gradient name.
 * @param {number} radius The brush radius.
 * @param {string} mode The apply mode ("brush" or "paint").
 * @returns {ActionResult} The result.
 */
function bindGradient(player, gradientName, radius, mode) {
    const resolved = resolveToolItem(player, "");
    if (!resolved.ok) {
        return resolved;
    }
    const key = String(gradientName).trim().toLowerCase();
    if (!gradientBands(player.name, key)) {
        return { ok: false, message: "§cNo gradient named §f#" + key + "§c." };
    }
    const r = Math.min(Math.max(1, Math.floor(radius)), WE_CONFIG.brushMaxRadius);
    const paint = mode === "paint";
    saveTool(player, resolved.itemId, { kind: "gradient", gradient: key, shape: "sphere", blockText: "", radius: r, height: 1, hollow: false, includeAir: true, topOnly: paint });
    return { ok: true, message: "§aBound gradient §f#" + key + "§a (" + (paint ? "paint" : "brush") + ", radius " + r + ") to §f" + shortName(resolved.itemId) + "§a." };
}

/**
 * Removes every tool bound to any of the player's items.
 * @param {Player} player The owning player.
 * @returns {ActionResult} The result.
 */
function clearAllTools(player) {
    const tools = loadTools(player);
    const count = Object.keys(tools).length;
    if (count === 0) {
        return { ok: false, message: "§cNo tools are bound." };
    }
    toolCache.set(player.name, {});
    savePlayerData(player, TOOL_KEY, undefined);
    return { ok: true, message: "§aCleared §f" + count + "§a bound tool(s)." };
}

/**
 * Returns whether a cell is exposed on the viewer's side: its neighbor along
 * the facing normal is air, or any face perpendicular to that axis is air.
 * Testing the perpendicular faces too means corner and edge blocks, which are
 * solid along the normal but open to the side, still count as surface.
 * @param {import("@minecraft/server").Dimension} dimension The dimension to read.
 * @param {{x: number, y: number, z: number}} loc The cell location.
 * @param {{x: number, y: number, z: number}} normal The facing normal.
 * @returns {boolean} True when the cell is exposed toward the viewer.
 */
function isExposedToward(dimension, loc, normal) {
    const neighbors = [normal];
    if (normal.x !== 0) {
        neighbors.push({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 });
    } else if (normal.y !== 0) {
        neighbors.push({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 });
    } else {
        neighbors.push({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 });
    }
    for (const off of neighbors) {
        const n = { x: loc.x + off.x, y: loc.y + off.y, z: loc.z + off.z };
        const block = dimension.isChunkLoaded(n) ? dimension.getBlock(n) : undefined;
        if (!block || block.isAir) {
            return true;
        }
    }
    return false;
}

/**
 * Returns a short description of a tool config's kind and settings.
 * @param {object} tool The tool definition.
 * @returns {string} The detail string.
 */
function toolDetail(tool) {
    if (tool.kind === "brush") {
        return tool.shape + " r" + tool.radius + " " + tool.blockText;
    }
    if (tool.kind === "erase") {
        return "r" + tool.radius;
    }
    if (tool.kind === "terrain") {
        return tool.mode + " r" + tool.radius + " s" + tool.strength;
    }
    if (tool.kind === "gradient") {
        return "#" + tool.gradient + " r" + tool.radius;
    }
    return "r" + tool.radius + " " + tool.blockText;
}

/**
 * Returns a player's bound tools as item-id and description entries for
 * display.
 * @param {Player} player The owning player.
 * @returns {{item: string, kind: string, detail: string}[]} The tool entries.
 */
function toolEntries(player) {
    const tools = loadTools(player);
    return Object.keys(tools).map((item) => ({ item: shortName(item), kind: tools[item].kind, detail: toolDetail(tools[item]) }));
}

export { bindBrush, bindPaint, bindTerrain, unbindBrush, clearAllTools, saveConfig, deleteConfig, configEntries, bindConfig, bindGradient, applyToolClick, toggleLoopBrush, toolEntries };
