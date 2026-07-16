import { system, EquipmentSlot, GameMode, ItemStack, Player, PlayerPermissionLevel } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { parsePattern, patternErrorMessage, setPatternPlayer, shortName } from "./common.js";
import { sphereRuns } from "../shapes/sphere.js";
import { cylinderRuns } from "../shapes/cylinder.js";
import { runBrushFill } from "../operations/brushfill.js";
import { runTerrainBrush } from "../operations/terrain.js";
import { gradientBands } from "./gradient.js";
import { loadPlayerData, savePlayerData } from "../persist.js";

const BRUSH_ITEM = "we:brush";
const TERRAIN_ITEM = "we:terrain_builder";
const PRESET_KEY = "we:brushpresets";
const EQUIP_KEY = "we:equipped";
const TERRAIN_KEY = "we:terrainmode";
const STROKE_INTERVAL_TICKS = 2;

const presetCache = new Map();
const strokes = new Map();

/**
 * @typedef {{brushType: string, shape: string, blockText: string, radius: number, height: number, hollow: boolean, includeAir: boolean, surfaceOnly: boolean, gradient: string|null}} BrushPreset
 * @typedef {{mode: string, radius: number, strength: number}} TerrainMode
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
 * Gives the player one of an item if their inventory holds none, so a setter
 * command always leaves them with the tool it configures.
 * @param {Player} player The player.
 * @param {string} itemId The item id to ensure.
 * @returns {boolean} True when an item was newly given.
 */
function ensureItem(player, itemId) {
    const inv = player.getComponent("minecraft:inventory");
    const container = inv ? inv.container : undefined;
    if (!container) {
        return false;
    }
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId === itemId) {
            return false;
        }
    }
    container.addItem(new ItemStack(itemId, 1));
    return true;
}

/**
 * Loads a player's saved brush presets (name to preset) into the cache.
 * @param {Player} player The owning player.
 * @returns {Object<string, BrushPreset>} The name-to-preset map.
 */
function loadPresets(player) {
    let map = presetCache.get(player.name);
    if (!map) {
        map = loadPlayerData(player, PRESET_KEY, {});
        presetCache.set(player.name, map);
    }
    return map;
}

/**
 * Persists a player's brush preset map and refreshes the cache.
 * @param {Player} player The owning player.
 * @param {Object<string, BrushPreset>} map The name-to-preset map.
 * @returns {void}
 */
function storePresets(player, map) {
    presetCache.set(player.name, map);
    savePlayerData(player, PRESET_KEY, Object.keys(map).length > 0 ? map : undefined);
}

/**
 * Clamps a radius to the configured brush range.
 * @param {number} radius The requested radius.
 * @returns {number} The clamped radius.
 */
function clampRadius(radius) {
    return Math.min(Math.max(1, Math.floor(radius)), WE_CONFIG.brushMaxRadius);
}

/**
 * Defines and saves a named brush preset, then gives the player the brush item.
 * Paint and gradient types only recolor the exposed surface; sculpt and noise
 * fill the whole shape.
 * @param {Player} player The acting player.
 * @param {string} name The preset name.
 * @param {string} brushType One of "sculpt", "paint", "erase", "gradient", "noise".
 * @param {string} shape The brush shape ("sphere" or "cylinder").
 * @param {string} blockText The block id or weighted pattern, or a "#gradient" name.
 * @param {number} radius The brush radius.
 * @param {number} height The cylinder height (ignored for spheres).
 * @param {boolean} hollow When true, only the shell is built.
 * @returns {ActionResult} The result.
 */
