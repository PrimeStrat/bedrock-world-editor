import { BlockVolume } from "@minecraft/server";
import { radiusThreshold, halfWidth } from "./common.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 */

/**
 * Counts the blocks a sphere's bounding box spans, as an upper bound for size checks.
 * @param {number} radius The sphere radius in blocks.
 * @returns {number} The block count.
 */
function sphereVolume(radius) {
    return new BlockVolume({ x: -radius, y: -radius, z: -radius }, { x: radius, y: radius, z: radius }).getCapacity();
}

/**
 * Yields horizontal X-runs covering a sphere. Each run is one fillBlocks line,
 * so a whole sphere is drawn in on the order of its cross-section area rather
 * than its volume. When hollow, only the shell between the outer radius and
 * radius-1 is emitted (one or two runs per row).
 * @param {Vec3} center The sphere center.
 * @param {number} radius The sphere radius in blocks.
 * @param {boolean} hollow When true, emit only the shell.
 * @returns {Generator<Run>} The sphere runs.
 */
function* sphereRuns(center, radius, hollow) {
    const outer = radiusThreshold(radius);
    const inner = radius >= 1 ? radiusThreshold(radius - 1) : -1;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const ho = halfWidth(outer, dy, dz);
            if (ho < 0) {
                continue;
            }
            const y = center.y + dy;
            const z = center.z + dz;
            if (!hollow) {
                yield { x: center.x - ho, y, z, length: 2 * ho + 1 };
                continue;
            }
            const hi = halfWidth(inner, dy, dz);
            if (hi < 0) {
                yield { x: center.x - ho, y, z, length: 2 * ho + 1 };
            } else {
                yield { x: center.x - ho, y, z, length: ho - hi };
                yield { x: center.x + hi + 1, y, z, length: ho - hi };
            }
        }
    }
}

export { sphereVolume, sphereRuns };
