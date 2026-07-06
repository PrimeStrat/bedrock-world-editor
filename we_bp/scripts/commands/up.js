import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { goUp } from "../actions/navigation.js";

const upCommand = {
    definition: {
        name: "we:up",
        description: "Rise a number of blocks with a glass platform underfoot.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "distance" }]
    },
    handler(origin, distance) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(goUp(player, distance));
    }
};

export { upCommand };
