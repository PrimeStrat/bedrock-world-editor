import { world, system, Player } from "@minecraft/server";
import { runShapeEdit } from "../operations/shape.js";
import { stampClipboardAlongPath } from "../clipboard.js";
import { spawnMarker } from "./marker.js";
import { parsePattern, patternErrorMessage, setPatternPlayer, busyGuard, blockUnder } from "./common.js";

const MAX_PATH_POINTS = 64;
const MAX_SWEEP_RADIUS = 8;
const PREVIEW_TICKS = 600;
const PREVIEW_REDRAW_TICKS = 10;
const MAX_PREVIEW_MARKERS = 300;

const pathPoints = new Map();
const previews = new Map();

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Evaluates one Catmull-Rom component so the curve passes smoothly through
 * the middle two control values.
 * @param {number} a The value before the segment.
 * @param {number} b The segment start value.
 * @param {number} c The segment end value.
 * @param {number} d The value after the segment.
 * @param {number} t The fraction through the segment (0 to 1).
 * @returns {number} The interpolated value.
 */
function catmull(a, b, c, d, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - 3 * c + a - d) * t3);
}

/**
 * Samples a smooth Catmull-Rom curve through the control points, at roughly
 * the given number of samples per block of segment length. A single point
 * samples to itself.
 * @param {Vec3[]} points The control points, in order.
 * @param {number} samplesPerBlock How densely to sample each segment.
 * @returns {Vec3[]} The sampled curve positions, in order.
 */
function samplePath(points, samplesPerBlock) {
    if (points.length < 2) {
        return points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    }
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy + dz * dz) * samplesPerBlock));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            out.push({
                x: catmull(p0.x, p1.x, p2.x, p3.x, t),
                y: catmull(p0.y, p1.y, p2.y, p3.y, t),
                z: catmull(p0.z, p1.z, p2.z, p3.z, t)
            });
        }
    }
    const last = points[points.length - 1];
    out.push({ x: last.x, y: last.y, z: last.z });
    return out;
}

/**
 * Renders the path curve with marker particles for a while, cancelling any
 * previous path preview so re-adding points replaces the outline at once.
 * @param {Player} player The viewing player.
 * @returns {void}
 */
function renderPathPreview(player) {
    stopPreview(player.name);
    const points = pathPoints.get(player.name);
    if (!points || points.length === 0) {
        return;
    }
    let samples = samplePath(points, 1);
    if (samples.length > MAX_PREVIEW_MARKERS) {
        const stride = Math.ceil(samples.length / MAX_PREVIEW_MARKERS);
        samples = samples.filter((s, index) => index % stride === 0);
    }
    const deadline = system.currentTick + PREVIEW_TICKS;
    const playerName = player.name;
    const intervalId = system.runInterval(() => {
        if (system.currentTick >= deadline) {
            stopPreview(playerName);
            return;
        }
        const viewer = world.getAllPlayers().find((p) => p.name === playerName);
        if (!viewer) {
            stopPreview(playerName);
            return;
        }
        for (const sample of samples) {
            spawnMarker(viewer.dimension, { x: Math.round(sample.x), y: Math.round(sample.y), z: Math.round(sample.z) });
        }
    }, PREVIEW_REDRAW_TICKS);
    previews.set(playerName, intervalId);
}

/**
 * Stops and clears a player's active path preview, if any.
 * @param {string} playerName The viewing player's name.
 * @returns {void}
 */
function stopPreview(playerName) {
    const id = previews.get(playerName);
    if (id !== undefined) {
        system.clearRun(id);
        previews.delete(playerName);
    }
}

/**
 * Adds a path control point at the player's feet and previews the curve.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function addPathPoint(player) {
    let points = pathPoints.get(player.name);
    if (!points) {
        points = [];
        pathPoints.set(player.name, points);
    }
    if (points.length >= MAX_PATH_POINTS) {
        return { ok: false, message: "§cPath cap reached (" + MAX_PATH_POINTS + " points)." };
    }
    const loc = blockUnder(player);
    points.push(loc);
    system.run(() => renderPathPreview(player));
    const hint = points.length >= 2 ? " §7Build with /we:path build or paste." : " §7Add more to curve.";
    return { ok: true, message: "§aPath point §f" + points.length + "§a set at §f" + loc.x + " " + loc.y + " " + loc.z + "§a." + hint };
}

/**
 * Clears the player's path control points and preview.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function clearPathPoints(player) {
    const had = pathPoints.delete(player.name);
    stopPreview(player.name);
    return had
        ? { ok: true, message: "§aPath cleared." }
        : { ok: false, message: "§cNo path points set." };
}

/**
 * Lists the player's path control points and re-previews the curve.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function listPathPoints(player) {
    const points = pathPoints.get(player.name);
    if (!points || points.length === 0) {
        return { ok: false, message: "§cNo path points. Set them with /we:path add." };
    }
    system.run(() => renderPathPreview(player));
    const lines = points.map((p, index) => "§f" + (index + 1) + "§7: " + p.x + " " + p.y + " " + p.z);
    return { ok: true, message: "§6Path points:\n" + lines.join("\n") };
}

/**
 * Sweeps a solid block sphere along the path curve, forming a smooth tube
 * through every control point (a curved bridge deck, wall core, or tunnel).
 * @param {Player} player The acting player.
 * @param {string} blockText The block id or pattern to sweep with.
 * @param {number} radius The sweep radius.
 * @returns {ActionResult} The result.
 */
