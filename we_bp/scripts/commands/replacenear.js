import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { replaceNear } from "../actions/utility.js";

const replaceNearCommand = {
    definition: {
        name: "we:replacenear",
        description: "Replace one block with another within a radius of you.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.Integer, name: "radius" },
            { type: CustomCommandParamType.BlockType, name: "from" },
            { type: CustomCommandParamType.BlockType, name: "to" }
        ]
    },
    handler(origin, radius, from, to) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(replaceNear(player, radius, from.id, to.id));
    }
};

export { replaceNearCommand };
