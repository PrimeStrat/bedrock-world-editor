import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildSphere } from "../actions/generation.js";

/**
 * Builds a sphere command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @param {boolean} hollow Whether only the shell is built.
 * @returns {object} The command entry.
 */
function sphereVariant(name, usePattern, hollow) {
    return {
        definition: {
            name,
            description: "Build a " + (hollow ? "hollow " : "") + "sphere from a block" + (usePattern ? " pattern (e.g. 50stone,50cobblestone)" : "") + " at your location.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.Integer, name: "radius" },
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }
            ],
            optionalParameters: [
                { type: CustomCommandParamType.Location, name: "center" },
                { type: CustomCommandParamType.Boolean, name: "includeAir" }
            ]
        },
        handler(origin, radius, block, center, includeAir) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            const c = center ? { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) } : null;
            return toCommandResult(buildSphere(player, radius, usePattern ? block : block.id, hollow, includeAir ?? true, c));
        }
    };
}

const sphereCommand = sphereVariant("we:sphere", false, false);
const esphereCommand = sphereVariant("we:esphere", true, false);
const hsphereCommand = sphereVariant("we:hsphere", false, true);
const ehsphereCommand = sphereVariant("we:ehsphere", true, true);

export { sphereCommand, esphereCommand, hsphereCommand, ehsphereCommand };
