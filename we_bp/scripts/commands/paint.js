import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { bindPaint } from "../actions/brush.js";

/**
 * Builds a paint-style tool command entry.
 * @param {string} name The command name.
 * @param {string} kind The tool kind ("paint", "replace", or "erase").
 * @param {boolean} takesBlock When true, the command takes a block/pattern arg.
 * @param {boolean} usePattern When true, block is a pattern string; else an enum.
 * @returns {object} The command entry.
 */
function paintVariant(name, kind, takesBlock, usePattern) {
    const params = [];
    if (takesBlock) {
        params.push({ type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" });
    }
    return {
        definition: {
            name,
            description: kind === "erase"
                ? "Bind an erase tool to your held tool: use it to clear a sphere of blocks."
                : "Bind a " + kind + " tool to your held tool. Paints only the top-most block of each column in the radius.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: params,
            optionalParameters: [
                { type: CustomCommandParamType.Integer, name: "radius" },
                { type: CustomCommandParamType.String, name: "item" }
            ]
        },
        handler(origin, first, second, third) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            if (kind === "erase") {
                return toCommandResult(bindPaint(player, kind, "air", first ?? 3, second ?? ""));
            }
            const block = usePattern ? first : first.id;
            return toCommandResult(bindPaint(player, kind, block, second ?? 3, third ?? ""));
        }
    };
}

const paintCommand = paintVariant("we:paint", "paint", true, false);
const epaintCommand = paintVariant("we:epaint", "paint", true, true);
const replacePaintCommand = paintVariant("we:paintreplace", "replace", true, false);
const ereplacePaintCommand = paintVariant("we:epaintreplace", "replace", true, true);
const eraseCommand = paintVariant("we:erase", "erase", false, false);

export { paintCommand, epaintCommand, replacePaintCommand, ereplacePaintCommand, eraseCommand };