function saveBrushPreset(player, name, brushType, shape, blockText, radius, height, hollow) {
    const key = String(name ?? "").trim().toLowerCase();
    if (key === "") {
        return { ok: false, message: "§cName the brush, e.g. /we:brush hills sculpt sphere stone 4." };
    }
    let text = blockText;
    let gradient = null;
    if (brushType === "erase") {
        text = "air";
    } else if (brushType === "gradient") {
        gradient = String(blockText ?? "").replace(/^#/, "").trim().toLowerCase();
        if (!gradientBands(player.name, gradient)) {
            return { ok: false, message: "§cNo gradient named §f#" + gradient + "§c. Make one with /we:gradient." };
        }
        text = "";
    } else {
        const pattern = parsePattern(text);
        if (!pattern) {
            return { ok: false, message: patternErrorMessage(text) };
        }
    }
    const surfaceOnly = brushType === "paint" || brushType === "gradient";
    const preset = {
        brushType,
        shape,
        blockText: text,
        radius: clampRadius(radius),
        height: Math.max(1, Math.floor(height)),
        hollow: Boolean(hollow),
        includeAir: brushType === "erase",
        surfaceOnly,
        gradient
    };
    const map = loadPresets(player);
    map[key] = preset;
    storePresets(player, map);
    equipPreset(player, key);
    ensureItem(player, BRUSH_ITEM);
    return { ok: true, message: "§aBrush §f" + key + "§a saved and equipped: §b" + presetDetail(preset) + "§a. Hold the World Brush and right-click to paint." };
}

/**
 * Deletes a saved brush preset, unequipping it if it was equipped.
 * @param {Player} player The owning player.
 * @param {string} name The preset name.
 * @returns {ActionResult} The result.
 */
function deleteBrushPreset(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    const map = loadPresets(player);
    if (!(key in map)) {
        return { ok: false, message: "§cNo brush named §f" + key + "§c." };
    }
    delete map[key];
    storePresets(player, map);
    if (equippedName(player) === key) {
        savePlayerData(player, EQUIP_KEY, undefined);
    }
    return { ok: true, message: "§aBrush §f" + key + "§a deleted." };
}

/**
 * Returns the name of the player's currently equipped brush preset, or null.
 * @param {Player} player The owning player.
 * @returns {string|null} The equipped preset name.
 */
function equippedName(player) {
    return loadPlayerData(player, EQUIP_KEY, null);
}

/**
 * Equips a saved preset by name onto the World Brush item.
 * @param {Player} player The owning player.
 * @param {string} name The preset name.
 * @returns {void}
 */
function equipPreset(player, name) {
    savePlayerData(player, EQUIP_KEY, name);
}

/**
 * Equips a saved brush preset onto the World Brush, giving the item if needed.
 * @param {Player} player The acting player.
 * @param {string} name The preset name.
 * @returns {ActionResult} The result.
 */
function setBrush(player, name) {
    const key = String(name ?? "").trim().toLowerCase();
    const map = loadPresets(player);
    if (!(key in map)) {
        return { ok: false, message: "§cNo brush named §f" + key + "§c. See /we:setbrush." };
    }
    equipPreset(player, key);
    ensureItem(player, BRUSH_ITEM);
    return { ok: true, message: "§aEquipped brush §f" + key + "§a: §b" + presetDetail(map[key]) + "§a." };
}

/**
 * Clears the equipped brush so the World Brush does nothing until set again.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function clearBrush(player) {
    if (!equippedName(player)) {
        return { ok: false, message: "§cNo brush is equipped." };
    }
    savePlayerData(player, EQUIP_KEY, undefined);
    return { ok: true, message: "§aBrush cleared." };
}

/**
 * Returns a player's saved brush presets as name-and-detail entries.
 * @param {Player} player The owning player.
 * @returns {{name: string, detail: string, equipped: boolean}[]} The preset entries.
 */
function brushEntries(player) {
    const map = loadPresets(player);
    const equipped = equippedName(player);
    return Object.keys(map).map((name) => ({ name, detail: presetDetail(map[name]), equipped: name === equipped }));
}

/**
 * Equips a terrain mode onto the Terrain Builder, giving the item if needed.
 * Each right-click raises, lowers, flattens, or smooths the surface with a
 * cosine falloff; repeated clicks on a spot stack, building hills seamlessly.
 * @param {Player} player The acting player.
 * @param {string} mode One of "raise", "lower", "flatten", "smooth".
 * @param {number} radius The brush radius.
 * @param {number} strength The peak height change per click.
 * @returns {ActionResult} The result.
 */
function setTerrain(player, mode, radius, strength) {
    const config = { mode, radius: clampRadius(radius), strength: Math.max(1, Math.floor(strength)) };
    savePlayerData(player, TERRAIN_KEY, config);
    ensureItem(player, TERRAIN_ITEM);
    return { ok: true, message: "§aTerrain Builder set to §f" + mode + "§a (radius " + config.radius + ", strength " + config.strength + "). Hold it and right-click terrain." };
}

/**
 * Returns the player's equipped terrain mode, or a raise default.
 * @param {Player} player The owning player.
 * @returns {TerrainMode} The terrain mode config.
 */
function terrainMode(player) {
    return loadPlayerData(player, TERRAIN_KEY, { mode: "raise", radius: 4, strength: 2 });
}

/**
 * Handles the press of one of the editor tools: starts a repeating stroke that
 * runs while the player holds right-click. Ignored outside creative op or for
 * other items. Called from itemStartUse.
 * @param {Player} player The acting player.
 * @param {string} itemId The used item's type id.
 * @returns {void}
 */
function beginStroke(player, itemId) {
    if (itemId !== BRUSH_ITEM && itemId !== TERRAIN_ITEM) {
        return;
    }
    if (player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    endStroke(player.name);
    strokeTick(player, itemId);
    const intervalId = system.runInterval(() => {
        const acting = player.isValid ? player : null;
        if (!acting || heldItemId(acting) !== itemId) {
            endStroke(player.name);
            return;
        }
        strokeTick(acting, itemId);
    }, STROKE_INTERVAL_TICKS);
    strokes.set(player.name, intervalId);
}

/**
 * Stops a player's active tool stroke, if any. Called from itemStopUse and
 * itemReleaseUse.
 * @param {string} playerName The acting player's name.
 * @returns {void}
 */
function endStroke(playerName) {
    const id = strokes.get(playerName);
    if (id !== undefined) {
        system.clearRun(id);
        strokes.delete(playerName);
    }
}

/**
 * Applies one stroke step at the block the player looks at with the tool's
 * configuration.
 * @param {Player} player The acting player.
 * @param {string} itemId The tool item id.
 * @returns {void}
 */
function strokeTick(player, itemId) {
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: false });
    if (!hit) {
        return;
    }
    if (itemId === TERRAIN_ITEM) {
        const t = terrainMode(player);
        runTerrainBrush(player, player.dimension, hit.block.location, t.radius, t.strength, t.mode);
        return;
    }
    const name = equippedName(player);
    const preset = name ? loadPresets(player)[name] : null;
    if (!preset) {
        player.onScreenDisplay.setActionBar("§cNo brush equipped. Use /we:setbrush.");
        return;
    }
    applyBrush(player, preset, hit.block.location, player.getViewDirection());
}

