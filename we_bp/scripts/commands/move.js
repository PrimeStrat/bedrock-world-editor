import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { moveRegion } from "../actions/region.js";

const moveCommand = {
    definition: {
        name: "we:move",
        description: "Move the selection contents. Direction defaults to where you look.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }],
        optionalParameters: [{ type: CustomCommandParamType.Enum, name: "we:direction" }]
    },
    handler(origin, amount, direction) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(moveRegion(player, amount, direction));
    }
};

export { moveCommand };
