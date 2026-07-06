import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildPyramid } from "../actions/generation.js";

/**
 * Builds a pyramid command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @param {boolean} hollow Whether only the shell is built.
 * @returns {object} The command entry.
 */
function pyramidVariant(name, usePattern, hollow) {
    return {
        definition: {
            name,
            description: "Build a " + (hollow ? "hollow " : "") + "pyramid from a block" + (usePattern ? " pattern (e.g. 50stone,50cobblestone)" : "") + " at your location.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.Integer, name: "size" },
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }
            ],
            optionalParameters: [{ type: CustomCommandParamType.Boolean, name: "includeAir" }]
        },
        handler(origin, size, block, includeAir) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            return toCommandResult(buildPyramid(player, size, usePattern ? block : block.id, hollow, includeAir ?? true));
        }
    };
}

const pyramidCommand = pyramidVariant("we:pyramid", false, false);
const epyramidCommand = pyramidVariant("we:epyramid", true, false);
const hpyramidCommand = pyramidVariant("we:hpyramid", false, true);
const ehpyramidCommand = pyramidVariant("we:ehpyramid", true, true);

export { pyramidCommand, epyramidCommand, hpyramidCommand, ehpyramidCommand };
