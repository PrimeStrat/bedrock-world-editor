import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildSelectionShell } from "../actions/region.js";

/**
 * Builds a selection-shell command entry.
 * @param {string} name The command name.
 * @param {string} kind Either "walls" or "faces".
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @returns {object} The command entry.
 */
function shellVariant(name, kind, usePattern) {
    return {
        definition: {
            name,
            description: (kind === "walls" ? "Build the selection's four side walls." : "Build a hollow box shell around the selection."),
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
            return toCommandResult(buildSelectionShell(player, usePattern ? block : block.id, includeAir ?? true, kind));
        }
    };
}

const wallsCommand = shellVariant("we:walls", "walls", false);
const ewallsCommand = shellVariant("we:ewalls", "walls", true);

export { wallsCommand, ewallsCommand, shellVariant };
