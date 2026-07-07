import { world, system, BlockPermutation, GameMode, PlayerPermissionLevel, Player, Block } from "@minecraft/server";
import { AIR_ID, blockUnder } from "./common.js";

const PARTICLE_ID = "minecraft:endrod";
const PARTICLE_INTERVAL_TICKS = 20;

const symmetries = new Map();

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{point: Vec3, dimensionId: string, quarters: number, flipX: boolean, flipZ: boolean, intervalId: number}} SymmetryState
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Starts the end rod particle heartbeat one block above a symmetry point.
 * @param {SymmetryState} state The symmetry state to animate.
 * @returns {void}
 */
function startParticle(state) {
    state.intervalId = system.runInterval(() => {
        const dimension = world.getDimension(state.dimensionId);
        const loc = { x: state.point.x + 0.5, y: state.point.y + 1.5, z: state.point.z + 0.5 };
        if (dimension.isChunkLoaded(loc)) {
            dimension.spawnParticle(PARTICLE_ID, loc);
        }
    }, PARTICLE_INTERVAL_TICKS);
}

/**
 * Sets the player's symmetry point at their position, starting as a 180
 * degree mirror through the point.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function setSymmetry(player) {
    clearSymmetry(player);
    const point = blockUnder(player);
    const state = { point, dimensionId: player.dimension.id, quarters: 2, flipX: false, flipZ: false, intervalId: 0 };
    startParticle(state);
    symmetries.set(player.name, state);
    return { ok: true, message: "§aSymmetry set at §f" + point.x + " " + point.y + " " + point.z + "§a (180 degree mirror). Place blocks to mirror them." };
}

/**
 * Cycles the player's symmetry flip axes: none, X, Z, then both.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function flipSymmetry(player) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§cNo symmetry set. Use /we:symmetry set first." };
    }
    if (!state.flipX && !state.flipZ) {
        state.flipX = true;
    } else if (state.flipX && !state.flipZ) {
        state.flipX = false;
        state.flipZ = true;
    } else if (!state.flipX && state.flipZ) {
        state.flipX = true;
    } else {
        state.flipX = false;
        state.flipZ = false;
    }
    const axes = state.flipX && state.flipZ ? "X and Z" : state.flipX ? "X" : state.flipZ ? "Z" : "none";
    return { ok: true, message: "§aSymmetry flip axes: §f" + axes + "§a." };
}

/**
 * Rotates the player's symmetry placement by another 90 degrees.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function rotateSymmetry(player) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§cNo symmetry set. Use /we:symmetry set first." };
    }
    state.quarters = (state.quarters + 1) % 4;
    return { ok: true, message: "§aSymmetry rotation: §f" + (state.quarters * 90) + "§a degrees." };
}

/**
 * Clears the player's symmetry point and stops its particle heartbeat.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function clearSymmetry(player) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§cNo symmetry set." };
    }
    system.clearRun(state.intervalId);
    symmetries.delete(player.name);
    return { ok: true, message: "§aSymmetry cleared." };
}

/**
 * Applies a symmetry state's flip axes then rotation to an XZ offset.
 * @param {SymmetryState} state The symmetry state.
 * @param {number} dx The X offset from the point.
 * @param {number} dz The Z offset from the point.
 * @returns {{x: number, z: number}} The transformed offset.
 */
function transformXZ(state, dx, dz) {
    let ox = state.flipX ? -dx : dx;
    let oz = state.flipZ ? -dz : dz;
    for (let quarter = 0; quarter < state.quarters; quarter++) {
        const swap = ox;
        ox = -oz;
        oz = swap;
    }
    return { x: ox, z: oz };
}

/**
 * Returns a player's active symmetry state for a dimension when its
 * transform is not the identity, or null.
 * @param {string} playerName The player's name.
 * @param {string} dimensionId The dimension being edited.
 * @returns {SymmetryState|null} The applicable state, or null.
 */
function activeSymmetry(playerName, dimensionId) {
    const state = symmetries.get(playerName);
    if (!state || state.dimensionId !== dimensionId) {
        return null;
    }
    const px = transformXZ(state, 1, 0);
    const pz = transformXZ(state, 0, 1);
    if (px.x === 1 && px.z === 0 && pz.x === 0 && pz.z === 1) {
        return null;
    }
    return state;
}

/**
 * Transforms a cell location across a symmetry point.
 * @param {SymmetryState} state The symmetry state.
 * @param {Vec3} location The cell to transform.
 * @returns {Vec3} The mirrored cell.
 */
