import { EquipmentSlot, GameMode, ItemTypes, Player, PlayerPermissionLevel, ItemStack } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { parsePattern, patternErrorMessage, setPatternPlayer, shortName } from "./common.js";
import { sphereRuns } from "../shapes/sphere.js";
import { cylinderRuns } from "../shapes/cylinder.js";
import { runBrushFill } from "../operations/brushfill.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const TOOL_SUFFIXES = ["_sword", "_pickaxe", "_axe", "_shovel", "_hoe"];
const TOOL_KEY = "we:tools";

const toolCache = new Map();

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
 * Binds a paint, replace, or erase tool to a tool item. Paint and replace take
 * a block or pattern and act only on the top-most block of each column in the
 * radius, unlike a brush which fills a whole sphere. Erase clears the sphere.
 * @param {Player} player The acting player.
 * @param {string} kind The tool kind ("paint", "replace", or "erase").
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
 * Applies the tool bound to a used item at the block the player is looking
 * at. Tools bypass the busy guard so they can be used continuously. Paint and
 * replace act on surfaces; erase clears; brushes place shapes. Patterns may be
 * "#name" gradients. Does nothing without a tool or outside creative op.
 * @param {Player} player The player who used the item.
 * @param {ItemStack} itemStack The used item.
 * @returns {void}
 */
function applyBrush(player, itemStack) {
    const tools = loadTools(player);
    const tool = tools[itemStack.typeId];
    if (!tool || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    setPatternPlayer(player.name);
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false });
    if (!hit) {
        player.onScreenDisplay.setActionBar("§cNo block in sight.");
        return;
    }
    const target = hit.block.location;
    const matchId = tool.kind === "replace" ? hit.block.typeId : null;
    const pattern = parsePattern(tool.blockText);
    if (!pattern) {
        player.onScreenDisplay.setActionBar("§cTool block is invalid.");
        return;
    }
    const label = (tool.kind === "erase" ? "Erase" : tool.kind === "paint" ? "Paint" : tool.kind === "replace" ? "Replace" : "Brush") + " §b" + pattern.label;
    const runs = tool.topOnly
        ? topColumnRuns(player.dimension, target, tool.radius)
        : (tool.shape === "cylinder" ? cylinderRuns(target, tool.radius, tool.height, tool.hollow) : sphereRuns(target, tool.radius, tool.hollow));
    runBrushFill(player, player.dimension, runs, pattern, tool.includeAir, label, { matchId, surfaceOnly: false });
}

/**
 * Builds one-block runs at the top-most solid block of each column within a
 * horizontal radius of the target, scanning from just above the target down.
 * @param {import("@minecraft/server").Dimension} dimension The dimension to read.
 * @param {{x: number, y: number, z: number}} target The center block location.
 * @param {number} radius The horizontal radius.
 * @returns {{x: number, y: number, z: number, length: number}[]} The surface runs.
 */
function topColumnRuns(dimension, target, radius) {
    const runs = [];
    const r2 = (radius + 0.5) * (radius + 0.5);
    const top = target.y + radius + 1;
    const bottom = target.y - radius - 1;
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dz * dz > r2) {
                continue;
            }
            const x = target.x + dx;
            const z = target.z + dz;
            for (let y = top; y >= bottom; y--) {
                const block = dimension.isChunkLoaded({ x, y, z }) ? dimension.getBlock({ x, y, z }) : undefined;
                if (block && !block.isAir) {
                    runs.push({ x, y, z, length: 1 });
                    break;
                }
            }
        }
    }
    return runs;
}

/**
 * Returns a player's bound tools as item-id and description entries for
 * display.
 * @param {Player} player The owning player.
 * @returns {{item: string, kind: string, detail: string}[]} The tool entries.
 */
function toolEntries(player) {
    const tools = loadTools(player);
    return Object.keys(tools).map((item) => {
        const tool = tools[item];
        let detail;
        if (tool.kind === "brush") {
            detail = tool.shape + " r" + tool.radius + " " + tool.blockText;
        } else if (tool.kind === "erase") {
            detail = "r" + tool.radius;
        } else {
            detail = "r" + tool.radius + " " + tool.blockText;
        }
        return { item: shortName(item), kind: tool.kind, detail };
    });
}

export { bindBrush, bindPaint, unbindBrush, applyBrush, toolEntries };
