import { BlockVolume } from "@minecraft/server";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 */

/**
 * Counts the blocks a pyramid's bounding box spans, as an upper bound for size checks.
 * @param {number} size The pyramid height in blocks.
 * @returns {number} The block count.
 */
function pyramidVolume(size) {
    const half = size - 1;
    return new BlockVolume({ x: -half, y: 0, z: -half }, { x: half, y: size - 1, z: half }).getCapacity();
}

/**
 * Yields horizontal X-runs covering a square pyramid based at the given point.
 * Upright pyramids shrink one block per layer up to the apex; inverted ones
 * grow one block per layer from a single-block apex at the base. When hollow,
 * each layer is only its perimeter ring.
 * @param {Vec3} center The base center of the pyramid.
 * @param {number} size The pyramid height in blocks.
 * @param {boolean} hollow When true, emit only the shell.
 * @param {boolean} inverted When true, build apex-down (widening upward).
 * @returns {Generator<Run>} The pyramid runs.
 */
function* pyramidRuns(center, size, hollow, inverted) {
    for (let dy = 0; dy < size; dy++) {
        const half = inverted ? dy : size - 1 - dy;
        const y = center.y + dy;
        const width = 2 * half + 1;
        if (!hollow || half === 0) {
            for (let dz = -half; dz <= half; dz++) {
                yield { x: center.x - half, y, z: center.z + dz, length: width };
            }
            continue;
        }
        yield { x: center.x - half, y, z: center.z - half, length: width };
        yield { x: center.x - half, y, z: center.z + half, length: width };
        for (let dz = -half + 1; dz <= half - 1; dz++) {
            yield { x: center.x - half, y, z: center.z + dz, length: 1 };
            yield { x: center.x + half, y, z: center.z + dz, length: 1 };
        }
    }
}

export { pyramidVolume, pyramidRuns };
