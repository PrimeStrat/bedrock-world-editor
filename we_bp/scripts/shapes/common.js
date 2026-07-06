/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{x: number, y: number, z: number, length: number}} Run
 */

/**
 * Returns the squared radius threshold used for shape membership tests.
 * Adding 0.5 before squaring rounds the surface so spheres and circles do not
 * grow the single-block spikes that a bare radius*radius test produces.
 * @param {number} radius The shape radius in blocks.
 * @returns {number} The squared threshold.
 */
function radiusThreshold(radius) {
    return (radius + 0.5) * (radius + 0.5);
}

/**
 * Returns the X half-width of a round shape at vertical/depth offsets dy, dz
 * for a given squared radius, or -1 when the row does not intersect the shape.
 * @param {number} r2 The squared radius threshold.
 * @param {number} dy The vertical offset from center.
 * @param {number} dz The depth offset from center.
 * @returns {number} The half-width in X, or -1 if the row is outside.
 */
function halfWidth(r2, dy, dz) {
    const rem = r2 - dy * dy - dz * dz;
    if (rem < 0) {
        return -1;
    }
    return Math.floor(Math.sqrt(rem));
}

export { radiusThreshold, halfWidth };
