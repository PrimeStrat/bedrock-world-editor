import { world, system, BlockPermutation, GameMode, PlayerPermissionLevel, Player, Block } from "@minecraft/server";
import { AIR_ID, blockUnder } from "./common.js";
import { spawnMarker } from "./marker.js";

const PARTICLE_INTERVAL_TICKS = 20;
const AUTO_REMOVE_RADIUS = 256;

const symmetries = new Map();

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{point: Vec3, dimensionId: string, playerName: string, quarters: number, flipX: boolean, flipY: boolean, flipZ: boolean, radial: number, intervalId: number}} SymmetryState
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Starts the marker particle heartbeat one block above a symmetry point, and
 * auto-removes the node when the owner strays beyond the 256-block radius.
 * @param {SymmetryState} state The symmetry state to animate.
 * @returns {void}
 */
function startParticle(state) {
    state.intervalId = system.runInterval(() => {
        const player = world.getAllPlayers().find((p) => p.name === state.playerName);
        if (player && player.dimension.id === state.dimensionId) {
            const dx = player.location.x - state.point.x;
            const dy = player.location.y - state.point.y;
            const dz = player.location.z - state.point.z;
            if (dx * dx + dy * dy + dz * dz > AUTO_REMOVE_RADIUS * AUTO_REMOVE_RADIUS) {
                system.clearRun(state.intervalId);
                symmetries.delete(state.playerName);
                player.sendMessage("§7Symmetry node removed (left 256-block radius).");
                return;
            }
        }
        const dimension = world.getDimension(state.dimensionId);
        spawnMarker(dimension, { x: state.point.x, y: state.point.y + 1, z: state.point.z });
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
    const state = { point, dimensionId: player.dimension.id, playerName: player.name, quarters: 2, flipX: false, flipY: false, flipZ: false, radial: 0, intervalId: 0 };
    startParticle(state);
    symmetries.set(player.name, state);
    return { ok: true, message: "§aSymmetry set at §f" + point.x + " " + point.y + " " + point.z + "§a (180 mirror). Place or break blocks to mirror them." };
}

/**
 * Returns the human list of a state's active flip axes.
 * @param {SymmetryState} state The symmetry state.
 * @returns {string} The axis list, or "none".
 */
function flipAxisLabel(state) {
    const parts = [];
    if (state.flipX) {
        parts.push("X");
    }
    if (state.flipY) {
        parts.push("Y");
    }
    if (state.flipZ) {
        parts.push("Z");
    }
    return parts.length > 0 ? parts.join(" and ") : "none";
}

/**
 * Toggles a specific flip axis (x, y, or z), or cycles X/Z when no axis is
 * given. Y flips vertically through the point. Turns off radial mode.
 * @param {Player} player The acting player.
 * @param {string} axis The axis to toggle ("x", "y", "z"), or empty to cycle.
 * @returns {ActionResult} The result.
 */
function flipSymmetry(player, axis) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§cNo symmetry set. Use /we:symmetry set first." };
    }
    state.radial = 0;
    const a = String(axis ?? "").trim().toLowerCase();
    if (a === "x") {
        state.flipX = !state.flipX;
    } else if (a === "y") {
        state.flipY = !state.flipY;
    } else if (a === "z") {
        state.flipZ = !state.flipZ;
    } else if (!state.flipX && !state.flipZ) {
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
    return { ok: true, message: "§aSymmetry flip axes: §f" + flipAxisLabel(state) + "§a." };
}

/**
 * Rotates the player's symmetry placement by another 90 degrees. Turns off
 * radial mode.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function rotateSymmetry(player) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§cNo symmetry set. Use /we:symmetry set first." };
    }
    state.radial = 0;
    state.quarters = (state.quarters + 1) % 4;
    return { ok: true, message: "§aSymmetry rotation: §f" + (state.quarters * 90) + "§a degrees." };
}

/**
 * Sets radial N-fold symmetry around the point: every manual placement is
 * copied at N evenly spaced rotations. N of 2 or 4 also mirror region fills;
 * other counts mirror manual placements only.
 * @param {Player} player The acting player.
 * @param {number} count The number of rotational copies (2 to 12).
 * @returns {ActionResult} The result.
 */
function radialSymmetry(player, count) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§cNo symmetry set. Use /we:symmetry set first." };
    }
    const n = Math.min(Math.max(2, Math.floor(count)), 12);
    state.radial = n;
    state.flipX = false;
    state.flipY = false;
    state.flipZ = false;
    state.quarters = n === 2 ? 2 : n === 4 ? 1 : 0;
    const fillNote = n === 2 || n === 4 ? "" : " §7(manual placements only)";
    return { ok: true, message: "§aRadial symmetry: §f" + n + "-fold§a." + fillNote };
}

/**
 * Reports the player's current symmetry configuration.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function statusSymmetry(player) {
    const state = symmetries.get(player.name);
    if (!state) {
        return { ok: false, message: "§7No symmetry set." };
    }
    if (state.radial >= 2) {
        return { ok: true, message: "§aSymmetry: §f" + state.radial + "-fold radial§a at §f" + state.point.x + " " + state.point.y + " " + state.point.z + "§a." };
    }
    return { ok: true, message: "§aSymmetry: §fmirror§a at §f" + state.point.x + " " + state.point.y + " " + state.point.z + "§a, flip §f" + flipAxisLabel(state) + "§a, rotation §f" + (state.quarters * 90) + "§a." };
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
 * Reflects a Y coordinate through the point when the state flips Y.
 * @param {SymmetryState} state The symmetry state.
 * @param {number} y The Y coordinate.
 * @returns {number} The transformed Y.
 */
