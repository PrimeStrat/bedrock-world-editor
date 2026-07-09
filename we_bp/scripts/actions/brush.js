import { system, EquipmentSlot, GameMode, ItemTypes, Player, PlayerPermissionLevel, ItemStack } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { parsePattern, patternErrorMessage, setPatternPlayer, shortName } from "./common.js";
import { sphereRuns } from "../shapes/sphere.js";
import { cylinderRuns } from "../shapes/cylinder.js";
import { runBrushFill } from "../operations/brushfill.js";
import { runTerrainBrush } from "../operations/terrain.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const TOOL_SUFFIXES = ["_sword", "_pickaxe", "_axe", "_shovel", "_hoe"];
const TOOL_KEY = "we:tools";
const STROKE_INTERVAL_TICKS = 4;

const toolCache = new Map();
const strokes = new Map();

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
 * Toggles a continuous tool stroke for a used item. When starting, the bound
 * tool applies every few ticks at the block the player looks at, connecting
 * consecutive positions so the stroke has no gaps. Using any tool item again
 * stops the stroke. Does nothing without a bound tool or outside creative op.
 * @param {Player} player The player who used the item.
 * @param {ItemStack} itemStack The used item.
 * @returns {void}
 */
function toggleTool(player, itemStack) {
    const active = strokes.get(player.name);
    if (active) {
        system.clearRun(active.intervalId);
        strokes.delete(player.name);
        player.onScreenDisplay.setActionBar("§7Tool off.");
        return;
    }
    const tools = loadTools(player);
    const tool = tools[itemStack.typeId];
    if (!tool || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    if (tool.kind === "terrain") {
        applyTerrainClick(player, tool);
        return;
    }
    const state = { itemId: itemStack.typeId, last: null, intervalId: 0 };
    state.intervalId = system.runInterval(() => strokeTick(player, state), STROKE_INTERVAL_TICKS);
    strokes.set(player.name, state);
    player.onScreenDisplay.setActionBar("§aTool on. Look to paint; use the item again to stop.");
}

/**
 * Applies a terrain sculpt tool once at the block the player looks at. Called
 * per use so repeated clicks stack.
 * @param {Player} player The acting player.
 * @param {object} tool The terrain tool definition.
 * @returns {void}
 */
function applyTerrainClick(player, tool) {
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false });
    if (!hit) {
        player.onScreenDisplay.setActionBar("§cNo terrain in sight.");
        return;
    }
    runTerrainBrush(player, player.dimension, hit.block.location, tool.radius, tool.strength, tool.mode);
}

/**
 * Advances a tool stroke one step: raycasts to the looked-at block, applies
 * the tool there, and interpolates from the previous step so quick turns leave
 * no gap. Stops the stroke if the player leaves creative op or holds a
 * different item.
 * @param {Player} player The stroking player.
 * @param {object} state The stroke state.
 * @returns {void}
 */
function strokeTick(player, state) {
    if (!player.isValid || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator || heldItemId(player) !== state.itemId) {
        system.clearRun(state.intervalId);
        strokes.delete(player.name);
        return;
    }
    const tool = loadTools(player)[state.itemId];
    if (!tool) {
        system.clearRun(state.intervalId);
        strokes.delete(player.name);
        return;
    }
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false });
    if (!hit) {
        return;
    }
    const target = hit.block.location;
    if (state.last && state.last.x === target.x && state.last.y === target.y && state.last.z === target.z) {
        return;
    }
    for (const point of strokePoints(state.last, target)) {
        applyToolAt(player, tool, point, player.getViewDirection());
    }
    state.last = { x: target.x, y: target.y, z: target.z };
}

/**
 * Returns the block cells along the line from the previous stroke point to the
 * current target (exclusive of the previous), so a fast-moving stroke fills the
 * whole path. Returns just the target when there is no previous point.
 * @param {{x: number, y: number, z: number}|null} from The previous point.
 * @param {{x: number, y: number, z: number}} to The current point.
 * @returns {{x: number, y: number, z: number}[]} The path cells.
 */
function strokePoints(from, to) {
    if (!from) {
        return [to];
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (steps <= 1) {
        return [to];
    }
    const points = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        points.push({ x: Math.round(from.x + dx * t), y: Math.round(from.y + dy * t), z: Math.round(from.z + dz * t) });
    }
    return points;
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
                const front = { x: loc.x + normal.x, y: loc.y + normal.y, z: loc.z + normal.z };
                const frontBlock = dimension.isChunkLoaded(front) ? dimension.getBlock(front) : undefined;
                if (!frontBlock || frontBlock.isAir) {
                    runs.push({ x: loc.x, y: loc.y, z: loc.z, length: 1 });
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
        } else if (tool.kind === "terrain") {
            detail = tool.mode + " r" + tool.radius + " s" + tool.strength;
        } else {
            detail = "r" + tool.radius + " " + tool.blockText;
        }
        return { item: shortName(item), kind: tool.kind, detail };
    });
}

export { bindBrush, bindPaint, bindTerrain, unbindBrush, toggleTool, toolEntries };
