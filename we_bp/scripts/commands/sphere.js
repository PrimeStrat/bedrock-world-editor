import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildSphere } from "../actions/generation.js";

const sphereCommand = {
    definition: {
        name: "we:sphere",
        description: "Build a sphere at your location. Pass hollow=true for a shell.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.Integer, name: "radius" },
            { type: CustomCommandParamType.BlockType, name: "block" }
        ],
        optionalParameters: [
            { type: CustomCommandParamType.Boolean, name: "hollow" },
            { type: CustomCommandParamType.Location, name: "center" },
            { type: CustomCommandParamType.Boolean, name: "includeAir" }
        ]
    },
    handler(origin, radius, block, hollow, center, includeAir) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const c = center ? { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) } : null;
        return toCommandResult(buildSphere(player, radius, block.id, Boolean(hollow), Boolean(includeAir), c));
    }
};

export { sphereCommand };
