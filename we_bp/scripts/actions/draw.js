import { system, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { spawnMarker, spawnMarkers } from "./marker.js";
import { setPolygon } from "../session.js";

const SAMPLE_INTERVAL_TICKS = 3;
const MAX_POINTS = 512;
const MARKER_REDRAW_TICKS = 30;

const drawModes = new Set();
const traces = new Map();

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{points: Vec3[], keys: Set<string>, intervalId: number, lastMarker: number}} TraceState
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Returns whether two block locations are the same cell.
 * @param {Vec3} a The first location.
 * @param {Vec3} b The second location.
 * @returns {boolean} True when equal.
 */
function sameCell(a, b) {
    return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Toggles whether draw mode is enabled. Enabling only arms the mode; it does
 * not start a trace. Disabling cancels any active trace too.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function toggleDrawMode(player) {
    if (drawModes.has(player.name)) {
        drawModes.delete(player.name);
        cancelTrace(player);
        return { ok: true, message: "§7Draw mode off." };
    }
    drawModes.add(player.name);
    return { ok: true, message: "§aDraw mode on. Click the wand to start tracing, again to set the selection." };
}

/**
 * Returns whether a player has draw mode enabled.
 * @param {string} playerName The player's name.
 * @returns {boolean} True when draw mode is on.
 */
function isDrawMode(playerName) {
    return drawModes.has(playerName);
}

/**
 * Starts or finishes a trace for a player in draw mode: the wand click toggles
 * the trace on and off within the enabled mode.
 * @param {Player} player The acting player.
 * @returns {void}
 */
function toggleTrace(player) {
    if (traces.has(player.name)) {
        finishTrace(player);
    } else {
        startTrace(player);
    }
}

/**
 * Starts a raycast trace: samples the block above the one the player looks at
 * every few ticks and marks the path.
 * @param {Player} player The acting player.
 * @returns {void}
 */
function startTrace(player) {
    const state = { points: [], keys: new Set(), intervalId: 0, lastMarker: 0 };
    state.intervalId = system.runInterval(() => sampleTrace(player, state), SAMPLE_INTERVAL_TICKS);
    traces.set(player.name, state);
    player.onScreenDisplay.setActionBar("§aTracing... toggle the wand again to finish.");
}

/**
 * Samples the block above the player's crosshair block for an active trace,
 * adding new points and re-marking the path. Ends the trace on no hit or a
 * self-intersection (closed loop).
 * @param {Player} player The tracing player.
 * @param {TraceState} state The trace state.
 * @returns {void}
 */
function sampleTrace(player, state) {
    if (!player.isValid) {
        cancelTrace(player);
        return;
    }
    const hit = player.getBlockFromViewDirection({ maxDistance: WE_CONFIG.brushRange, includePassableBlocks: true });
    if (!hit) {
        return;
    }
    const cell = { x: hit.block.location.x, y: hit.block.location.y + 1, z: hit.block.location.z };
    const key = cell.x + "," + cell.y + "," + cell.z;
    const last = state.points[state.points.length - 1];
    if (!last || !sameCell(last, cell)) {
        if ((state.keys.has(key) && state.points.length > 2) || state.points.length >= MAX_POINTS) {
            drawModes.delete(player.name);
            finishTrace(player);
            return;
        }
        state.points.push(cell);
        state.keys.add(key);
    }
    const now = system.currentTick;
    if (now - state.lastMarker >= MARKER_REDRAW_TICKS) {
        state.lastMarker = now;
        spawnMarkers(player, state.points);
    } else {
        spawnMarker(player.dimension, cell);
    }
}

/**
 * Cancels a player's active trace without setting a selection.
 * @param {Player} player The tracing player.
 * @returns {void}
 */
function cancelTrace(player) {
    const state = traces.get(player.name);
    if (state) {
        system.clearRun(state.intervalId);
        traces.delete(player.name);
    }
}

/**
 * Finishes a player's active trace by setting the box selection to the traced
 * points' bounding box.
 * @param {Player} player The tracing player.
 * @returns {void}
 */
function finishTrace(player) {
    const state = traces.get(player.name);
    if (!state) {
        return;
    }
    system.clearRun(state.intervalId);
    traces.delete(player.name);
    if (state.points.length < 3) {
        player.onScreenDisplay.setActionBar("§cTrace at least 3 points for a shape.");
        return;
    }
    setPolygon(player.name, state.points);
    player.sendMessage("§aPolygon selection set from " + state.points.length + " traced points. Fills confine to its shape.");
}

export { toggleDrawMode, toggleTrace, isDrawMode };
