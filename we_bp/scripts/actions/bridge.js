import { Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { getSelection } from "../session.js";
import { runShapeEdit } from "../operations/shape.js";
import { pathCells } from "../shapes/path.js";
import { parsePattern, patternErrorMessage, busyGuard, NO_SELECTION_MESSAGE } from "./common.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 * @typedef {{ok: boolean, message: string}} ActionResult
 * @typedef {{curve: string, amount: number, shape: string, width: number, thickness: number, extendToGround: boolean, blockText: string}} BridgeOptions
 */

/**
 * Adds a single block cell to the row map, keyed y,z, extending its X span.
 * @param {number} x The cell X.
 * @param {number} y The cell Y.
 * @param {number} z The cell Z.
 * @param {Map<string, {y: number, z: number, minX: number, maxX: number}>} rows The row accumulator.
 * @returns {void}
 */
function addCell(x, y, z, rows) {
    const key = y + "," + z;
    const row = rows.get(key);
    if (!row) {
        rows.set(key, { y, z, minX: x, maxX: x });
    } else {
        row.minX = Math.min(row.minX, x);
        row.maxX = Math.max(row.maxX, x);
    }
}

/**
 * Adds a round ball cross-section around a center, giving a tube path.
 * @param {Vec3} center The ball center.
 * @param {number} radius The ball radius.
 * @param {Map<string, object>} rows The row accumulator.
 * @returns {void}
 */
function addBall(center, radius, rows) {
    const r2 = (radius + 0.5) * (radius + 0.5);
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const rem = r2 - dy * dy - dz * dz;
            if (rem < 0) {
                continue;
            }
            const hw = Math.floor(Math.sqrt(rem));
            addCell(center.x - hw, center.y + dy, center.z, rows);
            addCell(center.x + hw, center.y + dy, center.z, rows);
            if (hw > 0) {
                const y = center.y + dy;
                const key = y + "," + center.z;
                rows.get(key).minX = Math.min(rows.get(key).minX, center.x - hw);
                rows.get(key).maxX = Math.max(rows.get(key).maxX, center.x + hw);
            }
        }
    }
}

/**
 * Adds a flat deck cross-section around a center: width blocks across the
 * horizontal axis perpendicular to travel, thickness blocks down. This is the
 * wide flat walkway cross-section.
 * @param {Vec3} center The deck center.
 * @param {number} width The deck width across travel.
 * @param {number} thickness The deck thickness downward.
 * @param {{x: number, z: number}} perp The unit perpendicular-to-travel axis.
 * @param {Map<string, object>} rows The row accumulator.
 * @returns {void}
 */
function addDeck(center, width, thickness, perp, rows) {
    const half = Math.floor((width - 1) / 2);
    for (let w = -half; w < width - half; w++) {
        const bx = center.x + perp.x * w;
        const bz = center.z + perp.z * w;
        for (let d = 0; d < thickness; d++) {
            addCell(bx, center.y - d, bz, rows);
        }
    }
}

/**
 * Builds a path between the two selection points: a centerline of the chosen
 * curve type, given a cross-section that is either a round tube or a flat deck
 * of a set width and thickness, optionally extended down to the ground.
 * Emitted as X-runs on the shape-edit pipeline.
 * @param {Player} player The acting player.
 * @param {BridgeOptions} options The resolved path options.
 * @returns {ActionResult} The result.
 */
