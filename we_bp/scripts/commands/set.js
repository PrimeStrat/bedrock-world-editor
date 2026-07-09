import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setBlocks } from "../actions/region.js";

/**
 * Builds a selection-fill command entry.
 * @param {string} name The command name.
 * @param {string} label The history label.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @returns {object} The command entry.
 */
function setVariant(name, label, usePattern) {
    return {
        definition: {
            name,
            description: "Fill the selection with a block or pattern.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [{ type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }],
            optionalParameters: [{ type: CustomCommandParamType.Boolean, name: "includeAir" }]
        },
        handler(origin, block, includeAir) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            return toCommandResult(setBlocks(player, usePattern ? block : block.id, includeAir ?? true, label));
        }
    };
}

const setCommand = setVariant("we:set", "Set", false);
const esetCommand = setVariant("we:eset", "Set", true);

export { setCommand, esetCommand, setVariant };
