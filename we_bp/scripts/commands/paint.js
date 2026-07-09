import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { bindPaint } from "../actions/brush.js";

/**
 * Builds a paint or erase tool command entry.
 * @param {string} name The command name.
 * @param {string} kind The tool kind ("paint" or "erase").
 * @param {boolean} usePattern When true, block is a pattern string; else an enum.
 * @returns {object} The command entry.
 */
function paintVariant(name, kind, usePattern) {
    const params = kind === "erase" ? [] : [{ type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }];
    return {
        definition: {
            name,
            description: kind === "erase"
                ? "Bind an erase tool that clears a sphere of blocks."
                : "Bind a paint tool for the surface facing you.",
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

const paintCommand = paintVariant("we:paint", "paint", false);
const epaintCommand = paintVariant("we:epaint", "paint", true);
const eraseCommand = paintVariant("we:erase", "erase", false);

export { paintCommand, epaintCommand, eraseCommand };