function buildBridge(player, options) {
    const busy = busyGuard(player);
    if (busy) {
        return busy;
    }
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    const pattern = parsePattern(options.blockText);
    if (!pattern) {
        return { ok: false, message: patternErrorMessage(options.blockText) };
    }
    const width = Math.max(1, Math.floor(options.width));
    const thickness = Math.max(1, Math.floor(options.thickness));
    const amount = Math.floor(options.amount);
    const flat = options.shape !== "tube";
    const radius = Math.floor((width - 1) / 2);
    const dimension = player.dimension;
    const range = dimension.heightRange;
    const perp = Math.abs(pos2.x - pos1.x) >= Math.abs(pos2.z - pos1.z) ? { x: 0, z: 1 } : { x: 1, z: 0 };

    const slab = pattern.entries.length === 1 && pattern.entries[0].permutation.type.id.endsWith("_slab");
    const rows = new Map();
    const surfaceTop = new Map();
    const centerline = pathCells(pos1, pos2, options.curve, amount);
    for (const center of centerline) {
        if (flat) {
            addDeck(center, width, thickness, perp, rows);
            const half = Math.floor((width - 1) / 2);
            for (let w = -half; w < width - half; w++) {
                const cx = center.x + perp.x * w;
                const cz = center.z + perp.z * w;
                const colKey = cx + "," + cz;
                const prev = surfaceTop.get(colKey);
                if (prev === undefined || center.y > prev) {
                    surfaceTop.set(colKey, center.y);
                }
            }
        } else {
            addBall(center, radius, rows);
        }
        if (options.extendToGround) {
            const bottom = flat ? center.y - thickness + 1 : center.y - radius;
            const half = Math.floor((width - 1) / 2);
            for (let w = -half; w < width - half; w++) {
                const px = flat ? center.x + perp.x * w : center.x;
                const pz = flat ? center.z + perp.z * w : center.z;
                let groundY = range.min;
                for (let y = bottom - 1; y >= range.min; y--) {
                    const block = dimension.isChunkLoaded({ x: px, y, z: pz }) ? dimension.getBlock({ x: px, y, z: pz }) : undefined;
                    if (block && !block.isAir && !block.isLiquid) {
                        groundY = y;
                        break;
                    }
                }
                for (let y = bottom - 1; y > groundY; y--) {
                    addCell(px, y, pz, rows);
                }
                if (!flat) {
                    break;
                }
            }
        }
    }

    if (flat) {
        const travel = perp.x === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
        for (const [colKey, top] of surfaceTop.entries()) {
            const parts = colKey.split(",");
            const cx = Number(parts[0]);
            const cz = Number(parts[1]);
            for (const step of [-1, 1]) {
                const nKey = (cx + travel.x * step) + "," + (cz + travel.z * step);
                const nTop = surfaceTop.get(nKey);
                if (nTop === undefined || nTop >= top) {
                    continue;
                }
                const drop = top - nTop;
                if (drop === 1 && slab) {
                    addCell(cx + travel.x * step, nTop + 1, cz + travel.z * step, rows);
                } else if (drop >= 2) {
                    for (let y = nTop + 1; y < top; y++) {
                        addCell(cx + travel.x * step, y, cz + travel.z * step, rows);
                    }
                }
            }
        }
    }

    const runs = [];
    const bboxMin = { x: Infinity, y: Infinity, z: Infinity };
    const bboxMax = { x: -Infinity, y: -Infinity, z: -Infinity };
    let volume = 0;
    for (const row of rows.values()) {
        const length = row.maxX - row.minX + 1;
        runs.push({ x: row.minX, y: row.y, z: row.z, length });
        volume += length;
        bboxMin.x = Math.min(bboxMin.x, row.minX);
        bboxMin.y = Math.min(bboxMin.y, row.y);
        bboxMin.z = Math.min(bboxMin.z, row.z);
        bboxMax.x = Math.max(bboxMax.x, row.maxX);
        bboxMax.y = Math.max(bboxMax.y, row.y);
        bboxMax.z = Math.max(bboxMax.z, row.z);
    }
    if (volume > WE_CONFIG.maxPatternBlocks && pattern.entries.length > 1) {
        return { ok: false, message: "§cPath too large for a weighted pattern." };
    }
    const label = "Path §b" + pattern.label;
    runShapeEdit(player, dimension, runs, bboxMin, bboxMax, pattern, true, label, null, false);
    return { ok: true, message: "§a" + label + "§a started (" + volume + " block(s))..." };
}

export { buildBridge };
