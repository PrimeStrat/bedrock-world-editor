import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildCylinder } from "../actions/generation.js";

/**
 * Builds a cylinder command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @param {boolean} hollow Whether only the wall is built.
 * @returns {object} The command entry.
 */
function cylVariant(name, usePattern, hollow) {
    return {
        definition: {
            name,
            description: "Build a " + (hollow ? "hollow " : "") + "cylinder from a block or pattern.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.Integer, name: "radius" },
                { type: CustomCommandParamType.Integer, name: "height" },
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }
            ],
            optionalParameters: [
                { type: CustomCommandParamType.Location, name: "base" },
                { type: CustomCommandParamType.Boolean, name: "includeAir" }
            ]
        },
        handler(origin, radius, height, block, base, includeAir) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            const b = base ? { x: Math.floor(base.x), y: Math.floor(base.y), z: Math.floor(base.z) } : null;
            return toCommandResult(buildCylinder(player, radius, height, usePattern ? block : block.id, hollow, includeAir ?? true, b));
        }
    };
}

const cylCommand = cylVariant("we:cyl", false, false);
const ecylCommand = cylVariant("we:ecyl", true, false);
const hcylCommand = cylVariant("we:hcyl", false, true);
const ehcylCommand = cylVariant("we:ehcyl", true, true);

export { cylCommand, ecylCommand, hcylCommand, ehcylCommand };
