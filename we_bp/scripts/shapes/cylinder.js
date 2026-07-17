import { BlockVolume } from "@minecraft/server";
import { radiusThreshold, halfWidth } from "./common.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 */

/**
 * Counts the blocks a cylinder's bounding box spans, as an upper bound for size checks.
 * @param {number} radius The cylinder radius in blocks.
 * @param {number} height The cylinder height in blocks.
 * @returns {number} The block count.
 */
function cylinderVolume(radius, height) {
    return new BlockVolume({ x: -radius, y: 0, z: -radius }, { x: radius, y: height - 1, z: radius }).getCapacity();
}

/**
 * Yields horizontal X-runs covering a vertical cylinder. The disk cross-section
 * is computed once and repeated for each layer. When hollow, only the wall
 * between the outer radius and radius-1 is emitted.
 * @param {Vec3} center The base center of the cylinder.
 * @param {number} radius The cylinder radius in blocks.
 * @param {number} height The cylinder height in blocks.
 * @param {boolean} hollow When true, emit only the wall.
 * @returns {Generator<Run>} The cylinder runs.
 */
function* cylinderRuns(center, radius, height, hollow) {
    const outer = radiusThreshold(radius);
    const inner = radius >= 1 ? radiusThreshold(radius - 1) : -1;
    const reach = Math.ceil(radius);
    const disk = [];
    for (let dz = -reach; dz <= reach; dz++) {
        const ho = halfWidth(outer, 0, dz);
        if (ho < 0) {
            continue;
        }
        if (!hollow) {
            disk.push({ dz, startX: -ho, length: 2 * ho + 1 });
            continue;
        }
        const hi = halfWidth(inner, 0, dz);
        if (hi < 0) {
            disk.push({ dz, startX: -ho, length: 2 * ho + 1 });
        } else {
            disk.push({ dz, startX: -ho, length: ho - hi });
            disk.push({ dz, startX: hi + 1, length: ho - hi });
        }
    }
    for (let dy = 0; dy < height; dy++) {
        const y = center.y + dy;
        for (const seg of disk) {
            yield { x: center.x + seg.startX, y, z: center.z + seg.dz, length: seg.length };
        }
    }
}

export { cylinderVolume, cylinderRuns };
