/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{id: string, weight: number}[]} Bands
 */

/**
 * Eases a fraction with a bezier-like smoothstep: slow at the ends, fast in the
 * middle. Matches the gradient painter's "rapid center change with easing".
 * @param {number} t The linear fraction from 0 to 1.
 * @returns {number} The eased fraction.
 */
function bezierEase(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Returns the cumulative band boundaries (0..1) for weighted bands, so a band's
 * share of the gradient is proportional to its weight.
 * @param {Bands} bands The gradient bands.
 * @returns {number[]} The rising boundary fractions, one per band (last is 1).
 */
function bandBoundaries(bands) {
    let total = 0;
    for (const band of bands) {
        total += band.weight;
    }
    const bounds = [];
    let acc = 0;
    for (const band of bands) {
        acc += band.weight;
        bounds.push(total > 0 ? acc / total : 1);
    }
    return bounds;
}

/**
 * Maps a fraction (0..1) along the gradient to a block id from ordered bands
 * using the chosen interpolation. "nearest" picks hard band boundaries;
 * "linear" is the same discrete pick on a linear scale; "bezier" reshapes the
 * fraction so the transition happens faster through the middle. Blocks are
 * whole, so all modes ultimately choose one band; the interpolation changes
 * where the boundaries land across the span.
 * @param {Bands} bands The gradient bands (ordered low to high).
 * @param {number} t The fraction from 0 to 1.
 * @param {string} interp One of "nearest", "linear", "bezier".
 * @returns {string} The chosen block id.
 */
function blockForFraction(bands, t, interp) {
    let f = Math.max(0, Math.min(1, t));
    if (interp === "bezier") {
        f = bezierEase(f);
    }
    const bounds = bandBoundaries(bands);
    if (interp === "nearest") {
        // snap to the nearest band center rather than its upper boundary
        let best = 0;
        let bestDist = Infinity;
        let low = 0;
        for (let i = 0; i < bounds.length; i++) {
            const center = (low + bounds[i]) / 2;
            const dist = Math.abs(f - center);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
            low = bounds[i];
        }
        return bands[best].id;
    }
    for (let i = 0; i < bounds.length; i++) {
        if (f <= bounds[i]) {
            return bands[i].id;
        }
    }
    return bands[bands.length - 1].id;
}

/**
 * Returns the gradient fraction (0..1) for a cell. Planar mode projects the
 * cell onto the pos1->pos2 axis; spherical mode uses the cell's distance from
 * pos1 relative to the pos1->pos2 radius. Clamps to [0, 1].
 * @param {Vec3} cell The cell location.
 * @param {Vec3} from The gradient start (pos1).
 * @param {Vec3} to The gradient end (pos2).
 * @param {string} type One of "planar", "spherical".
 * @returns {number} The fraction from 0 to 1.
 */
function gradientFraction(cell, from, to, type) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    if (type === "spherical") {
        const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (radius <= 0) {
            return 0;
        }
        const cx = cell.x - from.x;
        const cy = cell.y - from.y;
        const cz = cell.z - from.z;
        return Math.min(1, Math.sqrt(cx * cx + cy * cy + cz * cz) / radius);
    }
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq <= 0) {
        return 0;
    }
    const cx = cell.x - from.x;
    const cy = cell.y - from.y;
    const cz = cell.z - from.z;
    const dot = cx * dx + cy * dy + cz * dz;
    return Math.max(0, Math.min(1, dot / lenSq));
}

export { blockForFraction, gradientFraction };
