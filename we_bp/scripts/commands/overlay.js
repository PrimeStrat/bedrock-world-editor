import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { overlaySelection } from "../actions/region.js";

/**
 * Builds an overlay command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @returns {object} The command entry.
 */
function overlayVariant(name, usePattern) {
    return {
        definition: {
            name,
            description: "Cover each column's surface in the selection.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [{ type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }]
        },
        handler(origin, block) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            return toCommandResult(overlaySelection(player, usePattern ? block : block.id));
        }
    };
}

const overlayCommand = overlayVariant("we:overlay", false);
const eoverlayCommand = overlayVariant("we:eoverlay", true);

export { overlayCommand, eoverlayCommand };
