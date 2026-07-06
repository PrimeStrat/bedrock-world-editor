import { CustomCommandStatus, Player } from "@minecraft/server";

/**
 * Returns the player that ran a command, or null when not run by a player.
 * @param {object} origin The command origin.
 * @returns {Player|null} The player, or null.
 */
function getPlayer(origin) {
    const entity = origin.sourceEntity;
    if (!entity || typeof entity.sendMessage !== "function") {
        return null;
    }
    return entity;
}

/**
 * Converts an action result into a custom command result.
 * @param {{ok: boolean, message: string}} result The action result.
 * @returns {object} The command result.
 */
function toCommandResult(result) {
    const status = result.ok ? CustomCommandStatus.Success : CustomCommandStatus.Failure;
    if (result.message) {
        return { status, message: result.message };
    }
    return { status };
}

/**
 * Returns the standard failure result for non-player origins.
 * @returns {object} The command result.
 */
function notPlayer() {
    return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
}

export { getPlayer, toCommandResult, notPlayer };
