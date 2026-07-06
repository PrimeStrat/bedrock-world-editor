import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { stackRegion } from "../actions/clipboard.js";

const stackCommand = {
    definition: {
        name: "we:stack",
        description: "Repeat the selection N times. Direction defaults to where you look.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "count" }],
        optionalParameters: [{ type: CustomCommandParamType.Enum, name: "we:direction" }]
    },
    handler(origin, count, direction) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(stackRegion(player, count, direction));
    }
};

export { stackCommand };
