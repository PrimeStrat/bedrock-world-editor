import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildPyramid } from "../actions/generation.js";

const pyramidCommand = {
    definition: {
        name: "we:pyramid",
        description: "Build a pyramid at your location. Pass hollow=true for a shell.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.Integer, name: "size" },
            { type: CustomCommandParamType.BlockType, name: "block" }
        ],
        optionalParameters: [
            { type: CustomCommandParamType.Boolean, name: "hollow" },
            { type: CustomCommandParamType.Boolean, name: "includeAir" }
        ]
    },
    handler(origin, size, block, hollow, includeAir) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(buildPyramid(player, size, block.id, Boolean(hollow), Boolean(includeAir)));
    }
};

export { pyramidCommand };