/**
 * Applies a brush preset at a single target cell.
 * @param {Player} player The acting player.
 * @param {BrushPreset} preset The brush preset.
 * @param {{x: number, y: number, z: number}} target The target cell.
 * @param {{x: number, y: number, z: number}} view The player's view direction.
 * @returns {void}
 */
function applyBrush(player, preset, target, view) {
    setPatternPlayer(player.name);
    if (preset.brushType === "gradient") {
        applyGradientBrush(player, preset, target, view);
        return;
    }
    const pattern = parsePattern(preset.blockText);
    if (!pattern) {
        player.onScreenDisplay.setActionBar("§cBrush block is invalid.");
        return;
    }
    const label = presetLabel(preset.brushType) + " §b" + pattern.label;
    const runs = preset.surfaceOnly
        ? facingSurfaceRuns(player.dimension, target, preset.radius, view)
        : (preset.shape === "cylinder" ? cylinderRuns(target, preset.radius, preset.height, preset.hollow) : sphereRuns(target, preset.radius, preset.hollow));
    runBrushFill(player, player.dimension, runs, pattern, preset.includeAir, label, { surfaceOnly: false });
}

/**
 * Returns the band block id for a spatial fraction (0 to 1) through gradient
 * bands, each band's share proportional to its weight.
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
 * Applies a gradient brush: each cell's block comes from its height within the
 * brush mapped through the gradient bands, an ordered vertical transition.
 * Paint mode recolors only the exposed surface; sculpt fills the sphere.
 * @param {Player} player The acting player.
 * @param {BrushPreset} preset The gradient brush preset.
 * @param {{x: number, y: number, z: number}} target The target cell.
 * @param {{x: number, y: number, z: number}} view The player's view direction.
 * @returns {void}
 */
function applyGradientBrush(player, preset, target, view) {
    const bands = gradientBands(player.name, preset.gradient);
    if (!bands) {
        player.onScreenDisplay.setActionBar("§cGradient #" + preset.gradient + " is gone.");
        return;
    }
    const cells = preset.surfaceOnly
        ? facingSurfaceRuns(player.dimension, target, preset.radius, view)
        : sphereRuns(target, preset.radius, false);
    const span = preset.radius * 2;
    const byBlock = new Map();
    for (const run of cells) {
        const t = span > 0 ? (run.y - (target.y - preset.radius)) / span : 0;
        const id = bandAt(bands, t);
        let group = byBlock.get(id);
        if (!group) {
            group = [];
            byBlock.set(id, group);
        }
        group.push({ x: run.x, y: run.y, z: run.z, length: run.length });
    }
    for (const [id, runs] of byBlock.entries()) {
        runBrushFill(player, player.dimension, runs, parsePattern(id), true, "Gradient §b#" + preset.gradient);
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
 * Builds one-block runs for every solid cell within a radius whose neighbor
 * toward the viewer (or a perpendicular face) is air: the exposed surface
 * facing the player. Paints walls, floors, or ceilings by view direction.
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
 * Returns whether a cell is exposed on the viewer's side: its neighbor along
 * the facing normal is air, or any perpendicular face is air. Testing the
 * perpendicular faces means corner and edge blocks still count as surface.
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
 * Returns the display label for a brush type.
 * @param {string} brushType The brush type.
 * @returns {string} The label.
 */
function presetLabel(brushType) {
    if (brushType === "erase") {
        return "Erase";
    }
    if (brushType === "paint") {
        return "Paint";
    }
    if (brushType === "noise") {
        return "Noise";
    }
    return "Brush";
}

/**
 * Returns a short description of a brush preset's settings.
 * @param {BrushPreset} preset The brush preset.
 * @returns {string} The detail string.
 */
function presetDetail(preset) {
    if (preset.brushType === "gradient") {
        return "gradient #" + preset.gradient + " r" + preset.radius;
    }
    if (preset.brushType === "erase") {
        return "erase r" + preset.radius;
    }
    const shape = preset.shape === "cylinder" ? "cyl" : "sphere";
    return preset.brushType + " " + shape + " r" + preset.radius + " " + preset.blockText;
}

export { beginStroke, endStroke, saveBrushPreset, deleteBrushPreset, setBrush, clearBrush, brushEntries, setTerrain, ensureItem };
