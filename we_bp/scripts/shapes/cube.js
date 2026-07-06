/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 */

/**
 * Yields horizontal X-runs covering the one-block-thick shell of a box: full
 * slabs for the bottom and top faces and a perimeter ring for each layer
 * between them. Degenerate boxes (1-2 blocks thick on any axis) come out solid.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {Generator<Run>} The hollow cube runs.
 */
function* hollowCubeRuns(min, max) {
    const sx = max.x - min.x + 1;
    for (let z = min.z; z <= max.z; z++) {
        yield { x: min.x, y: min.y, z, length: sx };
    }
    if (max.y > min.y) {
        for (let z = min.z; z <= max.z; z++) {
            yield { x: min.x, y: max.y, z, length: sx };
        }
    }
    for (let y = min.y + 1; y <= max.y - 1; y++) {
        yield { x: min.x, y, z: min.z, length: sx };
        if (max.z > min.z) {
            yield { x: min.x, y, z: max.z, length: sx };
        }
        for (let z = min.z + 1; z <= max.z - 1; z++) {
            yield { x: min.x, y, z, length: 1 };
            if (max.x > min.x) {
                yield { x: max.x, y, z, length: 1 };
            }
        }
    }
}

/**
 * Yields horizontal X-runs covering the four vertical walls of a box (no floor
 * or ceiling), one perimeter ring per layer.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {Generator<Run>} The wall runs.
 */
function* wallsRuns(min, max) {
    const sx = max.x - min.x + 1;
    for (let y = min.y; y <= max.y; y++) {
        yield { x: min.x, y, z: min.z, length: sx };
        if (max.z > min.z) {
            yield { x: min.x, y, z: max.z, length: sx };
        }
        for (let z = min.z + 1; z <= max.z - 1; z++) {
            yield { x: min.x, y, z, length: 1 };
            if (max.x > min.x) {
                yield { x: max.x, y, z, length: 1 };
            }
        }
    }
}

export { hollowCubeRuns, wallsRuns };