function buildPathSweep(player, blockText, radius) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const points = pathPoints.get(player.name);
    if (!points || points.length < 2) {
        return { ok: false, message: "§cSet at least 2 path points first (/we:path add)." };
    }
    setPatternPlayer(player.name);
    const pattern = parsePattern(blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(blockText) };
    }
    const r = Math.min(Math.max(1, Math.floor(radius)), MAX_SWEEP_RADIUS);
    const samples = samplePath(points, 1);
    const r2 = (r + 0.5) * (r + 0.5);
    const cells = new Set();
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const sample of samples) {
        const cx = Math.round(sample.x);
        const cy = Math.round(sample.y);
        const cz = Math.round(sample.z);
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (dx * dx + dy * dy + dz * dz > r2) {
                        continue;
                    }
                    const x = cx + dx;
                    const y = cy + dy;
                    const z = cz + dz;
                    cells.add(x + "," + y + "," + z);
                    min.x = Math.min(min.x, x);
                    min.y = Math.min(min.y, y);
                    min.z = Math.min(min.z, z);
                    max.x = Math.max(max.x, x);
                    max.y = Math.max(max.y, y);
                    max.z = Math.max(max.z, z);
                }
            }
        }
    }
    const runs = cellsToRuns(cells);
    const label = "Path §b" + pattern.label;
    runShapeEdit(player, player.dimension, runs, min, max, pattern, true, label, null);
    return { ok: true, message: "§a" + label + "§a started along §f" + points.length + "§a point(s)..." };
}

/**
 * Converts a set of "x,y,z" cell keys into horizontal X-runs for a shape edit.
 * @param {Set<string>} cells The cell keys.
 * @returns {{x: number, y: number, z: number, length: number}[]} The runs.
 */
function cellsToRuns(cells) {
    const byRow = new Map();
    for (const key of cells) {
        const parts = key.split(",");
        const x = Number(parts[0]);
        const rowKey = parts[1] + "," + parts[2];
        let xs = byRow.get(rowKey);
        if (!xs) {
            xs = [];
            byRow.set(rowKey, xs);
        }
        xs.push(x);
    }
    const runs = [];
    for (const [rowKey, xs] of byRow.entries()) {
        const parts = rowKey.split(",");
        const y = Number(parts[0]);
        const z = Number(parts[1]);
        xs.sort((a, b) => a - b);
        let start = xs[0];
        let prev = xs[0];
        for (let i = 1; i <= xs.length; i++) {
            if (i < xs.length && xs[i] === prev + 1) {
                prev = xs[i];
                continue;
            }
            runs.push({ x: start, y, z, length: prev - start + 1 });
            if (i < xs.length) {
                start = xs[i];
                prev = xs[i];
            }
        }
    }
    return runs;
}

/**
 * Stamps the player's clipboard along the path curve, each stamp rotated in
 * 90-degree steps to follow the path direction. Build the segment along the
 * X axis (west to east) so bends rotate it correctly.
 * @param {Player} player The acting player.
 * @param {number|undefined} spacing Blocks between stamps, or undefined for
 *   the clipboard's length so segments butt end to end.
 * @param {boolean} skipAir When true, air in the clipboard does not overwrite.
 * @returns {ActionResult} The result.
 */
function pastePathStamps(player, spacing, skipAir) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const points = pathPoints.get(player.name);
    if (!points || points.length < 2) {
        return { ok: false, message: "§cSet at least 2 path points first (/we:path add)." };
    }
    const samples = samplePath(points, 2);
    const result = stampClipboardAlongPath(player, samples, spacing, skipAir);
    return { ok: result.ok, message: (result.ok ? "§a" : "§c") + result.message };
}

export { addPathPoint, clearPathPoints, listPathPoints, buildPathSweep, pastePathStamps };
