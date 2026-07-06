import { system, BlockPermutation, Block, Player } from "@minecraft/server";
import { axisFromView } from "../clipboard.js";
import { blockUnder } from "./common.js";

const NAV_SCAN_TOP = 320;
const NAV_SCAN_BOTTOM = -64;
const THRU_SCAN_LIMIT = 16;

/**
 * @typedef {{ok: boolean, message: string}} ActionResult
 */

/**
 * Returns whether a block is open air.
 * @param {Block|undefined} block The block.
 * @returns {boolean} True when passable.
 */
function isOpen(block) {
    return Boolean(block) && block.isAir;
}

/**
 * Teleports the player up a distance, placing a glass block underfoot.
 * @param {Player} player The acting player.
 * @param {number} distance The number of blocks to rise.
 * @returns {ActionResult} The result.
 */
function goUp(player, distance) {
    const n = Math.max(1, Math.floor(distance));
    system.run(() => {
        const c = blockUnder(player);
        const below = player.dimension.getBlock({ x: c.x, y: c.y + n - 1, z: c.z });
        if (below && below.isAir) {
            below.setPermutation(BlockPermutation.resolve("minecraft:glass"));
        }
        player.teleport({ x: c.x + 0.5, y: c.y + n, z: c.z + 0.5 });
    });
    return { ok: true, message: "§aWhoosh!" };
}

/**
 * Teleports the player to the first open space at or above their position.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function unstuck(player) {
    system.run(() => {
        const c = blockUnder(player);
        for (let y = c.y; y < NAV_SCAN_TOP; y++) {
            if (isOpen(player.dimension.getBlock({ x: c.x, y, z: c.z })) && isOpen(player.dimension.getBlock({ x: c.x, y: y + 1, z: c.z }))) {
                player.teleport({ x: c.x + 0.5, y, z: c.z + 0.5 });
                return;
            }
        }
    });
    return { ok: true, message: "§aThere you go!" };
}

/**
 * Teleports the player to the next platform above (ascend) or below (descend).
 * @param {Player} player The acting player.
 * @param {boolean} downward True to descend, false to ascend.
 * @returns {ActionResult} The result.
 */
function ascendDescend(player, downward) {
    system.run(() => {
        const c = blockUnder(player);
        const dimension = player.dimension;
        const step = downward ? -1 : 1;
        for (let y = c.y + step; y > NAV_SCAN_BOTTOM && y < NAV_SCAN_TOP; y += step) {
            const floor = dimension.getBlock({ x: c.x, y: y - 1, z: c.z });
            const feet = dimension.getBlock({ x: c.x, y, z: c.z });
            const head = dimension.getBlock({ x: c.x, y: y + 1, z: c.z });
            if (floor && !floor.isAir && isOpen(feet) && isOpen(head)) {
                player.teleport({ x: c.x + 0.5, y, z: c.z + 0.5 });
                player.sendMessage(downward ? "§aDescended a level." : "§aAscended a level.");
                return;
            }
        }
        player.sendMessage("§cNo free spot found.");
    });
    return { ok: true, message: "" };
}

/**
 * Teleports the player through the wall they are facing.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function goThru(player) {
    const dir = axisFromView(player.getViewDirection());
    system.run(() => {
        const c = blockUnder(player);
        const dimension = player.dimension;
        let sawWall = false;
        for (let d = 1; d <= THRU_SCAN_LIMIT; d++) {
            const x = c.x + dir.x * d;
            const z = c.z + dir.z * d;
            const open = isOpen(dimension.getBlock({ x, y: c.y, z })) && isOpen(dimension.getBlock({ x, y: c.y + 1, z }));
            if (!open) {
                sawWall = true;
                continue;
            }
            if (sawWall) {
                player.teleport({ x: x + 0.5, y: c.y, z: z + 0.5 });
                player.sendMessage("§aWhoosh!");
                return;
            }
        }
        player.sendMessage("§cNo open spot behind that wall.");
    });
    return { ok: true, message: "" };
}

/**
 * Teleports the player on top of the block they are looking at.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function jumpTo(player) {
    system.run(() => {
        const hit = player.getBlockFromViewDirection({ maxDistance: 300 });
        if (!hit || !hit.block) {
            player.sendMessage("§cNo block in sight.");
            return;
        }
        const loc = hit.block.location;
        player.teleport({ x: loc.x + 0.5, y: loc.y + 1, z: loc.z + 0.5 });
        player.sendMessage("§aPoof!");
    });
    return { ok: true, message: "" };
}

/**
 * Teleports the player up against the ceiling above them.
 * @param {Player} player The acting player.
 * @returns {ActionResult} The result.
 */
function goCeil(player) {
    system.run(() => {
        const c = blockUnder(player);
        const dimension = player.dimension;
        for (let y = c.y + 2; y < NAV_SCAN_TOP; y++) {
            const block = dimension.getBlock({ x: c.x, y, z: c.z });
            if (block && !block.isAir) {
                player.teleport({ x: c.x + 0.5, y: y - 2, z: c.z + 0.5 });
                player.sendMessage("§aWhoosh!");
                return;
            }
        }
        player.sendMessage("§cNo ceiling above you.");
    });
    return { ok: true, message: "" };
}

export { goUp, unstuck, ascendDescend, goThru, jumpTo, goCeil };
