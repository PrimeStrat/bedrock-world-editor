import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { saveBrushPreset } from "../actions/tools.js";

/**
 * Builds a brush command entry. The plain variant takes a single BlockType; the
 * e-variant takes a String so it accepts patterns like "stone,andesite" and
 * "#gradient" names.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, the block param is a pattern string.
 * @returns {object} The command entry.
 */
function brushVariant(name, usePattern) {
    return {
        definition: {
            name,
            description: usePattern
                ? "Save a brush with a pattern or #gradient block."
                : "Save+equip a named brush on the World Brush item.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.String, name: "name" },
                { type: CustomCommandParamType.Enum, name: "we:brushtype" }
            ],
            optionalParameters: [
                { type: CustomCommandParamType.Enum, name: "we:brushshape" },
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" },
                { type: CustomCommandParamType.Integer, name: "radius" },
                { type: CustomCommandParamType.Integer, name: "height" }
            ]
        },
        handler(origin, name, brushType, shape, block, radius, height) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            const shapeName = shape === "cylinder" || shape === "hcylinder" ? "cylinder" : "sphere";
            const hollow = shape === "hsphere" || shape === "hcylinder";
            const r = radius ?? 4;
            const blockText = block === undefined ? "stone" : (usePattern ? block : block.id);
            return toCommandResult(saveBrushPreset(player, name, brushType, shapeName, blockText, r, height ?? r, hollow, usePattern));
        }
    };
}

const brushCommand = brushVariant("we:brush", false);
const ebrushCommand = brushVariant("we:ebrush", true);

export { brushCommand, ebrushCommand };
