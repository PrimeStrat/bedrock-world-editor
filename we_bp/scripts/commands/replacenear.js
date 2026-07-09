import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { replaceNear } from "../actions/utility.js";

/**
 * Builds a replace-near command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, "to" accepts a pattern string.
 * @returns {object} The command entry.
 */
function replaceNearVariant(name, usePattern) {
    return {
        definition: {
            name,
            description: "Replace one block with another within a radius.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.Integer, name: "radius" },
                { type: CustomCommandParamType.BlockType, name: "from" },
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "to" }
            ]
        },
        handler(origin, radius, from, to) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            return toCommandResult(replaceNear(player, radius, from.id, usePattern ? to : to.id));
        }
    };
}

const replaceNearCommand = replaceNearVariant("we:replacenear", false);
const ereplaceNearCommand = replaceNearVariant("we:ereplacenear", true);

export { replaceNearCommand, ereplaceNearCommand };