function transformY(state, y) {
    return state.flipY ? 2 * state.point.y - y : y;
}

/**
 * Returns whether a state's transform is the identity (nothing to mirror).
 * @param {SymmetryState} state The symmetry state.
 * @returns {boolean} True when the transform changes nothing.
 */
function isIdentity(state) {
    if (state.flipY) {
        return false;
    }
    const px = transformXZ(state, 1, 0);
    const pz = transformXZ(state, 0, 1);
    return px.x === 1 && px.z === 0 && pz.x === 0 && pz.z === 1;
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
    return state;
}

/**
 * Returns the target locations a manual action at a cell should be copied to,
 * excluding the original cell. Radial modes rotate about the point's XZ
 * center; mirror modes apply the flip and quarter-turn transform.
 * @param {SymmetryState} state The symmetry state.
 * @param {Vec3} location The acted cell.
 * @returns {Vec3[]} The mirrored cells.
 */
function mirroredCells(state, location) {
    const targets = [];
    const px = state.point.x + 0.5;
    const pz = state.point.z + 0.5;
    const dx = location.x + 0.5 - px;
    const dz = location.z + 0.5 - pz;
    if (state.radial >= 2) {
        for (let i = 1; i < state.radial; i++) {
            const angle = (2 * Math.PI * i) / state.radial;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rx = dx * cos - dz * sin;
            const rz = dx * sin + dz * cos;
            targets.push({ x: Math.floor(px + rx), y: location.y, z: Math.floor(pz + rz) });
        }
        return targets;
    }
    const offset = transformXZ(state, location.x - state.point.x, location.z - state.point.z);
    targets.push({ x: state.point.x + offset.x, y: transformY(state, location.y), z: state.point.z + offset.z });
    return targets;
}

/**
 * Transforms a cell location across a symmetry point (mirror modes only).
 * @param {SymmetryState} state The symmetry state.
 * @param {Vec3} location The cell to transform.
 * @returns {Vec3} The mirrored cell.
 */
function mirrorLocation(state, location) {
    const offset = transformXZ(state, location.x - state.point.x, location.z - state.point.z);
    return { x: state.point.x + offset.x, y: transformY(state, location.y), z: state.point.z + offset.z };
}

/**
 * Returns the mirrored copy of a box for a player's symmetry, or null when
 * no symmetry applies or the mirror equals the original box. Radial modes
 * above 4-fold do not mirror fills.
 * @param {string} playerName The editing player's name.
 * @param {string} dimensionId The dimension being edited.
 * @param {Vec3} min The inclusive box min corner.
 * @param {Vec3} max The inclusive box max corner.
 * @returns {{min: Vec3, max: Vec3}|null} The mirrored box, or null.
 */
function mirrorBoxFor(playerName, dimensionId, min, max) {
    const state = activeSymmetry(playerName, dimensionId);
    if (!state || state.radial > 4 || isIdentity(state)) {
        return null;
    }
    const a = mirrorLocation(state, min);
    const b = mirrorLocation(state, max);
    const mirrorMin = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
    const mirrorMax = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
    if (mirrorMin.x === min.x && mirrorMin.y === min.y && mirrorMin.z === min.z && mirrorMax.x === max.x && mirrorMax.y === max.y && mirrorMax.z === max.z) {
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
    if (!state || state.radial > 4 || state.quarters % 2 === 1 || isIdentity(state)) {
        return null;
    }
    const mirrored = [];
    for (const run of runs) {
        const a = mirrorLocation(state, { x: run.x, y: run.y, z: run.z });
        const b = mirrorLocation(state, { x: run.x + run.length - 1, y: run.y, z: run.z });
        mirrored.push({ x: Math.min(a.x, b.x), y: a.y, z: a.z, length: run.length });
    }
    return mirrored;
}

/**
 * Writes a permutation at each mirrored cell of a manual action when in
 * bounds and loaded.
 * @param {Player} player The acting player.
 * @param {SymmetryState} state The symmetry state.
 * @param {Vec3} location The original cell.
 * @param {BlockPermutation} permutation The permutation to write.
 * @returns {void}
 */
function writeMirrored(player, state, location, permutation) {
    const dimension = player.dimension;
    const range = dimension.heightRange;
    for (const target of mirroredCells(state, location)) {
        if (target.x === location.x && target.y === location.y && target.z === location.z) {
            continue;
        }
        if (target.y < range.min || target.y > range.max - 1 || !dimension.isChunkLoaded(target)) {
            continue;
        }
        dimension.setBlockPermutation(target, permutation);
    }
}

/**
 * Mirrors a player's block placement across their symmetry point.
 * @param {Player} player The placing player.
 * @param {Block} block The block just placed.
 * @returns {void}
 */
function mirrorPlacement(player, block) {
    const state = activeSymmetry(player.name, player.dimension.id);
    if (!state || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    writeMirrored(player, state, block.location, block.permutation);
}

/**
 * Mirrors a player's block break across their symmetry point by clearing the
 * mirrored cells.
 * @param {Player} player The breaking player.
 * @param {Vec3} location The broken block's location.
 * @returns {void}
 */
function mirrorBreak(player, location) {
    const state = activeSymmetry(player.name, player.dimension.id);
    if (!state || player.getGameMode() !== GameMode.Creative || player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
        return;
    }
    writeMirrored(player, state, location, BlockPermutation.resolve(AIR_ID));
}

export { setSymmetry, flipSymmetry, rotateSymmetry, radialSymmetry, statusSymmetry, clearSymmetry, mirrorPlacement, mirrorBreak, mirrorBoxFor, mirrorRunsFor };