function mirrorLocation(state, location) {
    const offset = transformXZ(state, location.x - state.point.x, location.z - state.point.z);
    return { x: state.point.x + offset.x, y: location.y, z: state.point.z + offset.z };
}

/**
 * Returns the mirrored copy of a box for a player's symmetry, or null when
 * no symmetry applies or the mirror equals the original box.
 * @param {string} playerName The editing player's name.
 * @param {string} dimensionId The dimension being edited.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {{min: Vec3, max: Vec3}|null} The mirrored box, or null.
 */
function mirrorBoxFor(playerName, dimensionId, min, max) {
    const state = activeSymmetry(playerName, dimensionId);
    if (!state) {
        return null;
    }
    const a = mirrorLocation(state, min);
    const b = mirrorLocation(state, max);
    const mirrorMin = { x: Math.min(a.x, b.x), y: min.y, z: Math.min(a.z, b.z) };
    const mirrorMax = { x: Math.max(a.x, b.x), y: max.y, z: Math.max(a.z, b.z) };
    if (mirrorMin.x === min.x && mirrorMin.z === min.z && mirrorMax.x === max.x && mirrorMax.z === max.z) {
        return null;
    }
    return { min: mirrorMin, max: mirrorMax };
}

/**
 * Returns mirrored copies of shape runs for a player's symmetry, or null
 * when no symmetry applies or the rotation is an odd quarter turn (an X run
 * cannot represent a 90 degree rotation).
 * @param {string} playerName The editing player's name.
 * @param {string} dimensionId The dimension being edited.
 * @param {{x: number, y: number, z: number, length: number}[]} runs The shape runs.
 * @returns {{x: number, y: number, z: number, length: number}[]|null} The mirrored runs, or null.
 */
function mirrorRunsFor(playerName, dimensionId, runs) {
    const state = activeSymmetry(playerName, dimensionId);
    if (!state || state.quarters % 2 === 1) {
        return null;
    }
    const mirrored = [];
    for (const run of runs) {
        const a = mirrorLocation(state, { x: run.x, y: run.y, z: run.z });
        const b = mirrorLocation(state, { x: run.x + run.length - 1, y: run.y, z: run.z });
        mirrored.push({ x: Math.min(a.x, b.x), y: run.y, z: a.z, length: run.length });
    }
    return mirrored;
}

/**
 * Returns whether a player may have their manual actions mirrored.
 * @param {Player} player The acting player.
 * @returns {boolean} True for opped creative players.
 */
function canMirror(player) {
    return player.getGameMode() === GameMode.Creative && player.playerPermissionLevel === PlayerPermissionLevel.Operator;
}

/**
 * Writes a permutation at a mirrored cell when it is in bounds and loaded.
 * @param {Player} player The acting player.
 * @param {SymmetryState} state The symmetry state.
 * @param {Vec3} location The original cell.
 * @param {BlockPermutation} permutation The permutation to write.
 * @returns {void}
 */
function writeMirrored(player, state, location, permutation) {
    const target = mirrorLocation(state, location);
    if (target.x === location.x && target.z === location.z) {
        return;
    }
    const dimension = player.dimension;
    const range = dimension.heightRange;
    if (target.y < range.min || target.y > range.max - 1 || !dimension.isChunkLoaded(target)) {
        return;
    }
    dimension.setBlockPermutation(target, permutation);
}

/**
 * Mirrors a player's block placement across their symmetry point.
 * @param {Player} player The placing player.
 * @param {Block} block The block just placed.
 * @returns {void}
 */
function mirrorPlacement(player, block) {
    const state = activeSymmetry(player.name, player.dimension.id);
    if (!state || !canMirror(player)) {
        return;
    }
    writeMirrored(player, state, block.location, block.permutation);
}

/**
 * Mirrors a player's block break across their symmetry point by clearing the
 * mirrored cell.
 * @param {Player} player The breaking player.
 * @param {Vec3} location The broken block's location.
 * @returns {void}
 */
function mirrorBreak(player, location) {
    const state = activeSymmetry(player.name, player.dimension.id);
    if (!state || !canMirror(player)) {
        return;
    }
    writeMirrored(player, state, location, BlockPermutation.resolve(AIR_ID));
}

export { setSymmetry, flipSymmetry, rotateSymmetry, clearSymmetry, mirrorPlacement, mirrorBreak, mirrorBoxFor, mirrorRunsFor };
