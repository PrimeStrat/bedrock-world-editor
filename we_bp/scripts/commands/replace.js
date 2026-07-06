import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { replaceBlocks } from "../actions/region.js";

/**
 * Builds a selection-replace command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, "to" accepts a pattern string.
 * @returns {object} The command entry.
 */
function replaceVariant(name, usePattern) {
    return {
        definition: {
            name,
            description: "Replace one block with another block" + (usePattern ? " pattern (e.g. 50stone,50cobblestone)" : "") + " inside the selection.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.BlockType, name: "from" },
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "to" }
            ]
        },
        handler(origin, from, to) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            return toCommandResult(replaceBlocks(player, from.id, usePattern ? to : to.id));
        }
    };
}

const replaceCommand = replaceVariant("we:replace", false);
const ereplaceCommand = replaceVariant("we:ereplace", true);

export { replaceCommand, ereplaceCommand };
