/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 */

/**
 * Samples a straight line between two points at even parameter steps.
 * @param {Vec3} a The start point.
 * @param {Vec3} b The end point.
 * @param {number} steps The number of segments.
 * @returns {Vec3[]} The sampled points.
 */
function lineCurve(a, b, steps) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
    return points;
}

/**
 * Samples a catenary (hanging chain) between two points that droops by slack.
 * @param {Vec3} a The start point.
 * @param {Vec3} b The end point.
 * @param {number} steps The number of segments.
 * @param {number} slack The droop depth at the lowest point.
 * @returns {Vec3[]} The sampled points.
 */
function catenaryCurve(a, b, steps, slack) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sag = slack * (1 - Math.pow(2 * t - 1, 2));
        points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - sag, z: a.z + (b.z - a.z) * t });
    }
    return points;
}

/**
 * Samples an arch (inverted catenary) that rises by height at the midpoint.
 * @param {Vec3} a The start point.
 * @param {Vec3} b The end point.
 * @param {number} steps The number of segments.
 * @param {number} height The rise at the midpoint.
 * @returns {Vec3[]} The sampled points.
 */
function archCurve(a, b, steps, height) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rise = height * Math.sin(Math.PI * t);
        points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + rise, z: a.z + (b.z - a.z) * t });
    }
    return points;
}

/**
 * Samples a quadratic bezier between two points using a lifted control point at
 * the midpoint, giving a smooth single-hump curve.
 * @param {Vec3} a The start point.
 * @param {Vec3} b The end point.
 * @param {number} steps The number of segments.
 * @param {number} bend The control-point offset above the midpoint.
 * @returns {Vec3[]} The sampled points.
 */
function bezierCurve(a, b, steps, bend) {
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + bend, z: (a.z + b.z) / 2 };
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        points.push({
            x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
            y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
            z: u * u * a.z + 2 * u * t * c.z + t * t * b.z
        });
    }
    return points;
}

/**
 * Rounds a list of sampled points to unique block cells.
 * @param {Vec3[]} points The sampled points.
 * @returns {Vec3[]} The deduplicated block cells.
 */
function toCells(points) {
    const cells = [];
    const seen = new Set();
    for (const p of points) {
        const cell = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) };
        const key = cell.x + "," + cell.y + "," + cell.z;
        if (!seen.has(key)) {
            seen.add(key);
            cells.push(cell);
        }
    }
    return cells;
}

/**
 * Builds the centerline block cells of a path between two points for a curve
 * type, sampling densely enough to leave no gaps.
 * @param {Vec3} a The start point.
 * @param {Vec3} b The end point.
 * @param {string} curve The curve type ("line", "arch", "catenary", "bezier").
 * @param {number} amount The curve amount (arch height, catenary slack, bezier bend).
 * @returns {Vec3[]} The centerline block cells.
 */
function pathCells(a, b, curve, amount) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.round(Math.sqrt(dx * dx + dz * dz));
    let bend = amount;
    if (curve !== "line" && amount === 0) {
        bend = Math.max(2, Math.round(length / 4));
    }
    const steps = Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz)) * 2 + Math.abs(bend) * 2);
    let points;
    if (curve === "catenary") {
        points = catenaryCurve(a, b, steps, bend);
    } else if (curve === "arch") {
        points = archCurve(a, b, steps, bend);
    } else if (curve === "bezier") {
        points = bezierCurve(a, b, steps, bend);
    } else {
        points = lineCurve(a, b, steps);
    }
    return toCells(points);
}

export { pathCells };
