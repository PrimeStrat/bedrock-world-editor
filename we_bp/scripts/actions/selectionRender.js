import { world, system, Player } from "@minecraft/server";
import { getSelection, getPolygon } from "../session.js";
import { spawnMarker } from "./marker.js";

const RENDER_TICKS = 600;
const REDRAW_INTERVAL_TICKS = 10;
const MAX_EDGE_MARKERS = 400;

const renders = new Map();

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Samples evenly spaced points along a straight edge between two block corners,
 * inclusive, capped so long edges do not flood particles.
 * @param {Vec3} a The edge start corner.
 * @param {Vec3} b The edge end corner.
 * @param {Vec3[]} out The accumulator to push points into.
 * @returns {void}
 */
function edgePoints(a, b, out) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.min(length, 32));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        out.push({ x: Math.round(a.x + dx * t), y: Math.round(a.y + dy * t), z: Math.round(a.z + dz * t) });
    }
}

/**
 * Returns the outline points for a selection: the twelve edges of the bounding
 * box, plus the polygon prism edges when the selection is a polygon.
 * @param {Vec3} min The box min corner.
 * @param {Vec3} max The box max corner.
 * @param {Vec3[]|null} polygon The polygon vertices, or null.
 * @returns {Vec3[]} The outline points.
 */
function outlinePoints(min, max, polygon) {
    const points = [];
    const corners = [
        { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z },
        { x: max.x, y: min.y, z: max.z }, { x: min.x, y: min.y, z: max.z },
        { x: min.x, y: max.y, z: min.z }, { x: max.x, y: max.y, z: min.z },
        { x: max.x, y: max.y, z: max.z }, { x: min.x, y: max.y, z: max.z }
    ];
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    for (const [a, b] of edges) {
        edgePoints(corners[a], corners[b], points);
    }
    if (polygon && polygon.length >= 3) {
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i];
            const b = polygon[(i + 1) % polygon.length];
            edgePoints({ x: a.x, y: min.y, z: a.z }, { x: b.x, y: min.y, z: b.z }, points);
            edgePoints({ x: a.x, y: max.y, z: a.z }, { x: b.x, y: max.y, z: b.z }, points);
            edgePoints({ x: a.x, y: min.y, z: a.z }, { x: a.x, y: max.y, z: a.z }, points);
        }
    }
    return points.length > MAX_EDGE_MARKERS ? points.slice(0, MAX_EDGE_MARKERS) : points;
}

/**
 * Renders the player's current selection outline with marker particles for a
 * few seconds, then stops. A new call cancels the previous render immediately
 * and starts fresh, so making a new selection replaces the old outline at once.
 * @param {Player} player The viewing player.
 * @returns {void}
 */
function renderSelection(player) {
    stopRender(player.name);
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return;
    }
    const min = { x: Math.min(pos1.x, pos2.x), y: Math.min(pos1.y, pos2.y), z: Math.min(pos1.z, pos2.z) };
    const max = { x: Math.max(pos1.x, pos2.x), y: Math.max(pos1.y, pos2.y), z: Math.max(pos1.z, pos2.z) };
    const points = outlinePoints(min, max, getPolygon(player.name));
    const deadline = system.currentTick + RENDER_TICKS;
    drawOutline(player.name, points);
    const intervalId = system.runInterval(() => {
        if (system.currentTick >= deadline) {
            stopRender(player.name);
            return;
        }
        drawOutline(player.name, points);
    }, REDRAW_INTERVAL_TICKS);
    renders.set(player.name, intervalId);
}

/**
 * Spawns the outline markers for a player when they are still online.
 * @param {string} playerName The viewing player's name.
 * @param {Vec3[]} points The outline points.
 * @returns {void}
 */
function drawOutline(playerName, points) {
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (!player) {
        stopRender(playerName);
        return;
    }
    const dimension = player.dimension;
    for (const point of points) {
        spawnMarker(dimension, point);
    }
}

/**
 * Stops and clears a player's active selection render, if any.
 * @param {string} playerName The viewing player's name.
 * @returns {void}
 */
function stopRender(playerName) {
    const id = renders.get(playerName);
    if (id !== undefined) {
        system.clearRun(id);
        renders.delete(playerName);
    }
}

export { renderSelection };
