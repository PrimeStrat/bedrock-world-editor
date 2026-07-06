import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildCylinder } from "../actions/generation.js";

const cylCommand = {
    definition: {
        name: "we:cyl",
        description: "Build a vertical cylinder at your location. Pass hollow=true for a tube.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.Integer, name: "radius" },
            { type: CustomCommandParamType.Integer, name: "height" },
            { type: CustomCommandParamType.BlockType, name: "block" }
        ],
        optionalParameters: [
            { type: CustomCommandParamType.Boolean, name: "hollow" },
            { type: CustomCommandParamType.Location, name: "base" },
            { type: CustomCommandParamType.Boolean, name: "includeAir" }
        ]
    },
    handler(origin, radius, height, block, hollow, base, includeAir) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const b = base ? { x: Math.floor(base.x), y: Math.floor(base.y), z: Math.floor(base.z) } : null;
        return toCommandResult(buildCylinder(player, radius, height, block.id, Boolean(hollow), Boolean(includeAir), b));
    }
};

export { cylCommand };
