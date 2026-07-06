import { system, ItemStack, Player } from "@minecraft/server";
import { WE_CONFIG } from "../config.js";
import { getSelection, setPos1, setPos2, clearSelection } from "../session.js";
import { DIRECTIONS, NO_SELECTION_MESSAGE, directionOrView, blockUnder } from "./common.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Returns a size note for position-set messages, or an empty string until
 * both corners exist.
 * @param {string} playerName The player's name.
 * @returns {string} The size suffix.
 */
function selectionSizeSuffix(playerName) {
    const { pos1, pos2 } = getSelection(playerName);
    if (!pos1 || !pos2) {
        return "";
    }
    const dx = Math.abs(pos1.x - pos2.x) + 1;
    const dy = Math.abs(pos1.y - pos2.y) + 1;
    const dz = Math.abs(pos1.z - pos2.z) + 1;
    return " §7(" + (dx * dy * dz) + ")";
}

/**
 * Sets a selection position to the player's current block location.
 * @param {Player} player The acting player.
 * @param {number} which Either 1 or 2.
 * @returns {ActionResult} The result.
 */
function setPositionHere(player, which) {
    const loc = blockUnder(player);
    if (which === 1) {
        setPos1(player.name, loc);
    } else {
        setPos2(player.name, loc);
    }
    return { ok: true, message: "§aPos" + which + " set to §f" + loc.x + " " + loc.y + " " + loc.z + "§a." + selectionSizeSuffix(player.name) };
}

/**
 * Gives the player the selection wand item.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function giveWand(player) {
    system.run(() => {
        const inventory = player.getComponent("inventory");
        if (inventory && inventory.container) {
            inventory.container.addItem(new ItemStack(WE_CONFIG.wandItemId, 1));
        }
    });
    return { ok: true, message: "§aWand given. Left-click sets Pos1, right-click sets Pos2 (creative)." };
}

/**
 * Clears the player's selection positions.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function deselect(player) {
    clearSelection(player.name);
    return { ok: true, message: "§aSelection cleared." };
}

/**
 * Describes the current selection dimensions and volume.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function selectionInfo(player) {
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    const dx = Math.abs(pos1.x - pos2.x) + 1;
    const dy = Math.abs(pos1.y - pos2.y) + 1;
    const dz = Math.abs(pos1.z - pos2.z) + 1;
    return { ok: true, message: "§aSelection: §f" + dx + "x" + dy + "x" + dz + "§a = §f" + (dx * dy * dz) + "§a block(s)." };
}

/**
 * Moves one face of the selection along a direction, outward (expand) or
 * inward (contract), clamping so the box never inverts.
 * @param {Player} player The acting player.
 * @param {number} amount The number of blocks to move the face.
 * @param {string|undefined} directionName The direction name, or undefined for view.
 * @param {boolean} inward True to contract, false to expand.
 * @returns {ActionResult} The result.
 */
function adjustSelection(player, amount, directionName, inward) {
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    const dir = directionOrView(player, directionName);
    if (!dir) {
        return { ok: false, message: "§cUnknown direction." };
    }
    const n = Math.max(1, Math.floor(amount));
    const min = { x: Math.min(pos1.x, pos2.x), y: Math.min(pos1.y, pos2.y), z: Math.min(pos1.z, pos2.z) };
    const max = { x: Math.max(pos1.x, pos2.x), y: Math.max(pos1.y, pos2.y), z: Math.max(pos1.z, pos2.z) };
    const step = inward ? -n : n;
    for (const axis of ["x", "y", "z"]) {
        if (dir[axis] > 0) {
            max[axis] = Math.max(min[axis], max[axis] + step);
        } else if (dir[axis] < 0) {
            min[axis] = Math.min(max[axis], min[axis] - step);
        }
    }
    setPos1(player.name, min);
    setPos2(player.name, max);
    return { ok: true, message: "§aSelection " + (inward ? "contracted" : "expanded") + " §f" + n + "§a block(s)." };
}

/**
 * Grows the selection by an amount along a direction (or the view axis).
 * @param {Player} player The acting player.
 * @param {number} amount The number of blocks to expand.
 * @param {string|undefined} directionName The direction name, or undefined for view.
 * @returns {ActionResult} The result.
 */
function expandSelection(player, amount, directionName) {
    return adjustSelection(player, amount, directionName, false);
}

/**
 * Shrinks the selection by an amount along a direction (or the view axis).
 * @param {Player} player The acting player.
 * @param {number} amount The number of blocks to contract.
 * @param {string|undefined} directionName The direction name, or undefined for view.
 * @returns {ActionResult} The result.
 */
function contractSelection(player, amount, directionName) {
    return adjustSelection(player, amount, directionName, true);
}

/**
 * Moves the whole selection by an amount along a direction (or the view axis).
 * @param {Player} player The acting player.
 * @param {number} amount The number of blocks to shift.
 * @param {string|undefined} directionName The direction name, or undefined for view.
 * @returns {ActionResult} The result.
 */
function shiftSelection(player, amount, directionName) {
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    const dir = directionOrView(player, directionName);
    if (!dir) {
        return { ok: false, message: "§cUnknown direction." };
    }
    const n = Math.max(1, Math.floor(amount));
    setPos1(player.name, { x: pos1.x + dir.x * n, y: pos1.y + dir.y * n, z: pos1.z + dir.z * n });
    setPos2(player.name, { x: pos2.x + dir.x * n, y: pos2.y + dir.y * n, z: pos2.z + dir.z * n });
    return { ok: true, message: "§aSelection shifted §f" + n + "§a block(s)." };
}

/**
 * Grows or shrinks the selection on every axis at once.
 * @param {Player} player The acting player.
 * @param {number} amount The number of blocks to outset (or inset).
 * @param {boolean} inward True to inset, false to outset.
 * @returns {ActionResult} The result.
 */
function outsetSelection(player, amount, inward) {
    const { pos1, pos2 } = getSelection(player.name);
    if (!pos1 || !pos2) {
        return { ok: false, message: NO_SELECTION_MESSAGE };
    }
    const n = Math.max(1, Math.floor(amount));
    const min = { x: Math.min(pos1.x, pos2.x), y: Math.min(pos1.y, pos2.y), z: Math.min(pos1.z, pos2.z) };
    const max = { x: Math.max(pos1.x, pos2.x), y: Math.max(pos1.y, pos2.y), z: Math.max(pos1.z, pos2.z) };
    for (const axis of ["x", "y", "z"]) {
        const room = Math.floor((max[axis] - min[axis]) / 2);
        const change = inward ? -Math.min(n, room) : n;
        min[axis] -= change;
        max[axis] += change;
    }
    setPos1(player.name, min);
    setPos2(player.name, max);
    return { ok: true, message: "§aSelection " + (inward ? "inset" : "outset") + "." };
}

export { setPositionHere, giveWand, deselect, selectionInfo, selectionSizeSuffix, expandSelection, contractSelection, shiftSelection, outsetSelection };
