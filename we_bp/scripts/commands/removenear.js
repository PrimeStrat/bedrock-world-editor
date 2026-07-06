import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { removeNear } from "../actions/utility.js";

const removeNearCommand = {
    definition: {
        name: "we:removenear",
        description: "Remove a block type within a radius of you.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.BlockType, name: "block" },
            { type: CustomCommandParamType.Integer, name: "radius" }
        ]
    },
    handler(origin, block, radius) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(removeNear(player, block.id, radius));
    }
};

export { removeNearCommand };
