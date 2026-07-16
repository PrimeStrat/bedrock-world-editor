const NOISE_SCALE = 0.15;

/**
 * @typedef {{permutation: object, weight: number}[]} PatternEntries
 */

/**
 * Hashes three integer coordinates and a seed into a pseudo-random gradient in
 * [0, 1). Deterministic per cell so a stroke is stable while it is held.
 * @param {number} x The cell X.
 * @param {number} y The cell Y.
 * @param {number} z The cell Z.
 * @param {number} seed The noise seed.
 * @returns {number} A value in [0, 1).
 */
function hash01(x, y, z, seed) {
    let h = (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647) ^ (seed * 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
}

/**
 * Smooth interpolation weight (smoothstep).
 * @param {number} t The fraction from 0 to 1.
 * @returns {number} The eased fraction.
 */
function fade(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Samples trilinearly interpolated value noise at a scaled world position,
 * giving a smooth field in [0, 1] rather than per-block white noise.
 * @param {number} x The cell X.
 * @param {number} y The cell Y.
 * @param {number} z The cell Z.
 * @param {number} seed The noise seed.
 * @param {number} scale The noise scale (cells per feature).
 * @returns {number} The noise value in [0, 1].
 */
function valueNoise(x, y, z, seed, scale) {
    const s = scale > 0 ? scale : NOISE_SCALE;
    const fx = x * s;
    const fy = y * s;
    const fz = z * s;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const tx = fade(fx - x0);
    const ty = fade(fy - y0);
    const tz = fade(fz - z0);
    const c000 = hash01(x0, y0, z0, seed);
    const c100 = hash01(x0 + 1, y0, z0, seed);
    const c010 = hash01(x0, y0 + 1, z0, seed);
    const c110 = hash01(x0 + 1, y0 + 1, z0, seed);
    const c001 = hash01(x0, y0, z0 + 1, seed);
    const c101 = hash01(x0 + 1, y0, z0 + 1, seed);
    const c011 = hash01(x0, y0 + 1, z0 + 1, seed);
    const c111 = hash01(x0 + 1, y0 + 1, z0 + 1, seed);
    const x00 = c000 + tx * (c100 - c000);
    const x10 = c010 + tx * (c110 - c010);
    const x01 = c001 + tx * (c101 - c001);
    const x11 = c011 + tx * (c111 - c011);
    const y0v = x00 + ty * (x10 - x00);
    const y1v = x01 + ty * (x11 - x01);
    return y0v + tz * (y1v - y0v);
}

/**
 * Picks a pattern entry's permutation for a cell by mapping the noise value at
 * that cell across the entries' cumulative weights: each block owns a slice of
 * the [0, 1] noise range proportional to its weight, so blocks cluster into
 * smooth organic patches rather than salt-and-pepper.
 * @param {PatternEntries} entries The weighted pattern entries.
 * @param {number} total The total weight.
 * @param {number} x The cell X.
 * @param {number} y The cell Y.
 * @param {number} z The cell Z.
 * @param {number} seed The noise seed.
 * @param {number} scale The noise scale.
 * @returns {object} The chosen permutation.
 */
function noisePermutation(entries, total, x, y, z, seed, scale) {
    const n = valueNoise(x, y, z, seed, scale);
    let cut = n * total;
    for (const entry of entries) {
        cut -= entry.weight;
        if (cut < 0) {
            return entry.permutation;
        }
    }
    return entries[entries.length - 1].permutation;
}

export { noisePermutation };
